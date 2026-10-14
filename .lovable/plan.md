# Shortizereel — filmflödet, uppdaterad plan (steg 1, 1b och 2 klara, steg 3–7 kvar)

Varje steg körs för sig. Efter varje steg körs vitest, typkontroll, lint och bygge, och sedan stannar jag. I testerna är alla tjänster mockade. Inga skarpa generationer körs.

Invarianter som gäller i alla steg:
- Renderspärren och kontinuitetsrapporten är bara rådgivande.
- `StoryState` skickas aldrig till webbläsaren.
- Kanonreglerna gäller.
- Inga nya beroenden.
- Musik och ljudeffekter ingår inte i den här planen.

Ägarbeslut:
- EZY kostar 14 per scen, alltså 70 för en film med 5 scener.
- De 17 publicerade scenklippen är avpublicerade (går att ångra).
- Berättarrösten är 10–12 svenska ord per scen, och klippen förblir 5 s.
- En saknad röst blockerar inte `ready`, men det visas tydligt.
- Ingen cron: scenjobben drivs av att ägaren öppnar filmen (Väg A).

---

## Steg 1 — klart (ägare, status, dagsgräns)

- `stories.user_id` och `stories.status` med CHECK, backfill från `director_sessions.user_id`.
- `film_daily_quota` med `claim_film_slot` / `release_film_slot`.
- `buildFilm`, `renderScene`, `recoverScene` kräver inloggning och ägare.

## Steg 1b — klart

- Inget anspråk via session_id; film utan ägare = "legacy film — read-only / äldre film — endast läsbar" (visas, renderas inte).
- `renderSceneCore` / `recoverSceneCore` utan middleware, kontrollerar `stories.user_id` själva; `renderScene` / `recoverScene` / `approveRecovery` är auth-ytor.
- `buildFilmCore` ligger i `src/lib/film.functions.ts` och tar ett uttryckligt `user_id`.

---

## Steg 2 — klart (inkl. 2b)

Byggt och verifierat:
- Migration `atomic_coins`: `spend_coins` / `refund_coins` (endast service_role). Verifierat externt i en återrullad transaktion: bonus först, otillräckligt saldo → ingen rad, kostnad 0 → ingen rad, återbetalning exakt.
- `generations.deadline_at`, `attempts`, `charged_bonus`, `charged_paid`, `refunded`.
- `src/lib/pricing.ts` (EZY_SCENE_COST = 14, FILM_COST = 70) är enda priskällan; `generateVideo` använder de atomiska funktionerna.
- `startFilmRender`: idempotent, förhandskontroll av saldo, debitering per scen via `renderSceneCore`.
- Tick-policy i `src/lib/scene-job.ts` (ren) och `src/lib/scene-job.server.ts`.
- `checkStatus` publicerar bara klipp med `story_id is null`.
- 2b: `episodes.hidden`; de 17 scen-avsnitten är dolda (ångras med samma WHERE och `hidden = false`).

### Ersätter cron-planen: Väg A, ingen cron

- Ingen pg_cron, ingen pg_net, inget Vault. Cron-hemligheten lagras aldrig i databasen.
- `/api/public/hooks/film-tick` får ligga kvar men schemaläggs inte.
- Scenjobben drivs framåt när **ägaren** pollar `getFilm`:
  - `getFilm` behåller sin publika läsväg via session_id (ingen krav-middleware; anonyma läsningar fungerar som i dag). Den läser valfritt den inloggade användaren från bearer-token som redan bifogas.
  - Bara när den inloggade användaren är `stories.user_id` körs tick-logiken, och bara för den filmens pågående generationer: hämta klara klipp (publiceras aldrig), 30-minutersdeadline, högst 2 nya försök via `renderSceneCore` som ägaren, återbetalning, ny beräkning av `stories.status`.
  - Icke-ägare och anonyma triggar aldrig ticken.
- `runFilmTick` delas upp: `tickFilm(story_id, now)` gör jobbet för en film; routen som inte schemaläggs loopar över den.
- Idempotent och säkert vid samtidiga pollningar:
  - Klart klipp: `UPDATE ... SET status='completed' WHERE id=? AND status IN ('queued','processing')` — bara den poll som får tillbaka raden räknas.
  - Misslyckande och återbetalning: villkorlig UPDATE på status plus `refunded = false` i WHERE; bara vinnaren återbetalar.
  - Nytt försök: claim med `UPDATE ... SET attempts = attempts + 1 WHERE id=? AND attempts = <läst värde>`; bara vinnaren anropar `renderSceneCore`.
  - Fel i ticken loggas och stoppar aldrig `getFilm`; filmvyn returneras alltid.
