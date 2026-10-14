/**
 * Film render orchestration over injected ports, so it is tested with fakes.
 * The server function wires the real ports (renderSceneCore, profile balance).
 */
import { NeedsCreditsError } from "@/lib/coin-charge";
import { filmReady, preflight, scenesToStart, type SceneJobState } from "@/lib/scene-job";

export type FilmRenderOutcome =
  | { status: "ready"; started: string[]; skipped: string[] }
  | { status: "generating"; started: string[]; skipped: string[] }
  | { status: "needs_credits"; started: string[]; skipped: string[]; cost: number; balance: number };

export async function orchestrateFilmRender(opts: {
  scenes: SceneJobState[];
  balance: number;
  costPerScene: number;
  /** Starts one scene through the charged core; throws NeedsCreditsError when the debit fails. */
  start: (scene_id: string) => Promise<void>;
}): Promise<FilmRenderOutcome> {
  const pending = scenesToStart(opts.scenes);
  const skipped = opts.scenes.map((s) => s.scene_id).filter((id) => !pending.includes(id));

  if (!pending.length) {
    return { status: filmReady(opts.scenes) ? "ready" : "generating", started: [], skipped };
  }

  const check = preflight(pending.length, opts.costPerScene, opts.balance);
  if (!check.ok) {
    return { status: "needs_credits", started: [], skipped, cost: check.cost, balance: opts.balance };
  }

  const started: string[] = [];
  for (const id of pending) {
    try {
      await opts.start(id);
      started.push(id);
    } catch (err) {
      if (err instanceof NeedsCreditsError) {
        return { status: "needs_credits", started, skipped, cost: check.cost, balance: opts.balance };
      }
      throw err;
    }
  }
  return { status: "generating", started, skipped };
}
