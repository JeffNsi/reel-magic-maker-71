# Reference packs: build the producing side

Today the Continuity Center can only *read* reference images, so every character and location card says "Reference pack missing". This adds the part that actually creates them.

## What you get

- A **Generate reference pack** button on each character and location card in the Continuity Center.
- For a character: 6 images (front, 3/4 left, 3/4 right, profile, full body, close-up) generated from the locked canonical truth (face, hair, skin, body, height, build, wardrobe).
- For a location: 3 images (wide establishing, interior detail, lighting reference) from the canonical architecture, layout, materials, palette and lighting.
- Cards switch from "Reference pack missing" to a small thumbnail strip once the pack exists, and show which version of the character/location the images belong to.
- A **Style reference** pack per film (2 images) shown in its own row, so the style assets that are already returned stop being invisible.
- Regenerating after a canonical edit creates a new version of the pack; the old images stay (append-only), so nothing is silently overwritten.

## Cost and control

Image generation costs credits, so nothing is generated automatically — only when you press the button. Each button press shows how many images it will make before it runs. The workspace currently has very little credit left, so expect to top up before generating full packs.

## Technical notes

- New server functions in `src/lib/canon.functions.ts`: `generateCharacterPack`, `generateEnvironmentPack`, `generateStylePack`. Each builds prompts from the canonical row, calls the Lovable AI image model server-side, uploads the bytes to the existing `films` storage bucket under `<story_id>/<subject_canonical_id>/<kind>-v<version>.png`, and inserts one `film_canon_assets` row per image (`subject_type`, `subject_canonical_id`, `kind`, `storage_path`, `prompt`, `version`).
- `getCanon` extended to return signed URLs per asset grouped by subject, plus `pack_version`; `reference_pack_ready` keeps its current meaning.
- `src/routes/canon.$filmId.tsx`: thumbnail strip + generate/regenerate buttons on character and environment cards, and a style-assets row.
- No change to `renderScene`, generation, credits logic for video, sharing or the advisory continuity panel. No new tables (the migration already created `film_canon_assets`).
