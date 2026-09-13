import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
} from "@/lib/stripe.server";

export type ShopPack = "small" | "medium" | "large" | "vip";

const PACKS: Record<
  ShopPack,
  { priceId: string; amountSek: number; paid: number; bonus: number; name: string }
> = {
  small: { priceId: "coins_small", amountSek: 49, paid: 500, bonus: 0, name: "Starter Coin Pack" },
  medium: {
    priceId: "coins_medium",
    amountSek: 99,
    paid: 1000,
    bonus: 500,
    name: "Popular Coin Pack",
  },
  large: {
    priceId: "coins_large",
    amountSek: 249,
    paid: 3000,
    bonus: 2000,
    name: "Mega Coin Pack",
  },
  vip: { priceId: "vip_monthly", amountSek: 149, paid: 0, bonus: 0, name: "VIP Pass" },
};

const packInput = z.object({
  pack: z.enum(["small", "medium", "large", "vip"]),
  returnUrl: z.string().url(),
  environment: z.enum(["sandbox", "live"]),
});

/** Credit coins / VIP after a confirmed payment. Idempotent via coin_purchases.reference. */
async function fulfillPurchase(opts: {
  supabase: any;
  userId: string;
  pack: ShopPack;
  provider: string;
  reference: string;
  environment: string;
}) {
  const pack = PACKS[opts.pack];
  const { data: claimed, error } = await opts.supabase
    .from("coin_purchases")
    .upsert(
      {
        user_id: opts.userId,
        reference: opts.reference,
        provider: opts.provider,
        pack: opts.pack,
        amount: pack.amountSek,
        currency: "SEK",
        status: "paid",
        environment: opts.environment,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "reference", ignoreDuplicates: true },
    )
    .select("id");

  if (error) throw new Error("Could not record the purchase.");
  // Already fulfilled — nothing to credit again.
  if (!claimed || claimed.length === 0) return { credited: false as const };

  if (opts.pack === "vip") {
    const until = new Date();
    until.setDate(until.getDate() + 30);
    await opts.supabase
      .from("profiles")
      .update({ is_vip: true, vip_until: until.toISOString() })
      .eq("id", opts.userId);
    return { credited: true as const };
  }

  const { data: profile, error: pErr } = await opts.supabase
    .from("profiles")
    .select("paid_coins, bonus_coins")
    .eq("id", opts.userId)
    .single();
  if (pErr || !profile) throw new Error("Could not load your profile.");

  await opts.supabase
    .from("profiles")
    .update({
      paid_coins: profile.paid_coins + pack.paid,
      bonus_coins: profile.bonus_coins + pack.bonus,
    })
    .eq("id", opts.userId);
  return { credited: true as const };
}

// ---------- Built-in payments (Stripe) ----------

export const createShopCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => packInput.parse(data))
  .handler(
    async ({ data, context }): Promise<{ clientSecret: string } | { error: string }> => {
      const pack = PACKS[data.pack];
      const isVip = data.pack === "vip";
      try {
        const stripe = createStripeClient(data.environment as StripeEnv);

        const { data: authData } = await context.supabase.auth.getUser();
        const email = authData.user?.email ?? undefined;

        // Resolve or create a Stripe Customer carrying userId metadata.
        let customerId: string | undefined;
        const found = await stripe.customers.search({
          query: `metadata['userId']:'${context.userId}'`,
          limit: 1,
        });
        if (found.data.length) {
          customerId = found.data[0]!.id;
        } else {
          const created = await stripe.customers.create({
            ...(email && { email }),
            metadata: { userId: context.userId },
          });
          customerId = created.id;
        }

        const prices = await stripe.prices.list({ lookup_keys: [pack.priceId] });
        if (!prices.data.length) throw new Error("Price not found");
        const stripePrice = prices.data[0]!;

        const session = await stripe.checkout.sessions.create({
          line_items: [{ price: stripePrice.id, quantity: 1 }],
          mode: isVip ? "subscription" : "payment",
          ui_mode: "embedded_page",
          return_url: data.returnUrl,
          customer: customerId,
          ...(!isVip && { payment_intent_data: { description: pack.name } }),
          metadata: { userId: context.userId, pack: data.pack, managed_payments: "true" },
          ...(isVip && {
            subscription_data: { metadata: { userId: context.userId, pack: "vip" } },
          }),
          // Stripe handles tax compliance, fraud protection and disputes end
          // to end for buyers in ~80 supported countries.
          managed_payments: { enabled: true },
        } as any);

        return { clientSecret: session.client_secret ?? "" };
      } catch (error) {
        return { error: getStripeErrorMessage(error) };
      }
    },
  );

// ---------- SumUp checkout (card widget) ----------

const sumupInput = z.object({ pack: z.enum(["small", "medium", "large", "vip"]) });
const sumupCreateInput = sumupInput.extend({ origin: z.string().url() });

async function sumupRequest(path: string, init: RequestInit) {
  const apiKey = process.env["SUMUP_API_KEY"];
  if (!apiKey) throw new Error("SUMUP_NOT_CONNECTED");
  const res = await fetch(`https://api.sumup.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message || `SumUp request failed (${res.status})`);
  }
  return body;
}

export const createSumUpCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sumupInput.parse(data))
  .handler(
    async ({ data, context }): Promise<{ checkoutId: string } | { error: string }> => {
      const pack = PACKS[data.pack];
      try {
        const payToEmail = process.env["SUMUP_PAY_TO_EMAIL"];
        if (!payToEmail) throw new Error("SUMUP_NOT_CONNECTED");
        const reference = `${context.userId}:${data.pack}:${Date.now()}`;
        const checkout = await sumupRequest("/v0.1/checkouts", {
          method: "POST",
          body: JSON.stringify({
            checkout_reference: reference,
            amount: pack.amountSek,
            currency: "SEK",
            pay_to_email: payToEmail,
            description: `Jeje Inc Vibe — ${pack.name}`,
          }),
        });
        return { checkoutId: checkout.id as string };
      } catch (error: any) {
        if (error?.message === "SUMUP_NOT_CONNECTED") {
          return { error: "SumUp is not connected yet. Add your SumUp API key to enable it." };
        }
        return { error: error?.message || "Could not start the SumUp checkout." };
      }
    },
  );

export const confirmSumUpCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ pack: z.enum(["small", "medium", "large", "vip"]), checkoutId: z.string() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ paid: boolean } | { error: string }> => {
    try {
      const checkout = await sumupRequest(`/v0.1/checkouts/${data.checkoutId}`, { method: "GET" });
      if (checkout.status !== "PAID") return { paid: false };
      const reference = checkout.checkout_reference as string;
      // Guard: the reference must belong to this caller.
      if (!reference.startsWith(`${context.userId}:`)) throw new Error("Invalid reference.");
      const result = await fulfillPurchase({
        supabase: context.supabase,
        userId: context.userId,
        pack: data.pack,
        provider: "sumup",
        reference,
        environment: "live",
      });
      return { paid: true, ...result };
    } catch (error: any) {
      return { error: error?.message || "Could not verify the SumUp payment." };
    }
  });

// ---------- SumUp payment links ----------

export const getSumUpLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sumupInput.parse(data))
  .handler(async ({ data }): Promise<{ url: string } | { error: string }> => {
    const key = `SUMUP_LINK_${data.pack.toUpperCase()}`;
    const url = process.env[key];
    if (!url) {
      return {
        error: "No SumUp payment link saved for this pack yet. Create it in the SumUp app and add it as a secret.",
      };
    }
    return { url };
  });
