/**
 * Pure policy for film scene jobs: what the cron tick does with one generation,
 * which scenes startFilmRender still has to start, and when a film is ready.
 */

export const SCENE_DEADLINE_MINUTES = 30;
/** Retries after the first attempt. */
export const MAX_SCENE_RETRIES = 2;

export type JobRow = {
  status: string | null;
  deadline_at: string | null;
  attempts: number | null;
  video_url: string | null;
  refunded: boolean | null;
  charged_bonus: number | null;
  charged_paid: number | null;
};

export type TickAction = "done" | "poll" | "expire" | "settled";

/** In-flight → poll until the deadline, then expire. Finished rows need nothing. */
export function tickAction(row: JobRow, now: Date): TickAction {
  if (row.status === "completed") return "done";
  if (row.status === "failed") return "settled";
  if (row.deadline_at && new Date(row.deadline_at).getTime() <= now.getTime()) return "expire";
  return "poll";
}

/** Refund only an unrefunded, charged job that produced no clip. */
export function shouldRefund(row: JobRow): boolean {
  const charged = (row.charged_bonus ?? 0) + (row.charged_paid ?? 0) > 0;
  return charged && !row.refunded && !row.video_url;
}

/** attempts counts starts made: 1 = first try. Retries allowed up to MAX_SCENE_RETRIES. */
export function canRetry(row: Pick<JobRow, "attempts">): boolean {
  return (row.attempts ?? 1) - 1 < MAX_SCENE_RETRIES;
}

export function deadlineFrom(now: Date): string {
  return new Date(now.getTime() + SCENE_DEADLINE_MINUTES * 60_000).toISOString();
}

export type SceneJobState = {
  scene_id: string;
  status: "idle" | "queued" | "processing" | "completed" | "failed";
  has_clip: boolean;
};

/** Scenes startFilmRender must still start: never one in flight or done. */
export function scenesToStart(scenes: SceneJobState[]): string[] {
  return scenes
    .filter(
      (s) =>
        s.status === "idle" || s.status === "failed" || (s.status === "completed" && !s.has_clip),
    )
    .map((s) => s.scene_id);
}

export function preflight(
  pending: number,
  costPerScene: number,
  balance: number,
): { ok: true; cost: number } | { ok: false; cost: number; reason: "needs_credits" } {
  const cost = pending * costPerScene;
  return balance >= cost ? { ok: true, cost } : { ok: false, cost, reason: "needs_credits" };
}

/** A film is ready only when every scene has a completed, stored clip. */
export function filmReady(scenes: SceneJobState[]): boolean {
  return scenes.length > 0 && scenes.every((s) => s.status === "completed" && s.has_clip);
}

/** Scene clips belong to films and are published only via publishReadyFilm. */
export function shouldAutoPublish(row: { story_id: string | null; episode_id: string | null }) {
  return !row.story_id && !row.episode_id;
}
