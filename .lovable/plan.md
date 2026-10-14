# Shortizereel — filmflödet, i sju små steg som går att backa

Varje steg körs för sig. Efter varje steg körs vitest, typkontroll, lint och bygge, och sedan stannar jag. I testerna är alla tjänster som video, bild, TTS, text och fal mockade. Inga skarpa generationer körs.

Invarianter som gäller i alla steg:
- `renderScene` ändras bara i steg 2, där den nämns vid namn.
- Renderspärren och kontinuitetsrapporten är bara rådgivande.
- `StoryState` skickas aldrig till webbläsaren.
- Kanonreglerna gäller.
- Inga nya beroenden. Krediter och betalningar rörs bara där du har bett om det (steg 2: debitering per scen).

---

## Steg 1 — Ägarskap, status och dagsgräns

**Migration `stories_ownership_status`** (bara tillägg):
- `stories.user_id uuid null` och ett index på `(user_id, created_at)`.
- `stories.status text not null default 'queued'`, med `CHECK (status in ('queued','generating','ready','failed'))`.
- Backfill i samma migration:
  - `status`: `ready` om varje scen har en `completed` generation, annars `failed` om någon scen har misslyckats, annars `queued`.
  - `user_id`: hämtas från `director_sessions.user_id` via `stories.director_session_id`, där en sådan finns.
- Ny tabell `film_daily_quota(user_id uuid, day date, count int, primary key(user_id, day))`. Den får GRANT till service_role och RLS utan policies, så bara servern kommer åt den.
- Ny funktion `public.claim_film_slot(_user uuid) returns boolean`, SECURITY DEFINER:
  `INSERT … VALUES (_user, current_date, 1) ON CONFLICT (user_id, day) DO UPDATE SET count = film_daily_quota.count + 1 WHERE film_daily_quota.count < 3 RETURNING true`. Om ingen rad kommer tillbaka returneras false.
- Ny funktion `public.release_film_slot(_user uuid)`, som minskar räknaren med 1 (dock inte under 0).
- RLS på `stories`: `SELECT TO authenticated USING (user_id = auth.uid())`. Den befintliga åtkomsten via session_id ligger kvar som läsväg genom servern under en övergångsperiod.

**Gamla filmer med bara session_id** (backfill-strategi):
- Hittas ägaren via `director_sessions` sätts `user_id` i migrationen.
- Övriga får `user_id` när en inloggad användare öppnar filmen från samma webbläsare. Det sker med ny serverfunktion `claimLegacyStories({session_id})`: den sätter `user_id` bara där `user_id is null` och `session_id` matchar.
- Det som ingen gör anspråk på förblir läsbart med session_id, men går inte att rendera.

**Auth på serverfunktioner:**
- `renderScene`, `buildFilm` och `recoverScene` får `requireSupabaseAuth` och en ägarkontroll (`user_id = userId`).
- Promptgenerering, export och `/share/$slug` förblir öppna, enligt kontraktet.

**Regel för misslyckade förfrågningar:**
- Platsen tas innan filmen skapas.
- Om skapandet sedan misslyckas av ett skäl som inte är användarens fel (tjänsten är nere, svaret går inte att läsa) anropas `release_film_slot`, och platsen räknas inte.
- Ogiltig indata räknas inte heller, eftersom kontrollen sker innan platsen tas.
- Ett 402/403 från AI efter att platsen tagits frisläpper också platsen.

**Filer:**
- `src/lib/film.functions.ts`: auth-middleware och ägarkontroll. **`renderScene` ändras här** — namngiven, och bara middleware och ägarkontroll läggs till.
- `src/lib/story.functions.ts`: `buildFilmCore` anropar claim/release; nya `claimLegacyStories`.
- `src/lib/recovery.functions.ts`: auth.
- `src/lib/film-quota.ts`: ren policyfunktion, ny fil.
- Anropare, som `src/routes/film.$filmId.tsx` och `scene-engine.tsx`, skickar session_id som innan; token läggs på av befintlig middleware.

