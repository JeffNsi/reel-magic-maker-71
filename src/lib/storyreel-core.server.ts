/**
 * Server-only helpers shared by STORYREEL's single-shot and multi-scene flows.
 * Never imported from client code directly — always behind a server function handler.
 */

export const FAL_MODEL_ID = "fal-ai/kling-video/v3/standard/text-to-video";
/** LIVE engine: fal.ai's realtime director model, run through the same queue transport. */
export const FAL_LIVE_MODEL_ID = "fal-ai/minimax/h3-max/director";
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

export type VideoProvider = "lovable" | "fal" | "live";

/** Which fal.ai model backs a fal-based engine. */
export function falModelFor(provider: VideoProvider) {
  return provider === "live" ? FAL_LIVE_MODEL_ID : FAL_MODEL_ID;
}

export const AI_VIDEO_BASE = "https://ai.gateway.lovable.dev/v1/videos";
export const LOVABLE_VIDEO_MODEL = "google/gemini-omni-1.1-flash";

function aiVideoError(status: number, message: string) {
  if (status === 402) {
    return new Error(
      message ||
        "This project is out of AI credits. Top them up in Lovable to keep generating films.",
    );
  }
  if (status === 403) return new Error(message || "AI film generation is blocked for this project.");
  if (status === 429) {
    return new Error("The film service is busy right now. Please try again in a moment.");
  }
  return new Error(message || "The film service could not start this generation.");
}

/** Submit one 5-second vertical clip to Lovable AI and return its job id. */
export async function submitLovableVideo(prompt: string, audio: boolean): Promise<string> {
  const res = await fetch(AI_VIDEO_BASE, {
    method: "POST",
    headers: { Authorization: `Bearer ${readAiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LOVABLE_VIDEO_MODEL,
      input: audio
        ? prompt
        : `${prompt} No dialogue. No music. No sound effects — silent footage.`,
      response_format: {
        type: "video",
        resolution: "720p",
        duration: "5s",
        aspect_ratio: "9:16",
      },
    }),
  });

  const payload = (await res.json().catch(() => null)) as
    | { id?: string; message?: string }
    | null;

  if (!res.ok || !payload?.id) {
    console.error("lovable video submit failed", res.status, JSON.stringify(payload));
    throw aiVideoError(res.status, typeof payload?.message === "string" ? payload.message : "");
  }
  return payload.id;
}

/** Submit to fal.ai (Kling 3.0) and return its request id. */
export async function submitFalVideo(
  prompt: string,
  audio: boolean,
  model: string = FAL_MODEL_ID,
): Promise<string> {
  const res = await fetch(`${FAL_QUEUE_BASE}/${model}`, {
    method: "POST",
    headers: falHeaders(readFalKey()),
    body: JSON.stringify({
      prompt,
      duration: "5",
      aspect_ratio: "9:16",
      generate_audio: audio,
    }),
  });

  const payload = (await res.json().catch(() => null)) as
    | { request_id?: string; detail?: unknown }
    | null;

  if (!res.ok || !payload?.request_id) {
    console.error("fal submit failed", res.status, JSON.stringify(payload));
    throw falSubmitError(res.status, typeof payload?.detail === "string" ? payload.detail : "");
  }
  return payload.request_id;
}

export function submitVideo(provider: VideoProvider, prompt: string, audio: boolean) {
  return provider === "lovable"
    ? submitLovableVideo(prompt, audio)
    : submitFalVideo(prompt, audio, falModelFor(provider));
}

export type ProviderProgress =
  | { state: "queued" | "processing"; queue_position?: number | null }
  | { state: "completed"; bytes: ArrayBuffer }
  | { state: "failed"; message: string };

/** Ask the provider how one job is doing and download the film once it is finished. */
export async function providerProgress(
  provider: VideoProvider,
  taskId: string,
): Promise<ProviderProgress> {
  if (provider === "fal" || provider === "live") {
    const key = readFalKey();
    const falModel = falModelFor(provider);
    const statusRes = await fetch(`${FAL_QUEUE_BASE}/${falModel}/requests/${taskId}/status`, {
      headers: falHeaders(key),
    });
    const statusBody = (await statusRes.json().catch(() => null)) as
      | { status?: string; queue_position?: number }
      | null;

    if (!statusRes.ok) {
      console.error("fal status failed", statusRes.status, JSON.stringify(statusBody));
      if (statusRes.status >= 500 || statusRes.status === 429) return { state: "processing" };
      return { state: "failed", message: "The video service lost this generation." };
    }

    if (statusBody?.status !== "COMPLETED") {
      return {
        state: statusBody?.status === "IN_QUEUE" ? "queued" : "processing",
        queue_position: statusBody?.queue_position ?? null,
      };
    }

    const resultRes = await fetch(`${FAL_QUEUE_BASE}/${falModel}/requests/${taskId}`, {
      headers: falHeaders(key),
    });
    const result = (await resultRes.json().catch(() => null)) as { video?: { url?: string } } | null;
    const sourceUrl = result?.video?.url;
    if (!resultRes.ok || !sourceUrl) {
      console.error("fal result failed", resultRes.status, JSON.stringify(result));
      return { state: "failed", message: "The video finished but could not be collected." };
    }
    const download = await fetch(sourceUrl);
    if (!download.ok) return { state: "failed", message: "The finished video could not be downloaded." };
    return { state: "completed", bytes: await download.arrayBuffer() };
  }

  const key = readAiKey();
  const jobRes = await fetch(`${AI_VIDEO_BASE}/${taskId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const job = (await jobRes.json().catch(() => null)) as
    | { status?: string; error?: { message?: string }; message?: string }
    | null;

  if (!jobRes.ok) {
    console.error("lovable video status failed", jobRes.status, JSON.stringify(job));
    if (jobRes.status >= 500 || jobRes.status === 429) return { state: "processing" };
    return { state: "failed", message: "The film service lost this generation." };
  }

  if (job?.status === "failed") {
    return {
      state: "failed",
      message: job.error?.message || "The film could not be generated. Try a different idea.",
    };
  }
  if (job?.status !== "completed") return { state: "processing" };

  const contentRes = await fetch(`${AI_VIDEO_BASE}/${taskId}/content`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!contentRes.ok) {
    console.error("lovable video download failed", contentRes.status);
    return { state: "failed", message: "The finished film could not be downloaded." };
  }
  return { state: "completed", bytes: await contentRes.arrayBuffer() };
}

/** Insert a generation row, submit it to the chosen engine, and remember the job id. */
export async function startGeneration(opts: {
  session_id: string;
  idea: string;
  style: string;
  prompt: string;
  audio: boolean;
  provider?: VideoProvider;
  story_id?: string;
  scene_number?: number;
  narration?: string;
}): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const provider: VideoProvider = opts.provider ?? "lovable";

  const { data: row, error } = await supabaseAdmin
    .from("generations")
    .insert({
      session_id: opts.session_id,
      idea: opts.idea,
      style: opts.style,
      prompt_final: opts.prompt,
      status: "queued",
      provider,
      story_id: opts.story_id ?? null,
      scene_number: opts.scene_number ?? null,
      narration: opts.narration ?? null,
    })
    .select("id")
    .single();

  if (error || !row) throw new Error("Could not start this scene. Please try again.");

  try {
    const taskId = await submitVideo(provider, opts.prompt, opts.audio);
    await supabaseAdmin
      .from("generations")
      .update({ fal_request_id: taskId, status: "processing" })
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
