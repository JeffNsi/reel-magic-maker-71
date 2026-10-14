/**
 * Charging around a paid start. Pure orchestration over an injected coin port,
 * so it is tested with a fake ledger; the real port calls the atomic
 * spend_coins / refund_coins database functions.
 */
import { NEEDS_CREDITS_MESSAGE } from "@/lib/pricing";

export type Charge = { bonus: number; paid: number };

export type CoinPort = {
  /** Atomic: debits bonus first, then paid; null when the balance is too low. */
  spend(user: string, cost: number): Promise<Charge | null>;
  refund(user: string, charge: Charge): Promise<void>;
};

export class NeedsCreditsError extends Error {
  readonly code = "needs_credits";
  constructor() {
    super(NEEDS_CREDITS_MESSAGE);
  }
}

/**
 * Debit `cost`, then run the paid start. If the start throws (the provider
 * rejected the job before it could cost anything) the exact charge is refunded
 * and the error is rethrown. A zero cost runs without touching the ledger.
 */
export async function withCharge<T>(
  port: CoinPort,
  user: string,
  cost: number,
  run: (charge: Charge) => Promise<T>,
): Promise<{ result: T; charge: Charge }> {
  const none: Charge = { bonus: 0, paid: 0 };
  if (cost <= 0) return { result: await run(none), charge: none };

  const charge = await port.spend(user, cost);
  if (!charge) throw new NeedsCreditsError();
  try {
    return { result: await run(charge), charge };
  } catch (err) {
    await port.refund(user, charge);
    throw err;
  }
}
