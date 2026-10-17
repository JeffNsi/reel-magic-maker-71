import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapPayout, mapTx, type SumUpPayout, type SumUpTx } from "@/lib/sumup-account";

export type SumUpAccountResult =
  | { allowed: false }
  | { allowed: true; error: string }
  | {
      allowed: true;
      merchantName: string | null;
      currency: string;
      transactions: SumUpTx[];
      payouts: SumUpPayout[];
      fetchedAt: string;
    };

/** True only for accounts holding the admin role (checked server-side). */
export const getIsOwner = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { owner: data === true };
  });

/** Read-only SumUp overview for the owner: sales and payouts. Never moves money. */
export const getSumUpAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SumUpAccountResult> => {
    const { data: isOwner } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (isOwner !== true) return { allowed: false };

    const apiKey = process.env["SUMUP_API_KEY"];
    if (!apiKey)
      return { allowed: true, error: "SumUp is not connected. / SumUp är inte kopplat." };
    const get = async (path: string) => {
      const res = await fetch(`https://api.sumup.com${path}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`SumUp ${path.split("?")[0]} -> ${res.status}`);
      return res.json();
    };

    try {
      const me = await get("/v0.1/me");
      const profile = me?.merchant_profile ?? {};
      const code = String(profile.merchant_code ?? "");
      if (!code) throw new Error("SumUp merchant code missing");
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 864e5);
      const fromDay = new Date(now.getTime() - 90 * 864e5).toISOString().slice(0, 10);
      const toDay = now.toISOString().slice(0, 10);
      const [tx, payouts] = await Promise.all([
        get(
          `/v2.1/merchants/${encodeURIComponent(code)}/transactions/history?limit=100&order=descending&oldest_time=${encodeURIComponent(monthStart.toISOString())}`,
        ),
        get(
          `/v1.0/merchants/${encodeURIComponent(code)}/payouts?start_date=${fromDay}&end_date=${toDay}&limit=20&order=desc`,
        ).catch((e) => {
          console.error("[sumup-account] payouts", e);
          return [];
        }),
      ]);
      return {
        allowed: true,
        merchantName: typeof profile.company_name === "string" ? profile.company_name : null,
        currency: String(profile.default_currency ?? "SEK"),
        transactions: (Array.isArray(tx?.items) ? tx.items : []).map(mapTx),
        payouts: (Array.isArray(payouts) ? payouts : []).map(mapPayout),
        fetchedAt: now.toISOString(),
      };
    } catch (e) {
      console.error("[sumup-account]", e);
      return {
        allowed: true,
        error: "Could not reach SumUp right now. / Kunde inte nå SumUp just nu.",
      };
    }
  });
