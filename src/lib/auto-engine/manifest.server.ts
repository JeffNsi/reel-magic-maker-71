/**
 * Auto Engine — load a film's manifest from the database. Server-only and
 * read-only: one call to public.auto_engine_film_source (migration 0010), a
 * single SQL statement and therefore one consistent snapshot of the film's
 * scenes, their linked takes, the spoken voice-over text and the storage
 * revision of every file. A scene relinked to a new take mid-read can not
 * produce a manifest for the old take. No writes, no provider calls.
 * The reader is injectable so the loader is tested with fakes.
 */
import { z } from "zod";

import { buildFilmManifest, type FilmManifest } from "@/lib/auto-engine/manifest";

const revision = z
  .object({
    version: z.string().nullable(),
    etag: z.string().nullable(),
    size: z.number().nullable(),
    updated_at: z.string().nullable(),
  })
  .strict()
  .nullable();

const filmSourceSchema = z
  .object({
    story: z.object({ id: z.string().min(1), title: z.string().nullable() }).strict(),
    scenes: z.array(
      z
        .object({
          id: z.string().min(1),
          scene_number: z.number().int(),
          title: z.string().nullable(),
          narration: z.string().nullable(),
          generation_id: z.string().nullable(),
        })
        .strict(),
    ),
    generations: z.array(
      z
        .object({
          id: z.string().min(1),
          story_id: z.string().nullable(),
          status: z.string().nullable(),
          video_url: z.string().nullable(),
          voiceover_url: z.string().nullable(),
          provider: z.string().nullable(),
          spoken_text: z.string().nullable(),
          updated_at: z.string().nullable(),
          clip_object: revision,
          voice_object: revision,
        })
        .strict(),
    ),
  })
  .strict();

export type FilmSource = z.infer<typeof filmSourceSchema>;

export type ManifestReader = {
  /** The raw result of auto_engine_film_source: null for an unknown film. */
  filmSource(story_id: string): Promise<unknown>;
};

export class FilmNotFoundError extends Error {
  constructor() {
    super("That film could not be found. / Filmen hittades inte.");
    this.name = "FilmNotFoundError";
  }
}

export class FilmSourceInvalidError extends Error {
  constructor() {
    super(
      "The film's data could not be read safely. / Filmens data kunde inte läsas på ett säkert sätt.",
    );
    this.name = "FilmSourceInvalidError";
  }
}

/** The production reader, over the service-role client (server only). */
export async function supabaseManifestReader(): Promise<ManifestReader> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return {
    async filmSource(story_id) {
      const { data, error } = await supabaseAdmin.rpc("auto_engine_film_source", {
        _story_id: story_id,
      });
      if (error) throw new Error("Could not read the film. / Kunde inte läsa filmen.");
      return data;
    },
  };
}

/** Read one film in one snapshot and build its manifest. */
export async function loadFilmManifest(
  story_id: string,
  reader?: ManifestReader,
): Promise<FilmManifest> {
  const db = reader ?? (await supabaseManifestReader());
  const raw = await db.filmSource(story_id);
  if (raw === null || raw === undefined) throw new FilmNotFoundError();
  const parsed = filmSourceSchema.safeParse(raw);
  if (!parsed.success || parsed.data.story.id !== story_id) throw new FilmSourceInvalidError();
  return buildFilmManifest(parsed.data);
}
