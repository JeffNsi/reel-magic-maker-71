/** The real coin port: atomic database functions, service role only. */
import type { Charge, CoinPort } from "@/lib/coin-charge";

const REFUND_FAILED_MESSAGE =
  "Credits could not be returned; the refund must be retried. / Credits kunde inte återbetalas; återbetalningen måste försökas igen.";

export async function refundGeneration(generation: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("refund_generation", { _generation: generation });
  if (error) {
    console.error("refund_generation failed", { generation, code: error.code });
    throw new Error(REFUND_FAILED_MESSAGE);
  }
  return data === true;
}

export const dbCoins: CoinPort = {
  async spend(user, cost) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("spend_coins", { _user: user, _cost: cost });
    if (error) throw new Error("Could not charge credits. Nothing was started. Please try again.");
    const row = (data as { bonus_spent: number; paid_spent: number }[] | null)?.[0];
    return row ? { bonus: row.bonus_spent, paid: row.paid_spent } : null;
  },
  async refund(user, charge: Charge) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("refund_coins", {
      _user: user,
      _bonus: charge.bonus,
      _paid: charge.paid,
    });
    if (error) {
      console.error("refund_coins failed", { user, charge, code: error.code });
      throw new Error(REFUND_FAILED_MESSAGE);
    }
  },
  refundGeneration,
};
