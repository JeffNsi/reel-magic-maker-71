import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * STORYREEL V1 — text-to-video via fal.ai (Kling 3.0).
 *
 * All fal.ai calls run server-side only; FAL_KEY never reaches the browser.
 * Kept modular so story generation, scenes, voice-over etc. can be added later.
 */

const FAL_MODEL_ID = "fal-ai/kling-video/v3/standard/text-to-video";
const FAL_QUEUE_BASE = "https://queue.fal.run";
const BUCKET = "videos";
const SIGNED_URL_TTL = 60 * 60 * 6;

export const STYLES = [
  { value: "cinematic", label: "Cinematic", prefix: "Cinematic, dramatic lighting, film grain: " },
  { value: "anime", label: "Anime", prefix: "Anime style, vibrant colors, dynamic motion: " },
  { value: "realistic", label: "Realistic", prefix: "Photorealistic, natural lighting: " },
  { value: "claymation", label: "Claymation", prefix: "Stop-motion claymation style: " },
] as const;

const STYLE_PREFIX: Record<string, string> = Object.fromEntries(
  STYLES.map((s) => [s.value, s.prefix]),
);

const styleValues = STYLES.map((s) => s.value) as unknown as [string, ...string[]];

const generateInput = z.object({
  idea: z.string().trim().min(1, "Describe your idea first.").max(500),
  style: z.enum(styleValues),
  session_id: z.string().uuid(),
});

const statusInput = z.object({
  generation_id: z.string().uuid(),
  session_id: z.string().uuid(),
});

export type GenerationStatus = {
  generation_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  video_url: string | null;
  error_message: string | null;
};

function falHeaders(key: string) {
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}

function readFalKey() {
  const key = process.env["FAL_KEY"];
  if (!key) throw new Error("Video generation isn't configured yet.");
  return key;
}

/** Start a generation: store it, submit it to fal.ai, remember the request id. */
export const generateVideo = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => generateInput.parse(data))
  .handler(async ({ data }): Promise<GenerationStatus> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const idea = data.idea.trim();
    const promptFinal = `${STYLE_PREFIX[data.style] ?? STYLE_PREFIX["cinematic"]}${idea}`;

    const { data: row, error } = await supabaseAdmin
      .from("generations")
      .insert({
        session_id: data.session_id,
        idea,
        style: data.style,
        prompt_final: promptFinal,
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
          prompt: promptFinal,
          duration: "5",
          aspect_ratio: "9:16",
          generate_audio: false,
        }),
      });

      const payload = (await res.json().catch(() => null)) as
        | { request_id?: string; detail?: unknown }
        | null;

      if (!res.ok || !payload?.request_id) {
        console.error("fal submit failed", res.status, JSON.stringify(payload));
        const detail = typeof payload?.detail === "string" ? payload.detail : "";
        throw new Error(
          /balance|locked|credit/i.test(detail)
            ? "The video account is out of credit. Top up the fal.ai balance and try again."
            : res.status === 401 || res.status === 403
              ? "The video service rejected our credentials."
              : res.status === 429
                ? "The video service is busy right now. Please try again in a moment."
                : "The video service could not start this generation.",
        );
      }


      await supabaseAdmin
        .from("generations")
        .update({ fal_request_id: payload.request_id, status: "processing" })
        .eq("id", row.id);

      return {
        generation_id: row.id,
        status: "processing",
        video_url: null,
        error_message: null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      await supabaseAdmin
        .from("generations")
        .update({ status: "failed", error_message: message })
        .eq("id", row.id);
      return { generation_id: row.id, status: "failed", video_url: null, error_message: message };
    }
  });

/** Poll one generation; stores the finished video and returns a playable link. */
export const checkStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => statusInput.parse(data))
  .handler(async ({ data }): Promise<GenerationStatus> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("generations")
      .select("id, status, fal_request_id, video_url, error_message")
      .eq("id", data.generation_id)
      .eq("session_id", data.session_id)
      .single();

    if (error || !row) throw new Error("We lost track of that short.");

    const signedUrl = async (path: string) => {
      const { data: signed } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL);
      return signed?.signedUrl ?? null;
    };

    const fail = async (message: string): Promise<GenerationStatus> => {
      await supabaseAdmin
        .from("generations")
        .update({ status: "failed", error_message: message })
        .eq("id", row.id);
      return {
        generation_id: row.id,
        status: "failed",
        video_url: null,
        error_message: message,
      };
    };

    if (row.status === "failed") {
      return {
        generation_id: row.id,
        status: "failed",
        video_url: null,
        error_message: row.error_message ?? "Something went wrong.",
      };
    }

    if (row.status === "completed" && row.video_url) {
      return {
        generation_id: row.id,
        status: "completed",
        video_url: await signedUrl(row.video_url),
        error_message: null,
      };
    }

    if (!row.fal_request_id) {
      return { generation_id: row.id, status: "queued", video_url: null, error_message: null };
    }

    let key: string;
    try {
      key = readFalKey();
    } catch (err) {
      return fail(err instanceof Error ? err.message : "Video generation isn't configured yet.");
    }

    const statusRes = await fetch(
      `${FAL_QUEUE_BASE}/${FAL_MODEL_ID}/requests/${row.fal_request_id}/status`,
      { headers: falHeaders(key) },
    );
    const statusBody = (await statusRes.json().catch(() => null)) as { status?: string } | null;

    if (!statusRes.ok) {
      console.error("fal status failed", statusRes.status, JSON.stringify(statusBody));
      if (statusRes.status >= 500 || statusRes.status === 429) {
        return {
          generation_id: row.id,
          status: "processing",
          video_url: null,
          error_message: null,
        };
      }
      return fail("The video service lost this generation.");
    }

    if (statusBody?.status !== "COMPLETED") {
      if (row.status !== "processing") {
        await supabaseAdmin.from("generations").update({ status: "processing" }).eq("id", row.id);
      }
      return { generation_id: row.id, status: "processing", video_url: null, error_message: null };
    }

    const resultRes = await fetch(
      `${FAL_QUEUE_BASE}/${FAL_MODEL_ID}/requests/${row.fal_request_id}`,
      { headers: falHeaders(key) },
    );
    const result = (await resultRes.json().catch(() => null)) as
      | { video?: { url?: string } }
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
      .from("generations")
      .update({ status: "completed", video_url: path })
      .eq("id", row.id);

    return {
      generation_id: row.id,
      status: "completed",
      video_url: await signedUrl(path),
      error_message: null,
    };
  });
