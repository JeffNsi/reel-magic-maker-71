/** Film-level error text (sv/en, no technical detail) and when it is written or cleared. */
export const FILM_SUBMIT_ERROR =
  "A scene could not be started. No credits were kept for it. / En scen kunde inte startas. Inga credits drogs för den.";
export const FILM_SCENE_FAILED_ERROR =
  "A scene could not be finished. Its credits were returned. / En scen kunde inte bli klar. Dess credits återbetalades.";

/** Status recompute: keep the first real error, never invent one, clear only on success. */
export function nextFilmError(
  status: "ready" | "failed" | "generating",
  current: string | null,
): string | null {
  if (status === "failed") return current ?? FILM_SCENE_FAILED_ERROR;
  return current;
}

export async function setFilmError(story_id: string, message: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("stories")
    .update({ error_message: message })
    .eq("id", story_id);
  if (error) console.info("film error not saved", error.code);
}
