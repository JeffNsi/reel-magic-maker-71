/** The real coin port: atomic database functions, service role only. */
import type { Charge, CoinPort } from "@/lib/coin-charge";

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
    if (error) console.error("refund_coins failed", user, charge, error.message);
  },
};
