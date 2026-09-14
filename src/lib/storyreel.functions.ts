import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STORYREEL_DRAMA_ID } from "@/lib/vibe.functions";

/** Coins burned by one generation. Coins are earned in Rewards or bought in the coin shop. */
export const COIN_COST = 70;

/**
 * STORYREEL V1 — text-to-video via fal.ai (Kling 3.0).
 *
 * All fal.ai calls run server-side only; FAL_KEY never reaches the browser.
 * Kept modular so story generation, scenes, voice-over etc. can be added later.
 */

const BUCKET = "videos";
const SIGNED_URL_TTL = 60 * 60 * 6;

export const STYLES = [
  {
    value: "cinematic",
    label: "Cinematic",
    description: "Moody lighting, film grain, wide shots",
    prefix:
      "Cinematic lighting, realistic camera movement, dramatic composition, shallow depth of field: ",
  },
  {
    value: "anime",
    label: "Anime",
    description: "Expressive characters, detailed animation, bold color",
    prefix: "High-quality anime aesthetic, expressive characters, detailed animation: ",
  },
  {
    value: "noir",
    label: "Noir",
    description: "Hard shadows, smoke, black-and-white tension",
    prefix:
      "Black and white film noir, hard chiaroscuro shadows, smoke, 1940s detective cinematography: ",
  },
  {
    value: "documentary",
    label: "Documentary",
    description: "Handheld camera, natural light, real world",
    prefix: "Observational documentary, handheld camera, natural light, muted realistic colors: ",
  },
  {
    value: "retro",
    label: "Retro Film",
    description: "16mm grain, warm fade, light leaks",
    prefix: "Vintage 16mm film look, warm faded colors, heavy grain, halation and light leaks: ",
  },
  {
    value: "hyperreal",
    label: "Hyperreal",
    description: "Ultra sharp detail, crisp highlights",
    prefix: "Hyperreal photography, ultra sharp detail, high dynamic range, crisp highlights: ",
  },
  {
    value: "realistic",
    label: "Realistic",
    description: "Natural light, true-to-life detail",
    prefix:
      "Photorealistic footage, natural lighting, true-to-life colors, realistic textures and skin detail, 35mm lens: ",
  },
  {
    value: "claymation",
    label: "Claymation",
    description: "Handmade clay figures, stop-motion",
    prefix:
      "Stop-motion claymation, handmade plasticine characters, visible fingerprints and clay texture, miniature practical set, soft studio light: ",
  },
] as const;

const STYLE_PREFIX: Record<string, string> = Object.fromEntries(
  STYLES.map((s) => [s.value, s.prefix]),
);

const styleValues = STYLES.map((s) => s.value) as unknown as [string, ...string[]];

