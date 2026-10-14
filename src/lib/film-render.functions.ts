import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFilmOwner, loadFilm, renderSceneCore } from "@/lib/film.functions";
import { orchestrateFilmRender, type FilmRenderOutcome } from "@/lib/film-render";
import { sceneCostFor } from "@/lib/pricing";

const input = z.object({
  film_id: z.string().uuid(),
  session_id: z.string().uuid(),
  engine: z.enum(["lovable", "fal", "live"]).optional().default("lovable"),
});

/**
 * Render every scene of a film that still needs it. Idempotent: scenes in
 * flight or done are skipped. Balance is checked for all remaining scenes
 * before anything starts; each scene is then charged by renderSceneCore.
 */
export const startFilmRender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }): Promise<FilmRenderOutcome> => {
    await assertFilmOwner(data.film_id, data.session_id, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const film = await loadFilm(data.film_id, data.session_id);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("bonus_coins, paid_coins")
      .eq("id", context.userId)
      .maybeSingle();
    const balance = (profile?.bonus_coins ?? 0) + (profile?.paid_coins ?? 0);

    const outcome = await orchestrateFilmRender({
      scenes: film.scenes.map((s) => ({
        scene_id: s.id,
        status: s.status,
        has_clip: !!s.video_url,
      })),
      balance,
      costPerScene: sceneCostFor(data.engine),
      start: async (scene_id) => {
        await renderSceneCore({
          film_id: data.film_id,
          session_id: data.session_id,
          scene_id,
          engine: data.engine,
          audio: false,
          user_id: context.userId,
        });
      },
    });

    if (outcome.status !== "needs_credits" || outcome.started.length) {
      await supabaseAdmin
        .from("stories")
        .update({ status: outcome.status === "ready" ? "ready" : "generating" })
        .eq("id", data.film_id);
    }
    return outcome;
  });
