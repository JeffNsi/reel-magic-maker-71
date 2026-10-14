# Shortizereel — filmflödet, uppdaterad plan (steg 1 klart, steg 1b–7 kvar)

Varje steg körs för sig. Efter varje steg körs vitest, typkontroll, lint och bygge, och sedan stannar jag. I testerna är alla tjänster mockade. Inga skarpa generationer körs.

Invarianter som gäller i alla steg:
- Renderspärren och kontinuitetsrapporten är bara rådgivande.
- `StoryState` skickas aldrig till webbläsaren.
- Kanonreglerna gäller.
- Inga nya beroenden.
- Musik och ljudeffekter ingår inte i den här planen.

Ägarbeslut:
- EZY kostar 14 per scen, alltså 70 för en film med 5 scener.
- De 17 redan publicerade scenklippen avpubliceras, och det går att ångra.
- Berättarrösten är 10–12 svenska ord per scen, och klippen förblir 5 s.
- En saknad röst blockerar inte `ready`, men det visas tydligt.

---

## Steg 1 — klart (ägare, status, dagsgräns)

Det här är redan byggt:
- `stories.user_id` och `stories.status`, med CHECK.
- Backfill från `director_sessions.user_id`.
- `film_daily_quota` med `claim_film_slot` och `release_film_slot`.
- `buildFilm`, `renderScene` och `recoverScene` kräver inloggning.
- Testerna i `tests/film-quota.test.ts`.

## Steg 1b — rättelser till steg 1

**F. Inget anspråk via session_id.**
- I `assertFilmOwner` i `src/lib/film.functions.ts` tas grenen `claim` bort.
- Bara `user_id = userId` släpps igenom.
- En film utan ägare ger "legacy film — read-only / äldre film — endast läsbar".
- `ownershipDecision` i `src/lib/film-quota.ts` returnerar `allow` eller `deny`. Ett saknat ägar-id räknas som `deny`, och testet uppdateras.
- Gamla filmer kan fortfarande visas med session_id som idag.
- Ingen `claimLegacyStories` byggs.

**B. Dela upp `renderScene`.**
- En ny intern `renderSceneCore({film_id, scene_id, session_id, engine, audio, user_id})` i `src/lib/film.functions.ts`, utan middleware. Den kontrollerar själv att `stories.user_id = user_id`.
- `renderScene` blir det yttre skalet: auth-middleware och ett anrop till kärnan med `context.userId`.
- Kärnan används av:
  - `src/lib/recovery.functions.ts`, där `recoverScene` skickar `context.userId`.
  - `src/routes/api/internal/pipeline-audit.ts`.
  - Cron-tick i steg 2, med filmens lagrade `user_id`.
- `pipeline-audit.ts` och `scripts/fidelity-test.ts` anropar `buildFilmCore` med filmens eller testets `user_id`.

**C.** `buildFilmCore` ligger i `src/lib/film.functions.ts`. Alla hänvisningar i planen pekar dit.

**Tester:** `tests/film-ownership.test.ts`:
- En film utan ägare nekas att renderas.
- En främling nekas.
- Kärnan kontrollerar ägaren även utan middleware.

---

## Steg 2 — atomisk debitering, orkestrering, slut på autopublicering

**A. Migration `atomic_coins`.**

```sql
CREATE FUNCTION public.spend_coins(_user uuid, _cost int)
RETURNS TABLE(bonus_spent int, paid_spent int)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.profiles p
     SET bonus_coins = p.bonus_coins - least(p.bonus_coins, _cost),
         paid_coins  = p.paid_coins  - (_cost - least(p.bonus_coins, _cost))
   WHERE p.id = _user AND p.bonus_coins + p.paid_coins >= _cost AND _cost > 0
  RETURNING least(p.bonus_coins + least(p.bonus_coins,_cost), _cost) - 0, _cost - least(p.bonus_coins + least(p.bonus_coins,_cost), _cost);
$$;
CREATE FUNCTION public.refund_coins(_user uuid, _bonus int, _paid int) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.profiles SET bonus_coins = bonus_coins + greatest(_bonus,0),
                             paid_coins  = paid_coins  + greatest(_paid,0)
   WHERE id = _user;
$$;
REVOKE EXECUTE ON FUNCTION public.spend_coins(uuid,int), public.refund_coins(uuid,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_coins(uuid,int), public.refund_coins(uuid,int,int) TO service_role;
```