const generateInput = z.object({
  idea: z.string().trim().min(1, "Describe your idea first.").max(500),
  style: z.enum(styleValues),
  session_id: z.string().uuid(),
  /** When true, the video model generates a soundtrack for the clip. */
  audio: z.boolean().optional().default(false),
  /** Which film engine renders the clip: Lovable AI, or the project's own fal.ai account. */
  engine: z.enum(["lovable", "fal"]).optional().default("lovable"),
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
  /** When the generation was started, so the UI can estimate time remaining. */
  created_at?: string | null;
  /** Position in the provider queue, when the provider reports one. */
  queue_position?: number | null;
};

/** Typical wall-clock time for one 5-second short, used for the progress estimate. */
export const ESTIMATED_SECONDS = 210;

export type HistoryItem = {
  id: string;
  idea: string;
  style: string;
  status: "queued" | "processing" | "completed" | "failed";
  created_at: string;
  video_url: string | null;
  error_message: string | null;
};


/** Start a generation: charge coins, store it, submit it to fal.ai, remember the request id. */
export const generateVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => generateInput.parse(data))
  .handler(async ({ data, context }): Promise<GenerationStatus> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const idea = data.idea.trim();
    const promptFinal = `${STYLE_PREFIX[data.style] ?? STYLE_PREFIX["cinematic"]}${idea}`;

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("paid_coins, bonus_coins")
      .eq("id", context.userId)
      .single();

    if (!profile) throw new Error("Could not read your coin balance.");

    const bonus = profile.bonus_coins ?? 0;
    const paid = profile.paid_coins ?? 0;
    if (bonus + paid < COIN_COST) {
      throw new Error(
        `Not enough coins — a film costs ${COIN_COST} coins and you have ${bonus + paid}.`,
      );
    }

    const spendBonus = Math.min(bonus, COIN_COST);
    const spendPaid = COIN_COST - spendBonus;

    const charge = async (sign: 1 | -1) => {
      await supabaseAdmin
        .from("profiles")
        .update({
          bonus_coins: bonus - sign * spendBonus,
          paid_coins: paid - sign * spendPaid,
        })
        .eq("id", context.userId);
    };

    await charge(1);

    const { data: row, error } = await supabaseAdmin
      .from("generations")
      .insert({
        session_id: data.session_id,
        user_id: context.userId,
        coins_spent: COIN_COST,
        idea,
        style: data.style,
        prompt_final: promptFinal,
        status: "queued",
        provider: data.engine,
      })
      .select("id")
      .single();

    if (error || !row) {
      await charge(-1);
      throw new Error("Could not start your short. Please try again.");
    }

    try {
      const { submitVideo } = await import("@/lib/storyreel-core.server");
      const taskId = await submitVideo(data.engine, promptFinal, data.audio === true);

      await supabaseAdmin
        .from("generations")
        .update({ fal_request_id: taskId, status: "processing" })
        .eq("id", row.id);

      return {
        generation_id: row.id,
        status: "processing",
        video_url: null,
        error_message: null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      await charge(-1);
      await supabaseAdmin
        .from("generations")
        .update({ status: "failed", error_message: message, coins_spent: 0 })
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
      .select("id, idea, status, provider, fal_request_id, video_url, error_message, created_at, episode_id")
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
      return {
        generation_id: row.id,
        status: "queued",
        video_url: null,
        error_message: null,
        created_at: row.created_at,
      };
    }

    const { providerProgress } = await import("@/lib/storyreel-core.server");
    const provider =
      row.provider === "fal" ? "fal" : row.provider === "live" ? "live" : "lovable";

    let progress;
    try {
      progress = await providerProgress(provider, row.fal_request_id);
    } catch (err) {
      return fail(err instanceof Error ? err.message : "Film generation isn't configured yet.");
    }

    if (progress.state === "failed") return fail(progress.message);

    if (progress.state !== "completed") {
      if (row.status !== "processing" && progress.state === "processing") {
        await supabaseAdmin.from("generations").update({ status: "processing" }).eq("id", row.id);
      }
      return {
        generation_id: row.id,
        status: progress.state,
        video_url: null,
        error_message: null,
        created_at: row.created_at,
        queue_position: progress.queue_position ?? null,
      };
    }

    const path = `${row.id}.mp4`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, progress.bytes, { contentType: "video/mp4", upsert: true });
    if (uploadError) {
      console.error("storage upload failed", uploadError);
      return fail("The finished video could not be saved.");
    }

    await supabaseAdmin
      .from("generations")
      .update({ status: "completed", video_url: path })
      .eq("id", row.id);

    // Publish the finished short as a free episode in the Jeje Inc Vibe Shorts feed.
    if (!row.episode_id) {
      const { count } = await supabaseAdmin
        .from("episodes")
        .select("id", { count: "exact", head: true })
        .eq("drama_id", STORYREEL_DRAMA_ID);

      const { data: episode } = await supabaseAdmin
        .from("episodes")
        .insert({
          drama_id: STORYREEL_DRAMA_ID,
          episode_number: (count ?? 0) + 1,
          title: row.idea.slice(0, 70),
          storage_path: path,
          coin_cost: 0,
          is_free: true,
          source_generation_id: row.id,
        })
        .select("id")
        .single();

      if (episode) {
        await supabaseAdmin
          .from("generations")
          .update({ episode_id: episode.id })
          .eq("id", row.id);
      }
    }

    return {
      generation_id: row.id,
      status: "completed",
      video_url: await signedUrl(path),
      error_message: null,
    };
  });

