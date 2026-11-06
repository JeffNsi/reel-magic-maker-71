/**
 * Auto Engine — load a film's manifest from the database. Server-only, read-only:
 * three SELECTs over existing tables (stories, story_scenes, generations), no
 * writes, no storage access, no provider calls. The reader is injectable so the
 * loader is tested with fakes.
 */
import {
  buildFilmManifest,
  type FilmManifest,
  type ManifestGenerationInput,
  type ManifestSceneInput,
  type ManifestStoryInput,
} from "@/lib/auto-engine/manifest";

export type ManifestReader = {
  story(story_id: string): Promise<ManifestStoryInput | null>;
  scenes(story_id: string): Promise<ManifestSceneInput[]>;
  generations(ids: string[]): Promise<ManifestGenerationInput[]>;
};

export class FilmNotFoundError extends Error {
  constructor() {
    super("That film could not be found. / Filmen hittades inte.");
    this.name = "FilmNotFoundError";
  }
}

/** The production reader, over the service-role client (server only). */
export async function supabaseManifestReader(): Promise<ManifestReader> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const fail = (what: string) => {
    throw new Error(`Could not read ${what}. / Kunde inte läsa ${what}.`);
  };
  return {
    async story(story_id) {
      const { data, error } = await supabaseAdmin
        .from("stories")
        .select("id, title")
        .eq("id", story_id)
        .maybeSingle();
      if (error) fail("the film");
      return data ? { id: data.id as string, title: (data.title as string | null) ?? null } : null;
    },
    async scenes(story_id) {
      const { data, error } = await supabaseAdmin
        .from("story_scenes")
        .select("id, scene_number, title, narration, generation_id")
        .eq("story_id", story_id)
        .order("scene_number", { ascending: true });
      if (error) fail("the scenes");
      return (data ?? []).map((s) => ({
        id: s.id as string,
        scene_number: s.scene_number as number,
        title: (s.title as string | null) ?? null,
        narration: (s.narration as string | null) ?? null,
        generation_id: (s.generation_id as string | null) ?? null,
      }));
    },
    async generations(ids) {
      if (!ids.length) return [];
      const { data, error } = await supabaseAdmin
        .from("generations")
        .select("id, story_id, status, video_url, voiceover_url, provider")
        .in("id", ids);
      if (error) fail("the clips");
      return (data ?? []).map((g) => ({
        id: g.id as string,
        story_id: (g.story_id as string | null) ?? null,
        status: (g.status as string | null) ?? null,
        video_url: (g.video_url as string | null) ?? null,
        voiceover_url: (g.voiceover_url as string | null) ?? null,
        provider: (g.provider as string | null) ?? null,
      }));
    },
  };
}

/** Read one film's rows and build its manifest. Throws FilmNotFoundError for an unknown id. */
export async function loadFilmManifest(
  story_id: string,
  reader?: ManifestReader,
): Promise<FilmManifest> {
  const db = reader ?? (await supabaseManifestReader());
  const story = await db.story(story_id);
  if (!story) throw new FilmNotFoundError();
  const scenes = await db.scenes(story_id);
  const ids = [...new Set(scenes.map((s) => s.generation_id).filter((v): v is string => !!v))];
  const generations = await db.generations(ids);
  return buildFilmManifest({ story, scenes, generations });
}
