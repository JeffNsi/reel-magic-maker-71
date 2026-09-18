import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * PUBLIC FILM SHARING — a creator-controlled, read-only version of a film page.
 *
 * Sharing is off until the creator turns it on. Turning it on mints an
 * unguessable link; turning it off retires the link immediately. The public
 * payload is deliberately thin: title, logline, style, and the finished clips.
 * It never carries the Film Bible, Scene Truth, the twist, the reveal, credit
 * budgets, clarity notes, internal ids or anything about the creator's account.
 */

export type SharedScene = {
  scene_number: number;
  title: string;
  /** Present only once the clip is finished; a temporary playback link. */
  video_url: string | null;
};

export type SharedFilm = {
  slug: string;
  title: string;
  logline: string;
  style: string;
  scene_count: number;
  scenes: SharedScene[];
};

const slugInput = z.object({
  slug: z
    .string()
    .trim()
    .min(8)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
});

/** Readable stem plus random tail, so a link can never be guessed from a title. */
function mintSlug(title: string): string {
  const stem =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "film";
  const tail = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((byte) => byte.toString(36).padStart(2, "0").slice(-2))
    .join("")
    .slice(0, 12);
  return `${stem}-${tail}`;
}

/**
 * Creator-only switch. Scoped to the browser session that made the film, the
 * same ownership rule the private film page already uses.
 */
export const setFilmShare = createServerFn({ method: "POST" })
  .inputValidator((input: { film_id: string; session_id: string; shared: boolean }) =>
    z
      .object({
        film_id: z.string().uuid(),
        session_id: z.string().uuid(),
        shared: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: story } = await supabaseAdmin
      .from("stories")
      .select("id, title, share_slug")
      .eq("id", data.film_id)
      .eq("session_id", data.session_id)
      .maybeSingle();

    if (!story) throw new Error("That film could not be found.");

    if (!data.shared) {
      await supabaseAdmin
        .from("stories")
        .update({ share_slug: null, shared_at: null })
        .eq("id", data.film_id)
        .eq("session_id", data.session_id);
      return { shared: false, slug: null as string | null };
    }

    const existing = (story.share_slug as string | null) ?? null;
    if (existing) return { shared: true, slug: existing };

    const slug = mintSlug((story.title as string) ?? "film");
    const { error } = await supabaseAdmin
      .from("stories")
      .update({ share_slug: slug, shared_at: new Date().toISOString() })
      .eq("id", data.film_id)
      .eq("session_id", data.session_id);

    if (error) throw new Error("Sharing could not be turned on. Try again.");
    return { shared: true, slug };
  });

/**
 * Public read. Unauthenticated on purpose — the link itself is the key — and
 * limited to what a visitor should see.
 */
export const getSharedFilm = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => slugInput.parse(input))
  .handler(async ({ data }): Promise<SharedFilm | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { signedUrl } = await import("@/lib/storyreel-core.server");

    const { data: story } = await supabaseAdmin
      .from("stories")
      .select("id, title, logline, style, share_slug")
      .eq("share_slug", data.slug)
      .maybeSingle();

    if (!story) return null;

    const { data: sceneRows } = await supabaseAdmin
      .from("story_scenes")
      .select("scene_number, title, generation_id")
      .eq("story_id", story.id as string)
      .order("scene_number", { ascending: true });

    const rows = sceneRows ?? [];
    const generationIds = rows
      .map((row) => row.generation_id as string | null)
      .filter((value): value is string => !!value);

    const generations = generationIds.length
      ? ((
          await supabaseAdmin
            .from("generations")
            .select("id, status, video_url")
            .in("id", generationIds)
        ).data ?? [])
      : [];

    const byId = new Map(generations.map((row) => [row.id as string, row]));

    const scenes: SharedScene[] = await Promise.all(
      rows.map(async (row) => {
        const generation = row.generation_id ? byId.get(row.generation_id as string) : undefined;
        return {
          scene_number: row.scene_number as number,
          title: (row.title as string | null) ?? "",
          video_url:
            generation?.status === "completed"
              ? await signedUrl(generation.video_url as string)
              : null,
        };
      }),
    );

    return {
      slug: data.slug,
      title: (story.title as string) ?? "Untitled film",
      logline: (story.logline as string) ?? "",
      style: (story.style as string) ?? "cinematic",
      scene_count: scenes.length,
      scenes,
    };
  });
