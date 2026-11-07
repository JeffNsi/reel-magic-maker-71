/**
 * Crediting a confirmed coin or VIP purchase. Recording the purchase and
 * crediting the buyer happen in one database transaction
 * (public.credit_coin_purchase, service role only): exactly once per payment
 * reference, as increments, and never "paid" without the coins. This module
 * builds the call from the pack table and maps the result.
 */
import { COIN_PACKS, type ShopPack } from "@/lib/coin-packs";

export type CreditInput = {
  userId: string;
  reference: string;
  provider: "sumup" | "stripe";
  pack: ShopPack;
  environment: string;
  /** Amount actually charged, when the caller knows it; defaults to the pack price. */
  amount?: number;
};

export type CreditArgs = {
  _user: string;
  _reference: string;
  _provider: string;
  _pack: string;
  _amount: number;
  _currency: string;
  _environment: string;
  _paid_coins: number;
  _bonus_coins: number;
  _vip_days: number;
};

/** The database call, injected so the mapping is tested without a database. */
export type CreditPort = (args: CreditArgs) => PromiseLike<{ data: unknown; error: unknown }>;

export const CREDIT_MESSAGES = {
  failed: "Could not record the purchase.",
  profile_not_found: "Could not load your profile.",
  reference_conflict: "This payment belongs to another account.",
  not_creditable: "This payment can no longer be credited.",
} as const;

export function creditArgs(input: CreditInput): CreditArgs {
  const pack = COIN_PACKS[input.pack];
  return {
    _user: input.userId,
    _reference: input.reference,
    _provider: input.provider,
    _pack: input.pack,
    _amount: input.amount ?? pack.amountSek,
    _currency: "SEK",
    _environment: input.environment,
    _paid_coins: pack.paid,
    _bonus_coins: pack.bonus,
    _vip_days: pack.vipDays,
  };
}

/**
 * Credit through the injected port. Returns credited: true the first time and
 * credited: false for a payment that was already credited. Anything else
 * throws, so the caller can report it and the payment can be retried safely.
 */
export async function creditPurchaseWith(
  port: CreditPort,
  input: CreditInput,
): Promise<{ credited: boolean }> {
  const { data, error } = await port(creditArgs(input));
  if (error) {
    console.error("credit_coin_purchase failed", {
      provider: input.provider,
      pack: input.pack,
      code: (error as { code?: unknown })?.code ?? null,
    });
    throw new Error(CREDIT_MESSAGES.failed);
  }
  const status =
    data && typeof data === "object" ? (data as Record<string, unknown>)["status"] : undefined;
  if (status === "credited") return { credited: true };
  if (status === "already_credited") return { credited: false };
  if (
    status === "profile_not_found" ||
    status === "reference_conflict" ||
    status === "not_creditable"
  ) {
    console.error("credit_coin_purchase refused", { provider: input.provider, status });
    throw new Error(CREDIT_MESSAGES[status]);
  }
  console.error("credit_coin_purchase unexpected result", { provider: input.provider, status });
  throw new Error(CREDIT_MESSAGES.failed);
}
