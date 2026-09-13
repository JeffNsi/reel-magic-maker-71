import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const STYLES = [
  "cinematic",
  "noir",
  "anime",
  "documentary",
  "dreamlike",
] as const;

const createSchema = z.object({
  prompt: z.string().trim().min(10).max(1500),
  style: z.enum(STYLES),
  duration: z.union([z.literal(5), z.literal(8), z.literal(10)]),
});

const STYLE_DIRECTION: Record<(typeof STYLES)[number], string> = {
  cinematic:
    "Cinematic film look, anamorphic lens, shallow depth of field, warm practical lighting, subtle film grain.",
  noir: "Black and white film noir, hard key light, deep shadows, smoke, high contrast, 1940s mood.",
  anime:
    "Hand-drawn Japanese animation style, expressive characters, painted backgrounds, vivid colour.",
  documentary:
    "Naturalistic documentary style, handheld camera, available light, realistic textures.",
  dreamlike:
    "Dreamlike surreal imagery, soft diffusion, drifting particles, pastel light, slow motion.",
};

function buildPrompt(prompt: string, style: (typeof STYLES)[number]) {
  return [
    prompt,
    STYLE_DIRECTION[style],
    "A single continuous shot, no scene cuts. Consider micro-detail, expression and timing.",
    "Subtle atmospheric score and ambient sound. No dialogue.",
  ].join(" ");
}

const GATEWAY = "https://ai.gateway.lovable.dev/v1/videos";

export const createFilm = createServerFn({ method: "POST" })
  .inputValidator((data) => createSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Video generation is not configured yet.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: film, error } = await supabaseAdmin
      .from("films")
      .insert({
        prompt: data.prompt,
        style: data.style,
        duration_seconds: data.duration,
        status: "generating",
      })
      .select("id")
      .single();
    if (error || !film) throw new Error("Could not save your film.");

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-omni-1.1-flash",
        input: buildPrompt(data.prompt, data.style),
        response_format: {
          type: "video",
          resolution: "720p",
          duration: `${data.duration}s`,
          aspect_ratio: "16:9",
        },
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      const message = body?.message ?? "Video generation failed to start.";
      await supabaseAdmin
        .from("films")
        .update({ status: "failed", error: message })
        .eq("id", film.id);
      throw new Error(message);
    }

    const job = (await res.json()) as { id: string };
    await supabaseAdmin.from("films").update({ job_id: job.id }).eq("id", film.id);

    return { id: film.id as string };
  });

const statusSchema = z.object({ id: z.string().uuid() });

export type FilmStatus = {
  id: string;
  status: "queued" | "generating" | "completed" | "failed";
  prompt: string;
  style: string;
  duration_seconds: number;
  videoUrl: string | null;
  error: string | null;
};

export const getFilmStatus = createServerFn({ method: "POST" })
  .inputValidator((data) => statusSchema.parse(data))
  .handler(async ({ data }): Promise<FilmStatus> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: film, error } = await supabaseAdmin
      .from("films")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !film) throw new Error("Film not found.");

    const signed = async (path: string) => {
      const { data: url } = await supabaseAdmin.storage
        .from("films")
        .createSignedUrl(path, 60 * 60);
      return url?.signedUrl ?? null;
    };

    const base = {
      id: film.id as string,
      prompt: film.prompt as string,
      style: film.style as string,
      duration_seconds: film.duration_seconds as number,
      error: (film.error as string | null) ?? null,
    };

    if (film.status === "completed" && film.video_path) {
      return { ...base, status: "completed", videoUrl: await signed(film.video_path) };
    }
    if (film.status === "failed") {
      return { ...base, status: "failed", videoUrl: null };
    }
    if (!film.job_id || !apiKey) {
      return { ...base, status: "generating", videoUrl: null };
    }

    const jobRes = await fetch(`${GATEWAY}/${film.job_id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!jobRes.ok) {
      return { ...base, status: "generating", videoUrl: null };
    }
    const job = (await jobRes.json()) as {
      status: string;
      error?: { message?: string } | null;
    };

    if (job.status === "failed") {
      const message = job.error?.message ?? "The film could not be generated.";
      await supabaseAdmin
        .from("films")
        .update({ status: "failed", error: message })
        .eq("id", film.id);
      return { ...base, status: "failed", videoUrl: null, error: message };
    }

    if (job.status !== "completed") {
      return { ...base, status: "generating", videoUrl: null };
    }

    const contentRes = await fetch(`${GATEWAY}/${film.job_id}/content`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!contentRes.ok) {
      return { ...base, status: "generating", videoUrl: null };
    }
    const bytes = await contentRes.arrayBuffer();
    const path = `${film.id}.mp4`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("films")
      .upload(path, bytes, { contentType: "video/mp4", upsert: true });
    if (uploadError) {
      return { ...base, status: "generating", videoUrl: null };
    }

    await supabaseAdmin
      .from("films")
      .update({ status: "completed", video_path: path })
      .eq("id", film.id);

    return { ...base, status: "completed", videoUrl: await signed(path) };
  });