**Tester** (`tests/film-quota.test.ts`, `tests/film-ownership.test.ts`):
- Den fjärde skapelsen samma dag nekas.
- Ett misslyckande frisläpper platsen.
- Ogiltig indata räknas inte.
- Den som inte äger filmen får 403, och render nekas.
- Backfill-mappningen av status.

**Miljövariabler:** inga nya.

---

## Steg 2 — Orkestrering och slut på autopublicering

**Migration `scene_jobs`** (bara tillägg):
- `generations.deadline_at timestamptz null`, `generations.attempts int not null default 0`, `generations.charged_coins int not null default 0` och `generations.refunded boolean not null default false`.
- `story_scenes.generation_id` finns redan och fortsätter peka på senaste jobbet.

**Ny `startFilmRender({story_id})`** i `src/lib/film-render.functions.ts`:
1. Kräver inloggning och att du äger filmen.
2. Är idempotent: scener som redan har ett jobb som pågår eller är klart hoppas över.
3. Gör en förhandskontroll: saldot måste räcka för `kvarvarande scener × scenpris`, annars returneras `needs_credits` och UI skickar dig till `/vibe/rewards`. Det sker innan något startas.
4. För varje scen debiteras scenpriset med den befintliga debiteringshjälpen i `vibe.functions`/`credits.ts`, och sedan startas jobbet via `startGeneration`.
   - Om tjänsten avvisar själva anropet, så att ingen kostnad har uppstått hos leverantören, återbetalas krediterna direkt och `refunded=true` sätts.
5. `stories.status` sätts till `generating`.

**Pris per scen:** Ett befintligt scenpris (`story_scenes.credit_cost`) används. Exakt summa per scen behöver ditt besked (se öppna frågor).

**Cron-ruta `src/routes/api/public/hooks/film-tick.ts`:**
- Skyddas med `src/integrations/supabase/cron-auth.ts`.
- Varje körning tar högst N jobb i `queued`/`processing`.
- Den anropar `providerProgress` och sparar klippet med samma logik som i `checkStatus`, utbruten till `src/lib/scene-job.server.ts`.
- Deadline är 30 minuter. Efter den räknas ett nytt försök, högst 2 gånger. Därefter blir jobbet `failed` och krediterna återbetalas, bara om leverantören rapporterat fel innan något renderats.
- Filmens status räknas om: `ready` bara när varje scen har en `completed` generation med en sparad `storage_path`/`video_url`; `failed` om någon scen har slut på försök; annars `generating`.
- Själva cron-jobbet sätts upp med run_sql efter att du godkänt, varje minut.
- Ett rent tidsanrop (tick) får inte debitera eller ta bort något. Det är idempotent, eftersom bearer-token bara är ett filter.

**`checkStatus` i `src/lib/storyreel.functions.ts`:**
- Publiceringsgrenen körs bara när `story_id is null`, det vill säga för enstaka klipp.
- Scenklipp publiceras aldrig.
- En ny `publishReadyFilm` gör filmen till ett avsnitt först när den är `ready`.
- De 17 redan publicerade scenklippen rörs inte, eftersom det vore en dataändring. Jag föreslår att avpublicera dem som ett separat steg, men bara efter ditt ja.

**Den fastnade generationen från 2026-09-13** markeras `failed` av tick-funktionen via deadline-regeln. Det är ingen manuell radering.

**Tester:** `tests/film-render.test.ts`, `tests/scene-job.test.ts`, `tests/checkstatus-publish.test.ts`:
- Idempotens: två anrop ger en debitering per scen.
- Klara scener hoppas över.
- Förhandskontrollen nekar för lågt saldo.
- Återbetalning sker vid fel innan leverantören har kostat något.
- Deadline och högst 2 nya försök.
- Status blir `ready` bara när alla 5 scener har sparade klipp.
- Scenklipp publiceras inte.

---

## Steg 3 — Manus: exakt 5 svenska scener

I `src/lib/story.functions.ts` (`buildFilmCore`):
- Det strikta json_schema kräver exakt 5 scener med `minItems=maxItems=5` och fasen `act: beginning|middle|end`, i ordningen 1–2 början, 3 mitt, 4–5 slut.
- Det kräver också precis en huvudrollsfigur och `language: "sv"` för titel, idé och berättarröst. Videoprompten förblir engelsk, eftersom det rekommenderas för modellen.

