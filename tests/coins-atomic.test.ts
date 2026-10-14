import { describe, expect, it } from "vitest";
import { NeedsCreditsError, withCharge, type CoinPort } from "@/lib/coin-charge";

/** Fake ledger mirroring spend_coins semantics: one critical section per call. */
function ledger(bonus: number, paid: number) {
  const state = { bonus, paid };
  let lock = Promise.resolve();
  const port: CoinPort = {
    spend: (_u, cost) => {
      const run = lock.then(() => {
        if (cost <= 0 || state.bonus + state.paid < cost) return null;
        const b = Math.min(state.bonus, cost);
        state.bonus -= b;
        state.paid -= cost - b;
        return { bonus: b, paid: cost - b };
      });
      lock = run.then(() => undefined);
      return run;
    },
    refund: async (_u, c) => {
      state.bonus += Math.max(c.bonus, 0);
      state.paid += Math.max(c.paid, 0);
    },
  };
  return { state, port };
}

describe("withCharge (behavioral, fake ledger)", () => {
  it("spends bonus first", async () => {
    const { state, port } = ledger(10, 20);
    const { charge } = await withCharge(port, "u", 14, async () => "ok");
    expect(charge).toEqual({ bonus: 10, paid: 4 });
    expect(state).toEqual({ bonus: 0, paid: 16 });
  });

  it("insufficient balance charges nothing and never starts", async () => {
    const { state, port } = ledger(5, 5);
    let started = false;
    await expect(
      withCharge(port, "u", 14, async () => {
        started = true;
      }),
    ).rejects.toBeInstanceOf(NeedsCreditsError);
    expect(started).toBe(false);
    expect(state).toEqual({ bonus: 5, paid: 5 });
  });

  it("two simultaneous presses with room for one charge once", async () => {
    const { state, port } = ledger(0, 20);
    const results = await Promise.allSettled([
      withCharge(port, "u", 14, async () => 1),
      withCharge(port, "u", 14, async () => 2),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(state.paid).toBe(6);
  });

  it("refunds the exact charge when the provider rejects the start", async () => {
    const { state, port } = ledger(3, 30);
    await expect(
      withCharge(port, "u", 14, async () => {
        throw new Error("provider rejected");
      }),
    ).rejects.toThrow("provider rejected");
    expect(state).toEqual({ bonus: 3, paid: 30 });
  });

  it("zero cost (fal engines) never touches the ledger", async () => {
    const { state, port } = ledger(0, 0);
    await withCharge(port, "u", 0, async () => "ok");
    expect(state).toEqual({ bonus: 0, paid: 0 });
  });
});
