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