**Mallläget** (utan AI eller krediter) ger samma struktur deterministiskt.

**Ren validator `src/lib/film-script.ts`:**
- Den normaliserar och avvisar svaret.
- Om AI ger fel antal scener görs ett nytt anrop högst en gång, sedan används mallen med en varningsbadge.

**Tester:** `tests/film-script.test.ts`:
- 5 scener.
- Faserna kommer i rätt ordning.
- En huvudroll.
- Mallen faller tillbaka korrekt.
- Kanonfixarna ligger kvar (payoffs, identitet, `based_on_version`).

---

## Steg 4 — Karaktärsbibliotek

**Rekommendation: ny tabell `characters`, inte `universe_versions`.** `universe_versions` är en ögonblicksbild av ett helt universum, som läggs till och aldrig ändras, och den är spärrad för Creator. Ett bibliotek behöver enskilda rader som går att adressera med eget id, en unik nyckel per användare och en bild. Universum kan senare läsa från biblioteket.

**Migration `character_library`:**
- `characters(id uuid pk, user_id uuid not null, name text not null, description text not null, reference_path text not null, idempotency_key text not null, created_at timestamptz default now(), unique(user_id, lower(name)), unique(user_id, idempotency_key))`.
- GRANT select, insert, delete till authenticated och all till service_role.
- RLS: alla policies med `user_id = auth.uid()`.
- `stories.character_id uuid null references characters(id) on delete set null`, så att gamla filmer förblir giltiga.

**Ny `createCharacter({name, description, idempotency_key})`** i `src/lib/character.functions.ts`, med auth:
1. Ett befintligt id för samma nyckel returneras direkt.
2. Ett porträtt genereras med befintliga `generateReferenceImage` i `canon-assets.server.ts`, en bild.
3. Bilden laddas upp till bucketen `films` under `characters/{user}/{uuid}.png`.
4. Raden läggs in först efter att uppladdningen lyckats. Misslyckas insättningen tas filen bort.
5. Krediter debiteras för en bild, med återbetalning om genereringen misslyckas (pris enligt öppna frågor).

**Seeding:** När en film startas med `character_id` skapas huvudrollen i `film_canon_characters` från karaktärens beskrivning. Porträttet läggs till som en `film_canon_assets`-rad, `kind=closeup`, med samma sökväg. Det sker en gång och via den befintliga seed-vägen i `canon.functions.ts`. Därefter är de sparade raderna sanningen.

**Tester:** `tests/character-library.test.ts`:
- Ingen rad skapas om uppladdningen misslyckas.
- Filen tas bort om insättningen misslyckas.
- Samma nyckel ger samma rad.
- Namn är unika per användare.
- Seeding sker en gång.
- Låsta fält skrivs inte över.

---

## Steg 5 — Bildstyrning till video (bekräftat)

Gatewayens dokumentation för `google/gemini-omni-1.1-flash` på `/v1/videos` säger:
- `input` kan vara en lista av delar: `{type:"text",text}` och `{type:"image",data:"<base64>",mime_type:"image/png"}`, med högst 10 bilder.
- **Bara inbäddad base64.** En `uri` eller signerad URL avvisas med 400.
- Bildens roll binds i prompten med `<IMAGE_REF_0>`. Vid behov sätts `generation_config.video_config.task="reference_to_video"`.
- `duration` är `"3s"`–`"10s"` som sträng. `"5s"` och `aspect_ratio "9:16"` är alltså giltiga.

**Ändringar i `src/lib/storyreel-core.server.ts`:**
- `PROVIDER_ACCEPTS_IMAGE_REFERENCES.lovable = true`.
- `submitLovableVideo(prompt, audio, images: {base64, mime}[])` skickar en lista av delar när det finns bilder. Prompten inleds med `[# References <IMAGE_REF_0>@Image1]`, och samma kanoniska beskrivning av huvudrollen läggs in i varje scen.
- Bilder hämtas från lagringen på servern och kodas till base64, med en storleksgräns.

