import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

let _supabase: any = null;
function getSupabase(): any {
  if (!_supabase) {
    _supabase = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
    );
  }
  return _supabase;
}

const PACK_COINS: Record<string, { paid: number; bonus: number }> = {
  small: { paid: 500, bonus: 0 },
  medium: { paid: 1000, bonus: 500 },
  large: { paid: 3000, bonus: 2000 },
};

async function creditPack(userId: string, pack: string, reference: string, env: StripeEnv) {
  const supabase = getSupabase();

  const { data: claimed, error } = await supabase
    .from("coin_purchases")
    .upsert(
      {
        user_id: userId,
        reference,
        provider: "stripe",
        pack,
        amount: 0,
        currency: "SEK",
        status: "paid",
        environment: env,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "reference", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    console.error("coin_purchases upsert failed:", error);
    return;
  }
  if (!claimed || claimed.length === 0) return; // already fulfilled

  if (pack === "vip") {
    const until = new Date();
    until.setDate(until.getDate() + 30);
    await supabase
      .from("profiles")
      .update({ is_vip: true, vip_until: until.toISOString() })
      .eq("id", userId);
    return;
  }

  const coins = PACK_COINS[pack];
  if (!coins) return;
  const { data: profile } = await supabase
    .from("profiles")
    .select("paid_coins, bonus_coins")
    .eq("id", userId)
    .single();
  if (!profile) return;
  await supabase
    .from("profiles")
    .update({
      paid_coins: profile.paid_coins + coins.paid,
      bonus_coins: profile.bonus_coins + coins.bonus,
    })
    .eq("id", userId);
}

async function syncVipFromSubscription(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;
  const supabase = getSupabase();
  const item = subscription.items?.data?.[0];
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      product_id: item?.price?.product ?? "unknown",
      price_id:
        item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id,
      status: subscription.status,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );

  const active =
    ["active", "trialing"].includes(subscription.status) ||
    (subscription.status === "canceled" && periodEnd && periodEnd * 1000 > Date.now());
  await supabase
    .from("profiles")
    .update({
      is_vip: active,
      vip_until: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    })
    .eq("id", userId);
}

/** Confirmed payment for one clip — idempotent, only pending rows flip to paid. */
async function markClipPaid(purchaseId: string, reference: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("clip_purchases")
    .update({ status: "paid", reference, paid_at: new Date().toISOString() })
    .eq("id", purchaseId)
    .eq("status", "pending");
  if (error) console.error("clip_purchases update failed:", error);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.payment_status === "unpaid") break;
      const userId = session.metadata?.userId;
      const pack = session.metadata?.pack;
      if (userId && pack) {
        await creditPack(userId, pack, `stripe:${session.id}`, env);
      }
      // A single clip bought on the film page — mark it paid so it is delivered.
      const clipPurchaseId = session.metadata?.clip_purchase_id;
      if (clipPurchaseId) {
        await markClipPaid(clipPurchaseId, `stripe:${session.id}`);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await syncVipFromSubscription(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await syncVipFromSubscription({ ...event.data.object, status: "canceled" }, env);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