Fördelningen mellan bonus och betalda mynt räknas ut från de gamla värdena inne i samma UPDATE. Bonus används först. Om ingen rad kommer tillbaka räckte saldot inte. Den exakta `RETURNING`-satsen skrivs om med en CTE (`WITH old AS (SELECT … FOR UPDATE)`) så att den bara räknar på före-värden, och den testas.

Samma migration lägger också till fyra kolumner på `generations`:
- `deadline_at timestamptz null`
- `attempts int default 0`
- `charged_bonus int default 0`
- `charged_paid int default 0`
- `refunded boolean default false`

**Ett pris, en konstant.**
- `src/lib/pricing.ts` (ny): `EZY_SCENE_COST = 14` och `FILM_COST = 5 * EZY_SCENE_COST`.
- `SHOT_COST`, `credit_cost` och `costFor` i `film.functions.ts` läser konstanten.
- Det gör också `ScenePlaneView.ezy_credits` och texten "Render with Ezy" i `scene-engine.tsx`.
- Startsidans copy läser redan prisets konstant och visar fortfarande 70 per film.
- `generateVideo` behåller 70 och går över till `spend_coins`/`refund_coins` i stället för att läsa och sedan skriva. Filen är `src/lib/storyreel.functions.ts` (eller där `generateVideo` ligger, `vibe.functions.ts`).

**`startFilmRender({story_id})`** i `src/lib/film-render.functions.ts`:
1. Kräver inloggning och att du äger filmen.
2. Är idempotent: scener som redan pågår eller är klara hoppas över.
3. Gör en förhandskontroll: `saldo ≥ kvar × 14`, annars `needs_credits`. Det sker innan något startas.
4. För varje scen körs `spend_coins` och sedan `renderSceneCore`. Om jobbet avvisas innan leverantören tagit betalt körs `refund_coins`, och `refunded = true` sätts.
5. `stories.status` sätts till `generating`.

**Cron `src/routes/api/public/hooks/film-tick.ts`:**
- Skyddas med `cron-auth.ts`.
- Varje körning tar högst N jobb, och gemensam logik ligger i `src/lib/scene-job.server.ts`.
- Deadline är 30 min, med högst 2 nya försök via `renderSceneCore` (filmens `user_id`). Därefter blir jobbet `failed` och krediterna återbetalas, bara om det inte finns något renderat resultat.
- Filmen blir `ready` bara när alla scener har ett `completed` och sparat klipp.
- Tick-funktionen debiterar inte själv, utom vid omstart via kärnan, som återbetalar vid fel.
- Cron-jobbet sätts upp med run_sql efter ditt godkännande.

**`checkStatus`:**
- Den publicerar bara klipp med `story_id is null`.
- Filmer publiceras bara via `publishReadyFilm`, se steg 7.

**Datasteg 2b (separat, och bara efter ditt ja):** avpublicera de 17 scenklippen.
- Migrationen lägger till `episodes.hidden boolean not null default false`.
- Data-SQL:

```sql
UPDATE public.episodes e SET hidden = true
FROM public.generations g
WHERE e.source_generation_id = g.id AND g.story_id IS NOT NULL AND e.hidden = false;
-- Ångra: samma WHERE med hidden = true → SET hidden = false
```

- `listEpisodes`/`getEpisodesForUser` i `vibe.functions.ts` filtrerar bort `hidden = true`.

**Tester:**
- `tests/coins-atomic.test.ts`: bonus används först, för lite saldo ger ingen debitering, två samtidiga tryck debiterar en gång, återbetalningen blir rätt.
- `tests/film-render.test.ts`: idempotent, klara scener hoppas över, 14 per scen, förhandskontroll.
- `tests/scene-job.test.ts`: deadline och nya försök.
- `tests/checkstatus-publish.test.ts`: scenklipp publiceras aldrig.
- `tests/pricing.test.ts`: priset som visas är samma som det som debiteras.

---

## Steg 3 — Manus: exakt 5 svenska scener

I `buildFilmCore` och `createFilm` i `src/lib/film.functions.ts`:
- Det strikta schemat kräver exakt 5 scener, med `act` i ordningen beginning ×2, middle, end ×2.
- Det kräver en huvudroll.
- Titel, idé och berättartext är på svenska. Videoprompten är på engelska.

Mallläget ger samma struktur. Validatorn ligger i `src/lib/film-script.ts`, och AI får ett nytt försök en gång innan mallen används.

**Tester:** `tests/film-script.test.ts`.

---

## Steg 4 — Karaktärsbibliotek

Tabellen `characters` gäller som tidigare. `universe_versions` är fel form för det här.