- Känd avvägning (dokumenterad): öppnar ingen filmen, hämtas klippen vid nästa besök. Deadline och återbetalning sker då i efterhand, med samma slutresultat.

---

## Steg 3 — Manus: exakt 5 svenska scener

I `buildFilmCore` och `createFilm`:
- Strikt schema: exakt 5 scener, `act` beginning ×2, middle, end ×2, en huvudroll.
- Titel, idé och berättartext på svenska; videoprompt på engelska.
- Mallläget ger samma struktur. Validator i `src/lib/film-script.ts`; AI får ett nytt försök innan mallen används.

**Tester:** `tests/film-script.test.ts`.

---

## Steg 4 — Karaktärsbibliotek

Migration `character_library`:
- `characters(id, user_id, name, description, reference_path, idempotency_key, created_at)`, `unique(user_id, lower(name))`, `unique(user_id, idempotency_key)`, GRANT, RLS med `auth.uid()`.
- `stories.character_id` nullable, `on delete set null`.

`createCharacter` i `src/lib/character.functions.ts`: inloggning, idempotent, porträtt via `generateReferenceImage`, uppladdning före insättning (städas vid fel), debitering via `spend_coins`/`refund_coins`. Pris väntar på ditt besked.

Seeding: porträttet blir en `film_canon_assets`-rad med `kind = "front"`, en gång via seed-vägen i `canon.functions.ts`.

**Tester:** `tests/character-library.test.ts`.

---

## Steg 5 — Bildstyrning

- `google/gemini-omni-1.1-flash` med `input` = text + `{type:"image",data:<base64>,mime_type}`; bildroll via `<IMAGE_REF_0>`; `"5s"`, `"9:16"`.
- `PROVIDER_ACCEPTS_IMAGE_REFERENCES.lovable = true`.
- Saknad bild → scenen `failed` med "reference pack missing", återbetalning, ingen tyst reträtt till text.

**Tester:** `tests/omni-request.test.ts`.

---

## Steg 6 — Berättarröst

- 10–12 svenska ord per scen, validerat med ett nytt försök.
- TTS `google/gemini-3.1-flash-tts-preview`; varm man → Charon, dramatisk kvinna → Kore, neutral → Puck. `profiles.voice_preference` med CHECK.
- Saknad röst blockerar inte `ready`; märket "Berättarröst saknas / Voice-over missing" visas.

**Tester:** `tests/narration.test.ts`.

---

## Steg 7 — Gränssnitt och publicering

**E. Migration `story_publish`:** `stories.published_at timestamptz null`.
- `publishReadyFilm` / `unpublishFilm`: inloggning, ägare, filmen måste vara `ready`.
- `listReadyFilms` (publik): bara `status = 'ready' AND published_at IS NOT NULL`; titel, karaktärsnamn, signerade klipp-URL:er, märke för saknad röst. Ingen kanon.

**F. Migration `story_error`:** `stories.error_message text null`.
- Skrivs av `renderSceneCore` vid fel när jobbet skickas, och av `checkStatus` och den getFilm-drivna ticken vid slutgiltigt scenfel.
- Rensas (null) när filmen renderas om.
- Text på sv/en, utan tekniska detaljer.

**Laddningssida:**
- Pollar befintliga `getFilm` var 3:e sekund. Ingen ny endpoint.
- Visar "Skriver berättelse / Writing the story" och sedan "Genererar scen N av 5 / Generating scene N of 5" utifrån status per scen (getFilm läser redan generations).
- Går till filmen när `status = ready`; visar `error_message` som avfärdbar varning när `status = failed`.
- Slutar polla när sidan lämnas eller filmen är klar/misslyckad.

**Övrigt gränssnitt:**
- "Skapa ny film": låses vid tryck, idempotensnyckel, inloggning och krediter kontrolleras först.
- Karaktärssidor: `src/routes/_authenticated/characters.tsx` och `characters.$id.tsx`.
- `vibe.shorts.tsx` som vertikalt flöde: fem klipp i ordning med röst, karaktärsnamn, volym/ljud av, ljudlös autoplay på mobil vid blockering, bara synligt kort spelas, ingen generering vid scroll.

**Tester:**
- `tests/ready-feed.test.ts`: opublicerade exkluderas, klipp i ordning, ingen kanon, röstmärke finns.
- `tests/film-tick-poll.test.ts` (beteende, mockade tjänster):
  - Två samtidiga `getFilm`-pollningar ger inte dubbla nya försök eller dubbla återbetalningar.
  - `getFilm` från icke-ägare eller anonym driver inte jobben framåt.
  - `error_message` sätts vid fel vid start och vid slutgiltigt fel, och rensas vid omrendering.

---

## Miljövariabler

Inga nya.

## Öppen fråga

Priset för ett karaktärsporträtt, som behövs före steg 4.