const historyInput = z.object({ session_id: z.string().uuid() });

type HistoryRow = {
  id: string;
  idea: string;
  style: string;
  status: string | null;
  created_at: string;
  video_url: string | null;
  error_message: string | null;
};

async function toHistoryItems(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  rows: HistoryRow[],
): Promise<HistoryItem[]> {
  return Promise.all(
    rows.map(async (row) => {
      let url: string | null = null;
        if (row.status === "completed" && row.video_url) {
          const { data: signed } = await supabaseAdmin.storage
            .from(BUCKET)
            .createSignedUrl(row.video_url, SIGNED_URL_TTL);
          url = signed?.signedUrl ?? null;
        }
        return {
          id: row.id,
          idea: row.idea,
          style: row.style,
          status: (row.status ?? "queued") as HistoryItem["status"],
          created_at: row.created_at,
          video_url: url,
          error_message: row.error_message,
        };
      }),
    );
}

const HISTORY_COLUMNS = "id, idea, style, status, created_at, video_url, error_message";

/** All shorts made in this browser, newest first, with playable links for finished ones. */
export const listGenerations = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => historyInput.parse(data))
  .handler(async ({ data }): Promise<HistoryItem[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("generations")
      .select(HISTORY_COLUMNS)
      .eq("session_id", data.session_id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error("Could not load your shorts.");
    return toHistoryItems(supabaseAdmin, rows ?? []);
  });

/** All shorts on the signed-in account, newest first — survives browser/device changes. */
export const listMyGenerations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HistoryItem[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("generations")
      .select(HISTORY_COLUMNS)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error("Could not load your shorts.");
    return toHistoryItems(supabaseAdmin, rows ?? []);
  });

export type ShowcaseShort = {
  id: string;
  idea: string;
  style: string;
  video_url: string;
};

/** Real finished shorts, newest first — used by the "Made with" gallery. */
export const listShowcase = createServerFn({ method: "GET" }).handler(
  async (): Promise<ShowcaseShort[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await supabaseAdmin
      .from("generations")
      .select("id, idea, style, video_url")
      .eq("status", "completed")
      .not("video_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(6);

    const out: ShowcaseShort[] = [];
    for (const row of rows ?? []) {
      if (!row.video_url) continue;
      const { data: signed } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(row.video_url, SIGNED_URL_TTL);
      if (!signed?.signedUrl) continue;
      out.push({
        id: row.id,
        idea: row.idea,
        style: row.style,
        video_url: signed.signedUrl,
      });
    }
    return out;
  },
);

const storyInput = z.object({
  theme: z.string().trim().min(1, "Give me a theme first.").max(200),
  style: z.enum(styleValues),
});

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** Turn a short theme into a single vivid 5-second short-film prompt. */
export const generateStory = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => storyInput.parse(data))
  .handler(async ({ data }): Promise<{ idea: string }> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("The story writer isn't available right now.");

    const styleLabel = STYLES.find((s) => s.value === data.style)?.label ?? "Cinematic";

    const res = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You write prompts for a text-to-video model that renders one continuous 5-second vertical shot. " +
              "Reply with ONE paragraph under 400 characters: a single scene with a clear subject, setting, " +
              "camera movement, lighting and mood. No scene lists, no dialogue, no titles, no quotation marks, " +
              "no camera brand names, no markdown.",
          },
          {
            role: "user",
            content: `Theme: ${data.theme}\nVisual style: ${styleLabel}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error("ai gateway failed", res.status, await res.text().catch(() => ""));
      throw new Error(
        res.status === 429
          ? "The story writer is busy. Try again in a moment."
          : "The story writer could not finish. Please try again.",
      );
    }

    const body = (await res.json().catch(() => null)) as
      | { choices?: { message?: { content?: string } }[] }
      | null;
    const idea = body?.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, "");
    if (!idea) throw new Error("The story writer came back empty. Please try again.");

    return { idea: idea.slice(0, 500) };
  });