Migration `character_library`:
- `characters(id, user_id, name, description, reference_path, idempotency_key, created_at)`
- `unique(user_id, lower(name))` och `unique(user_id, idempotency_key)`
- GRANT, RLS med `auth.uid()`
- `stories.character_id` nullable, med `on delete set null`

**`createCharacter`** i `src/lib/character.functions.ts`:
- Kräver inloggning och är idempotent.
- Ett porträtt skapas med `generateReferenceImage`.
- Uppladdningen sker innan raden läggs in. Om insättningen misslyckas städas filen bort.
- Debitering och återbetalning sker med `spend_coins`/`refund_coins`. Priset sätts i `pricing.ts` och väntar på ditt besked.

**D. Seeding:**
- Porträttet läggs till som en `film_canon_assets`-rad med `kind = "front"`, eftersom det är ett frontalt porträtt. Det är ett av `CHARACTER_PACK_KINDS`, så `loadResolverCanon` hittar det.
- Det sker en gång, via seed-vägen i `canon.functions.ts`.

**Tester:** `tests/character-library.test.ts`:
- Kind är ett giltigt pack-kind.
- Ingen rad skapas om uppladdningen misslyckas.
- Samma nyckel ger samma rad, och namn är unika per användare.

---

## Steg 5 — Bildstyrning (bekräftad request-form)

`google/gemini-omni-1.1-flash` tar `input` som en lista av delar: text plus `{type:"image",data:<base64>,mime_type}`.
- Bilder skickas bara som inbäddad base64. URL:er avvisas.
- Bildens roll binds med `<IMAGE_REF_0>`.
- `duration "5s"` och `aspect_ratio "9:16"` är giltiga.

`PROVIDER_ACCEPTS_IMAGE_REFERENCES.lovable = true`. Porträttet och den kanoniska beskrivningen skickas i varje scen.

Om bilden saknas blir scenen `failed` med "reference pack missing", krediterna återbetalas, och ingen tyst reträtt till bara text sker.

**Tester:** `tests/omni-request.test.ts`.

---

## Steg 6 — Berättarröst

`generations.voiceover_url` och `narration` återanvänds.

Efter ett klipp skrivs en text på **10–12 svenska ord**. Den skapas med standardmodellen för text, och ordantalet valideras med ett nytt försök högst en gång.

**TTS:** `google/gemini-3.1-flash-tts-preview` ersätter `narrateGeneration` i `story.functions.ts`. Föreslagen röstmappning:
- varm man → `Charon`
- dramatisk kvinna → `Kore`
- neutral → `Puck`

Rösterna verifieras mot listan vid bygget.

`profiles.voice_preference` får en CHECK.

**Om rösten saknas:** filmen kan ändå bli `ready`. Filmsidan och flödet visar märket "Berättarröst saknas / Voice-over missing" per scen och per film.

**Tester:** `tests/narration.test.ts`:
- 10–12 ord.
- Röstmappningen.
- Request body i Gemini-form.
- En saknad röst blockerar inte `ready`, men märks.

---

## Steg 7 — Gränssnitt och publicering

**E. Migration `story_publish`:** `stories.published_at timestamptz null`.
- `publishReadyFilm` / `unpublishFilm` kräver inloggning och att du äger filmen, och filmen måste vara `ready`.
- `listReadyFilms` (publik) visar bara filmer med `status = 'ready' AND published_at IS NOT NULL`.
- Den lämnar ut titel, karaktärsnamn, signerade klipp-URL:er och om rösten saknas. Ingen kanon lämnas ut.
- En klar film som inte är publicerad förblir privat.

**Gränssnittet:**
- **"Skapa ny film":** knappen låses vid tryck och skickar en idempotensnyckel. Inloggning och krediter kontrolleras innan. En förloppsvy visar scen 1–5.
- **Karaktärssidor:** `src/routes/_authenticated/characters.tsx` och `characters.$id.tsx`.
- **`vibe.shorts.tsx`** blir ett vertikalt flöde:
  - Fem klipp spelas i ordning med röst.
  - Karaktärsnamnet visas ovanför.
  - Volym och ljud av/på finns.
  - På mobil startar spelningen ljudlöst om autoplay blockeras.
  - Bara det synliga kortet spelas.
  - Ingen generering vid scrollning.

**Tester:** `tests/ready-feed.test.ts`:
- Opublicerade filmer exkluderas.
- Klippen kommer i ordning.
- Ingen kanon i svaret.
- Märket för saknad röst finns med.

---

## Miljövariabler

Inga nya.

## Öppen fråga

Priset för ett karaktärsporträtt, som behövs före steg 4.
