/** Film-level error text (sv/en, no technical detail) and when it is written or cleared. */
export const FILM_SUBMIT_ERROR =
  "A scene could not be started. No credits were kept for it. / En scen kunde inte startas. Inga credits drogs för den.";
export const FILM_SCENE_FAILED_ERROR =
  "A scene could not be finished. Its credits were returned. / En scen kunde inte bli klar. Dess credits återbetalades.";
export const FAL_FALLBACK_NOTE =
  "Rendered via fal.ai (Kling 3.0) because the house AI balance was empty. / Renderad via fal.ai (Kling 3.0) eftersom husets AI-saldo var slut.";

/** Typed provider failure reasons — detected from status codes, never from user-facing text. */
export type ProviderErrorCode =
  | "provider_out_of_credits"
  | "provider_content_policy"
  | "provider_busy"
  | "provider_credentials"
  | "provider_unavailable"
  | "provider_error";

export class VideoProviderError extends Error {
  constructor(
    message: string,
    readonly code: ProviderErrorCode,
  ) {
    super(message);
  }
}

export function providerErrorCode(err: unknown): ProviderErrorCode | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.startsWith("provider_")
    ? (code as ProviderErrorCode)
    : null;
}

/** EZY falls back to fal only when the house Lovable AI balance is empty. */
export function shouldFallBackToFal(provider: string, err: unknown): boolean {
  return provider === "lovable" && providerErrorCode(err) === "provider_out_of_credits";
}

/** Content-policy rejections are recognised from the provider's own wording. */
export function looksLikePolicyRejection(text: string): boolean {
  return /responsible ai|safety|content polic|policy|moderation/i.test(text);
}

/** Scene-specific, bilingual reason a scene could not start. No HTTP codes, no raw JSON. */
export function filmSubmitErrorFor(sceneNumber: number, err: unknown): string {
  const n = String(sceneNumber).padStart(2, "0");
  const code = providerErrorCode(err);
  const tail = " No credits were used.";
  const tailSv = " Inga credits drogs.";
  if (code === "provider_content_policy") {
    return `Scene ${n} could not start: the video service refused this scene's content. Rephrase the scene and try again.${tail} / Scen ${n} kunde inte starta: videotjänsten nekade scenens innehåll. Skriv om scenen och försök igen.${tailSv}`;
  }
  if (code === "provider_out_of_credits" || code === "provider_unavailable") {
    return `Scene ${n} could not start: the house video balance is empty.${tail} / Scen ${n} kunde inte starta: husets videosaldo är slut.${tailSv}`;
  }
  if (code === "provider_busy") {
    return `Scene ${n} could not start: the video service is busy. Try again in a minute.${tail} / Scen ${n} kunde inte starta: videotjänsten är upptagen. Försök igen om en minut.${tailSv}`;
  }
  if (code === "provider_credentials") {
    return `Scene ${n} could not start: the video service rejected the house key.${tail} / Scen ${n} kunde inte starta: videotjänsten avvisade husets nyckel.${tailSv}`;
  }
  return `Scene ${n}: ${FILM_SUBMIT_ERROR}`;
}

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