**Ingen tyst reträtt till bara text.** Om en film har en karaktär men bilden inte går att läsa blir scenen `failed` med meddelandet "reference pack missing", och krediterna återbetalas. Utan karaktär är det som idag, och scenen märks "text-only continuity".

fal och live förblir `false`.

**Tester:** `tests/omni-request.test.ts`:
- Svaret har exakt den formen, utan URI-fält.
- Taggen `<IMAGE_REF_0>` och beskrivningen finns med.
- Saknad bild ger fel, inte text.
- Mockad fetch.

---

## Steg 6 — Berättarröst

`generations.voiceover_url` och `narration` återanvänds, och ingen ny tabell skapas. Det finns en röst per klipp, och spelaren läser redan dessa fält.

Efter att ett klipp sparats i tick-funktionen skrivs en svensk berättartext på 20–30 ord. Den skapas med standardmodellen för text och struct-schema, och ordantalet valideras. Därefter görs talet.

**TTS:** `google/gemini-3.1-flash-tts-preview` ersätter den utfasade `openai/gpt-4o-mini-tts`, med Gemini-format (`contents` + `speechConfig`, buffrad WAV). Den lagras i `videos`.

Föreslagen röstmappning (verifieras mot listan vid bygget):
- varm man → `Charon`
- dramatisk kvinna → `Kore`
- neutral → `Puck`

Tonen styrs i texten, till exempel "Säg varmt och lugnt: …".

**Migration:** `profiles.voice_preference text not null default 'neutral'` med `CHECK in ('warm_male','dramatic_female','neutral')`.

**Fel:**
- Om rösten misslyckas räknas klippet ändå som klart, och filmen kan bli `ready`. Rösten saknas och en varning visas.
- 402/403 gör inga nya försök.

**Filer:** `src/lib/story.functions.ts` (`narrateGeneration` byter modell), `src/lib/narration.server.ts` (ny) och `scene-job.server.ts`.

**Tester:** `tests/narration.test.ts`:
- 20–30 ord.
- Röstmappningen.
- Request body i Gemini-form.
- Ett TTS-fel blockerar inte `ready`.

---

## Steg 7 — Gränssnitt

**"Skapa ny film"** i `src/routes/index.tsx`/`studio.tsx`:
- Knappen låses vid tryck, och samma klientgenererade nyckel skickas.
- Inloggning och kreditkontroll sker innan. Saknas inloggning skickas du till `/auth`; för lite krediter skickar dig till `/vibe/rewards`.
- En förloppsvy visar scen 1–5 och filmens status. Den frågar efter status från tick-funktionen, men startar ingen generering.

**Karaktärssidan:** `src/routes/_authenticated/characters.tsx` och `characters.$id.tsx`, med lista, skapa (med kostnad angiven före tryck), filmer per karaktär och "Starta film".

**`src/routes/vibe.shorts.tsx`** görs om till ett vertikalt flöde med `ready`-filmer via en ny publik `listReadyFilms`:
- Den visar bara titel, karaktärsnamn och signerade klipp-URL:er, ingen kanon.
- De fem klippen spelas i ordning med röst. `FilmPlayer` återanvänds.
- Karaktärsnamnet visas ovanför.
- Volym och ljud av/på finns.
- På mobil startar spelningen ljudlöst om autoplay blockeras.
- Bara synligt kort spelas (IntersectionObserver). Ingen generering vid scrollning.

**Texter:** sv/en läggs till i befintlig copy.

**Tester:** `tests/ready-feed.test.ts`:
- Bara `ready`.
- Klippen i ordning.
- Ingen kanon i svaret.
- Därefter Playwright-kontroll utan att trycka generera.

---

## Miljövariabler

Inga nya. `LOVABLE_API_KEY`, `FAL_KEY` och cron-tokenen finns redan.

## Öppna frågor innan steg 2 och 4

1. Kreditpris per EZY-scen. Är det 14 per scen (70/5)? Och priset för ett karaktärsporträtt?
2. Ska de 17 redan publicerade scenklippen avpubliceras? Det är en dataändring och görs separat.
3. Svensk text i videoprompten eller engelsk? Jag rekommenderar engelsk video och svensk berättarröst.
