/**
 * Server-only helpers shared by STORYREEL's single-shot and multi-scene flows.
 * Never imported from client code directly — always behind a server function handler.
 */

export const FAL_MODEL_ID = "fal-ai/kling-video/v3/standard/text-to-video";
export const FAL_QUEUE_BASE = "https://queue.fal.run";
export const BUCKET = "videos";
export const SIGNED_URL_TTL = 60 * 60 * 6;

export function readFalKey() {
  const key = process.env["FAL_KEY"];
  if (!key) throw new Error("Video generation isn't configured yet.");
  return key;
}

export function readAiKey() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("The AI writer isn't available right now.");
  return key;
}

export function falHeaders(key: string) {
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}

export function falSubmitError(status: number, detail: string) {
  if (/balance|locked|credit/i.test(detail)) {
    return new Error("The video account is out of credit. Top up the fal.ai balance and try again.");
  }
  if (status === 401 || status === 403) return new Error("The video service rejected our credentials.");
  if (status === 429) {
    return new Error("The video service is busy right now. Please try again in a moment.");
  }
  return new Error("The video service could not start this generation.");
}

export async function signedUrl(path: string | null) {
  if (!path) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  return data?.signedUrl ?? null;
}

/** Insert a generation row, submit it to fal.ai, and remember the request id. */
export async function startGeneration(opts: {
  session_id: string;
  idea: string;
  style: string;
  prompt: string;
  audio: boolean;
  story_id?: string;
  scene_number?: number;
  narration?: string;
}): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row, error } = await supabaseAdmin
    .from("generations")
    .insert({
      session_id: opts.session_id,
      idea: opts.idea,
      style: opts.style,
      prompt_final: opts.prompt,
      status: "queued",
      story_id: opts.story_id ?? null,
      scene_number: opts.scene_number ?? null,
      narration: opts.narration ?? null,
    })
    .select("id")
    .single();

  if (error || !row) throw new Error("Could not start this scene. Please try again.");

  try {
    const key = readFalKey();
    const res = await fetch(`${FAL_QUEUE_BASE}/${FAL_MODEL_ID}`, {
      method: "POST",
      headers: falHeaders(key),
      body: JSON.stringify({
        prompt: opts.prompt,
        duration: "5",
        aspect_ratio: "9:16",
        generate_audio: opts.audio,
      }),
    });

    const payload = (await res.json().catch(() => null)) as
      | { request_id?: string; detail?: unknown }
      | null;

    if (!res.ok || !payload?.request_id) {
      console.error("fal submit failed", res.status, JSON.stringify(payload));
      throw falSubmitError(res.status, typeof payload?.detail === "string" ? payload.detail : "");
    }

    await supabaseAdmin
      .from("generations")
      .update({ fal_request_id: payload.request_id, status: "processing" })
      .eq("id", row.id);

    return row.id as string;
  } catch (err) {
    const message = err instanceof Error ? err.message : "The video service could not start this.";
    await supabaseAdmin
      .from("generations")
      .update({ status: "failed", error_message: message })
      .eq("id", row.id);
    throw new Error(message);
  }
}
