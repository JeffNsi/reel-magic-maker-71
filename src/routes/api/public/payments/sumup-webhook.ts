import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * SUMUP PAYMENT CONFIRMATION
 *
 * SumUp posts here when a checkout changes state (the URL is sent as the
 * checkout's `return_url`). The body itself is never trusted: we take only the
 * checkout id from it and ask SumUp's API for the authoritative status with our
 * own key. When that says PAID, the matching clip purchase flips to paid and the
 * buyer's delivery link starts working immediately.
 *
 * Idempotent: only rows still marked "pending" are updated.
 */

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

async function fetchCheckout(checkoutId: string) {
  const apiKey = process.env["SUMUP_API_KEY"];
  if (!apiKey) throw new Error("SumUp is not connected.");
  const res = await fetch(`https://api.sumup.com/v0.1/checkouts/${checkoutId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `SumUp lookup failed (${res.status})`);
  return body as { id: string; status?: string; checkout_reference?: string; amount?: number };
}

export const Route = createFileRoute("/api/public/payments/sumup-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: any = {};
        try {
          payload = await request.json();
        } catch {
          payload = {};
        }

        const checkoutId: string | undefined =
          payload?.id ?? payload?.checkout_id ?? payload?.payload?.id;
        if (!checkoutId || typeof checkoutId !== "string") {
          return Response.json({ received: true, ignored: "no checkout id" });
        }

        try {
          const checkout = await fetchCheckout(checkoutId);
          if (checkout.status !== "PAID") {
            return Response.json({ received: true, status: checkout.status ?? "unknown" });
          }

          const reference = checkout.checkout_reference ?? "";
          if (!reference.startsWith("clip:")) {
            // Coin packs are confirmed by the signed-in buyer's own session.
            return Response.json({ received: true, ignored: "not a clip purchase" });
          }

          const purchaseId = reference.slice("clip:".length);
          const supabase = getSupabase();
          const { error } = await supabase
            .from("clip_purchases")
            .update({
              status: "paid",
              reference: `sumup:${checkout.id}`,
              paid_at: new Date().toISOString(),
            })
            .eq("id", purchaseId)
            .eq("status", "pending");
          if (error) {
            console.error("clip_purchases sumup settle failed:", error);
            return new Response("Could not record the payment", { status: 500 });
          }

          return Response.json({ received: true, settled: purchaseId });
        } catch (e) {
          console.error("SumUp webhook error:", e);
          return new Response("SumUp webhook error", { status: 400 });
        }
      },
    },
  },
});
