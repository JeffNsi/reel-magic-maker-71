import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * STORYREEL V1 — text-to-video via fal.ai (Kling 3.0).
 *
 * Everything that touches the fal.ai key runs here, server-side only.
 * Modular on purpose: swap MODEL_ID / buildPrompt later without touching the UI.
 */

const FAL_MODEL_ID = "fal-ai/kling-video/v3/standard/text-to-video";
const FAL_QUEUE_BASE = "https://queue.fal.run";
const BUCKET = "shorts";

export const STYLES = [
  { value: "cinematic", label: "Cinematic" },
  { value: "realistic", label: "Realistic" },
  { value: "anime", label: "Anime" },
  { value: "3d", label: "3D" },
  { value: "horror", label: "Horror" },
] as const;

const STYLE_DIRECTION: Record<string, string> = {
  cinematic:
    "Cinematic film look, anamorphic lens, shallow depth of field, dramatic volumetric lighting, film grain, colour graded.",
  realistic:
    "Photorealistic live-action footage, natural lighting, handheld documentary camera, true-to-life textures.",
  anime:
    "Japanese anime style, hand-drawn cel shading, expressive characters, painted backgrounds, dynamic camera.",
  "3d": "Stylised 3D animation, high quality rendering, soft global illumination, subtle depth of field, Pixar-like polish.",
  horror:
    "Horror atmosphere, low-key lighting, deep shadows, cold desaturated palette, unsettling slow camera push, fog.",
};

const styleValues = STYLES.map((s) => s.value) as unknown as [string, ...string[]];

const createInput = z.object({
  prompt: z.string().trim().min(10, "Describe your story a little more.").max(1500),
  style: z.enum(styleValues),
});

const statusInput = z.object({ id: z.string().uuid() });

export type ShortStatus = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  videoUrl: string | null;
  errorMessage: string | null;
};

function buildPrompt(prompt: string, style: string) {
  return `${prompt.trim()}\n\n${STYLE_DIRECTION[style] ?? STYLE_DIRECTION["cinematic"]}`;
}

function falHeaders(key: string) {
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}

function readFalKey() {
  const key = process.env["FAL_KEY"];
  if (!key) throw new Error("Video generation isn't configured yet.");
  return key;
}

/** Start a generation: record it, submit it to fal.ai, remember the task id. */
export const createShort = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createInput.parse(data))
  .handler(async ({ data }): Promise<ShortStatus> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("video_generations")
      .insert({
        prompt: data.prompt.trim(),
        style: data.style,
        aspect_ratio: "9:16",
        duration_seconds: 5,
        provider: "fal.ai",
        status: "queued",
      })
      .select("id")
      .single();

    if (error || !row) throw new Error("Could not start your short. Please try again.");

    try {
      const key = readFalKey();
      const res = await fetch(`${FAL_QUEUE_BASE}/${FAL_MODEL_ID}`, {
        method: "POST",
        headers: falHeaders(key),
        body: JSON.stringify({
          prompt: buildPrompt(data.prompt, data.style),
          duration: "5",
          aspect_ratio: "9:16",
          generate_audio: false,
        }),
      });

      const payload = (await res.json().catch(() => null)) as
        | { request_id?: string; detail?: unknown; error?: unknown }
        | null;

      if (!res.ok || !payload?.request_id) {
        console.error("fal submit failed", res.status, JSON.stringify(payload));
        throw new Error(
          res.status === 401 || res.status === 403
            ? "The video service rejected our credentials."
            : res.status === 429
              ? "The video service is busy right now. Please try again in a moment."
              : "The video service could not start this generation.",
        );
      }

      await supabaseAdmin
        .from("video_generations")
        .update({ provider_task_id: payload.request_id, status: "processing" })
        .eq("id", row.id);

      return { id: row.id, status: "processing", videoUrl: null, errorMessage: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      await supabaseAdmin
        .from("video_generations")
        .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
        .eq("id", row.id);
      return { id: row.id, status: "failed", videoUrl: null, errorMessage: message };
    }
  });

/** Poll one generation; stores the finished video and returns a playable link. */
export const getShortStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => statusInput.parse(data))
  .handler(async ({ data }): Promise<ShortStatus> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("video_generations")
      .select("id, status, provider_task_id, video_url, error_message")
      .eq("id", data.id)
      .single();

    if (error || !row) throw new Error("We lost track of that short.");

    const fail = async (message: string): Promise<ShortStatus> => {
      await supabaseAdmin
        .from("video_generations")
        .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
        .eq("id", row.id);
      return { id: row.id, status: "failed", videoUrl: null, errorMessage: message };
    };

    if (row.status === "failed") {
      return {
        id: row.id,
        status: "failed",
        videoUrl: null,
        errorMessage: row.error_message ?? "Something went wrong.",
      };
    }

    if (row.status === "completed" && row.video_url) {
      const { data: signed } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(row.video_url, 60 * 60);
      return {
        id: row.id,
        status: "completed",
        videoUrl: signed?.signedUrl ?? null,
        errorMessage: null,
      };
    }

    if (!row.provider_task_id) {
      return { id: row.id, status: "queued", videoUrl: null, errorMessage: null };
    }

    let key: string;
    try {
      key = readFalKey();
    } catch (err) {
      return fail(err instanceof Error ? err.message : "Video generation isn't configured yet.");
    }

    const statusRes = await fetch(
      `${FAL_QUEUE_BASE}/${FAL_MODEL_ID}/requests/${row.provider_task_id}/status`,
      { headers: falHeaders(key) },
    );
    const statusBody = (await statusRes.json().catch(() => null)) as { status?: string } | null;

    if (!statusRes.ok) {
      console.error("fal status failed", statusRes.status, JSON.stringify(statusBody));
      if (statusRes.status >= 500 || statusRes.status === 429) {
        return { id: row.id, status: "processing", videoUrl: null, errorMessage: null };
      }
      return fail("The video service lost this generation.");
    }

    if (statusBody?.status !== "COMPLETED") {
      return { id: row.id, status: "processing", videoUrl: null, errorMessage: null };
    }

    const resultRes = await fetch(
      `${FAL_QUEUE_BASE}/${FAL_MODEL_ID}/requests/${row.provider_task_id}`,
      { headers: falHeaders(key) },
    );
    const result = (await resultRes.json().catch(() => null)) as
      | { video?: { url?: string }; detail?: unknown }
      | null;

    const sourceUrl = result?.video?.url;
    if (!resultRes.ok || !sourceUrl) {
      console.error("fal result failed", resultRes.status, JSON.stringify(result));
      return fail("The video finished but could not be collected. Please try again.");
    }

    const download = await fetch(sourceUrl);
    if (!download.ok) return fail("The finished video could not be downloaded.");
    const bytes = await download.arrayBuffer();

    const path = `${row.id}.mp4`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "video/mp4", upsert: true });
    if (uploadError) {
      console.error("storage upload failed", uploadError);
      return fail("The finished video could not be saved.");
    }

    await supabaseAdmin
      .from("video_generations")
      .update({ status: "completed", video_url: path, completed_at: new Date().toISOString() })
      .eq("id", row.id);

    const { data: signed } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60);

    return {
      id: row.id,
      status: "completed",
      videoUrl: signed?.signedUrl ?? null,
      errorMessage: null,
    };
  });
