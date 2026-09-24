import { createServerFn } from "@tanstack/react-start";

/**
 * Read-only fal.ai account balance. fal only lets an ADMIN key read billing;
 * an ordinary generation key gets 403. We try FAL_ADMIN_KEY first, then the
 * house FAL_KEY, and say honestly which state we are in. Topping up happens on
 * fal.ai's own billing page — fal offers no API to charge a card from an app.
 */

export const FAL_BILLING_URL = "https://fal.ai/dashboard/billing";

export type FalBalance =
  | { status: "ok"; balance: number; currency: string }
  | { status: "needs_admin_key" }
  | { status: "no_key" }
  | { status: "unavailable" };

function findBalance(payload: unknown): { balance: number; currency: string } | null {
  const root = (payload ?? {}) as Record<string, unknown>;
  const credits = (root["credits"] ?? root) as Record<string, unknown>;
  const value = credits["current_balance"] ?? credits["balance"];
  if (typeof value !== "number") return null;
  const currency = typeof credits["currency"] === "string" ? credits["currency"] : "USD";
  return { balance: value, currency };
}

export const getFalBalance = createServerFn({ method: "GET" }).handler(
  async (): Promise<FalBalance> => {
    const keys = [process.env["FAL_ADMIN_KEY"], process.env["FAL_KEY"]].filter(
      (k): k is string => !!k && !!k.trim(),
    );
    if (!keys.length) return { status: "no_key" };
    let denied = false;
    for (const key of keys) {
      try {
        const res = await fetch("https://api.fal.ai/v1/account/billing?expand=credits", {
          headers: { Authorization: `Key ${key.trim()}` },
        });
        if (res.status === 401 || res.status === 403) {
          denied = true;
          continue;
        }
        if (!res.ok) continue;
        const found = findBalance(await res.json());
        if (found) return { status: "ok", ...found };
      } catch (err) {
        console.error("fal balance read failed", err);
      }
    }
    return denied ? { status: "needs_admin_key" } : { status: "unavailable" };
  },
);
