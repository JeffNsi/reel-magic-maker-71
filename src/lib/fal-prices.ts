/**
 * Rough fal.ai list prices in USD per second of video, used ONLY for an
 * advisory budget estimate. fal.ai sets and changes its own prices; the
 * owner can overwrite the rate per model in the panel. Never used to block.
 */
export const FAL_USD_PER_SECOND: Record<string, number> = {
  "fal-ai/kling-video/v3/standard/text-to-video": 0.084,
};

const RATE_KEY = "storyreel_fal_rate:";
const BUDGET_KEY = "storyreel_scene_budget:";

function read(key: string): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function write(key: string, value: number | null) {
  if (typeof window === "undefined") return;
  if (value === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, String(value));
}

export const readRate = (modelId: string) =>
  read(RATE_KEY + modelId) ?? FAL_USD_PER_SECOND[modelId] ?? null;
export const writeRate = (modelId: string, v: number | null) => write(RATE_KEY + modelId, v);
export const readBudget = (sceneId: string) => read(BUDGET_KEY + sceneId);
export const writeBudget = (sceneId: string, v: number | null) => write(BUDGET_KEY + sceneId, v);

export type BudgetView = {
  perRun: number | null;
  spent: number | null;
  budget: number | null;
  over: boolean;
};

/** Pure advisory estimate: would one more press exceed the scene budget? */
export function budgetView(
  rate: number | null,
  secondsPerRun: number | null,
  completedSeconds: number,
  budget: number | null,
): BudgetView {
  const perRun = rate !== null && secondsPerRun ? rate * secondsPerRun : null;
  const spent = rate !== null ? rate * completedSeconds : null;
  const over = budget !== null && perRun !== null && spent !== null && spent + perRun > budget;
  return { perRun, spent, budget, over };
}

const MODEL_BUDGET_KEY = "storyreel_model_budget:";
export const readModelBudget = (modelId: string) => read(MODEL_BUDGET_KEY + modelId);
export const writeModelBudget = (modelId: string, v: number | null) =>
  write(MODEL_BUDGET_KEY + modelId, v);

export type SceneCreditRow = {
  scene_id: string;
  budget: number;
  spent: number;
  remaining: number;
  /** One more Ezy press would reach or pass the cap. Advisory only. */
  approaching: boolean;
};

/**
 * Pure: app credits a scene has spent. A scene holds one Ezy render at a time;
 * a failed render is not counted. Platform runs on fal.ai spend no app credits.
 */
export function sceneCredits(
  scene: { id: string; credit_cost: number; generation_id: string | null; status: string },
  pressCost: number,
): SceneCreditRow {
  const spent = scene.generation_id && scene.status !== "failed" ? pressCost : 0;
  const remaining = scene.credit_cost - spent;
  return {
    scene_id: scene.id,
    budget: scene.credit_cost,
    spent,
    remaining,
    approaching: spent + pressCost > scene.credit_cost,
  };
}
