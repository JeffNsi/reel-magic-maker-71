/**
 * Cron tick for film scene jobs. Server-only. Polls in-flight scene renders,
 * stores finished clips (never publishes them), expires jobs past their
 * deadline with an exact refund, retries through the charged core, and marks
 * a film ready only when every scene has a completed, stored clip.
 */
import { canRetry, filmReady, shouldRefund, tickAction, type JobRow } from "@/lib/scene-job";

const TICK_LIMIT = 10;

type Row = JobRow & {
  id: string;
  story_id: string;
  user_id: string | null;
  provider: string;
  fal_request_id: string | null;
};

export async function runFilmTick(now = new Date()) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { providerProgress, BUCKET } = await import("@/lib/storyreel-core.server");

  const { data } = await supabaseAdmin
    .from("generations")
    .select(
      "id, story_id, user_id, status, provider, fal_request_id, deadline_at, attempts, video_url, refunded, charged_bonus, charged_paid",
    )
    .not("story_id", "is", null)
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: true })
    .limit(TICK_LIMIT);

  const rows = (data ?? []) as Row[];
  const touched = new Set<string>();
  const report = { polled: 0, completed: 0, expired: 0, failed: 0, retried: 0 };

  for (const row of rows) {
    touched.add(row.story_id);
    let action = tickAction(row, now);

    if (action === "poll") {
      if (!row.fal_request_id) continue;
      report.polled++;
      const provider = row.provider === "fal" ? "fal" : row.provider === "live" ? "live" : "lovable";
      const progress = await providerProgress(provider, row.fal_request_id).catch(() => null);
      if (!progress || progress.state === "queued" || progress.state === "processing") continue;
      if (progress.state === "completed") {
        const path = `${row.id}.mp4`;
        const { error } = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(path, progress.bytes, { contentType: "video/mp4", upsert: true });
        if (!error) {
          await supabaseAdmin
            .from("generations")
            .update({ status: "completed", video_url: path })
            .eq("id", row.id);
          report.completed++;
          continue;
        }
      }
      action = "expire";
      report.failed++;
    } else if (action === "expire") {
      report.expired++;
    }

    if (action === "expire" && (await settleFailed(row))) {
      if (await retry(row)) report.retried++;
    }
  }

  for (const story_id of touched) await refreshFilmStatus(story_id);
  return report;
}

/** Fail the job once (guarded update), refunding only a charged job with no clip. */
async function settleFailed(row: Row): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const refund = shouldRefund(row);
  const { data: claimed } = await supabaseAdmin
    .from("generations")
    .update({
      status: "failed",
      error_message:
        "This scene did not finish in time. Any credits were returned. / Scenen blev inte klar i tid. Eventuella credits har återbetalats.",
      ...(refund ? { refunded: true } : {}),
    })
    .eq("id", row.id)
    .in("status", ["queued", "processing"])
    .select("id");
  if (!claimed?.length) return false;

  if (refund && row.user_id) {
    const { dbCoins } = await import("@/lib/coins.server");
    await dbCoins.refund(row.user_id, { bonus: row.charged_bonus ?? 0, paid: row.charged_paid ?? 0 });
  }
  return true;
}

/** Retry through the charged core as the film's stored owner, if retries remain. */
async function retry(row: Row): Promise<boolean> {
  if (!canRetry(row)) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: scene } = await supabaseAdmin
    .from("story_scenes")
    .select("id")
    .eq("generation_id", row.id)
    .maybeSingle();
  const { data: story } = await supabaseAdmin
    .from("stories")
    .select("id, session_id, user_id")
    .eq("id", row.story_id)
    .maybeSingle();
  if (!scene || !story?.user_id) return false;

  const { renderSceneCore } = await import("@/lib/film.functions");
  try {
    await renderSceneCore({
      film_id: story.id as string,
      session_id: story.session_id as string,
      scene_id: scene.id as string,
      engine: row.provider === "fal" ? "fal" : row.provider === "live" ? "live" : "lovable",
      audio: false,
      user_id: story.user_id as string,
      attempt: (row.attempts ?? 1) + 1,
    });
    return true;
  } catch (err) {
    console.info("scene retry not started", err instanceof Error ? err.message : "unknown");
    return false;
  }
}

async function refreshFilmStatus(story_id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: scenes } = await supabaseAdmin
    .from("story_scenes")
    .select("id, generation_id")
    .eq("story_id", story_id);
  const ids = (scenes ?? []).map((s) => s.generation_id as string | null).filter((v): v is string => !!v);
  const { data: gens } = ids.length
    ? await supabaseAdmin.from("generations").select("id, status, video_url, attempts").in("id", ids)
    : { data: [] };
  const byId = new Map((gens ?? []).map((g) => [g.id as string, g]));
  const states = (scenes ?? []).map((s) => {
    const g = s.generation_id ? byId.get(s.generation_id as string) : undefined;
    return {
      scene_id: s.id as string,
      status: ((g?.status as string) ?? "idle") as "idle",
      has_clip: !!g?.video_url,
      exhausted: g?.status === "failed" && !canRetry({ attempts: (g?.attempts as number) ?? 1 }),
    };
  });
  const status = filmReady(states)
    ? "ready"
    : states.some((s) => s.exhausted)
      ? "failed"
      : "generating";
  await supabaseAdmin.from("stories").update({ status }).eq("id", story_id);
}
