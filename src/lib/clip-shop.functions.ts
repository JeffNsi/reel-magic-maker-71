import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "@/lib/stripe.server";

/**
 * CLIP SALES — a single finished five-second clip sold on its own.
 *
 * Anyone can buy (signed in or not): a pending purchase row is created first,
 * the buyer pays with Stripe (card + Apple Pay / Google Pay on the page) or
 * SumUp, and the clip is only delivered once the provider confirms payment.
 * Delivery is a signed stream + download link, gated by the purchase's private
 * delivery token.
 */

/** What one clip costs, in kronor. */
export const CLIP_PRICE_SEK = 29;

export type ClipDelivery = {
  purchase_id: string;
  status: "pending" | "paid";
  /** Signed playback/download URL — only present once the payment is confirmed. */
  video_url: string | null;
  scene_title: string;
  film_title: string;
  amount: number;
  currency: string;
};

const startInput = z.object({
  scene_id: z.string().uuid(),
  email: z.string().email().optional(),
  provider: z.enum(["stripe", "sumup"]),
  origin: z.string().url(),
  environment: z.enum(["sandbox", "live"]).optional(),
});

type SceneForSale = {
  scene_id: string;
  story_id: string;
  scene_title: string;
  film_title: string;
  video_path: string;
};

async function loadSceneForSale(sceneId: string): Promise<SceneForSale> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: scene } = await supabaseAdmin
    .from("story_scenes")
    .select("id, story_id, title, scene_number, generation_id")
    .eq("id", sceneId)
    .maybeSingle();
  if (!scene) throw new Error("That clip could not be found.");
  if (!scene.generation_id) throw new Error("This scene has not been filmed yet.");

  const { data: generation } = await supabaseAdmin
    .from("generations")
    .select("status, video_url")
    .eq("id", scene.generation_id as string)
    .maybeSingle();
  if (!generation || generation.status !== "completed" || !generation.video_url) {
    throw new Error("This scene has not been filmed yet.");
  }

  const { data: story } = await supabaseAdmin
    .from("stories")
    .select("title")
    .eq("id", scene.story_id as string)
    .maybeSingle();

  return {
    scene_id: scene.id as string,
    story_id: scene.story_id as string,
    scene_title: (scene.title as string) || `Scene ${scene.scene_number}`,
    film_title: (story?.title as string) || "Untitled film",
    video_path: generation.video_url as string,
  };
}

function newToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

/**
 * Where SumUp should post its payment confirmation. It must be a public https
 * address, so a local/preview origin falls back to the stable published site.
 */
const PUBLISHED_SITE = "https://reel-magic-maker-71.lovable.app";
function sumupWebhookUrl(origin: string) {
  const base =
    origin.startsWith("https://") && !origin.includes("localhost") ? origin : PUBLISHED_SITE;
  return `${base}/api/public/payments/sumup-webhook`;
}

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
  if (!res.ok) throw new Error(body?.message || `SumUp request failed (${res.status})`);
  return body;
}

/**
 * Start a clip purchase. Returns the purchase id + delivery token the buyer's
 * browser keeps, plus whatever the chosen payment surface needs to render.
 */
export const startClipPurchase = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => startInput.parse(data))
  .handler(
    async ({
      data,
    }): Promise<
      | {
          purchase_id: string;
          delivery_token: string;
          amount: number;
          scene_title: string;
          film_title: string;
          client_secret?: string;
          checkout_id?: string;
        }
      | { error: string }
    > => {
      try {
        const scene = await loadSceneForSale(data.scene_id);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const environment: StripeEnv = (data.environment ?? "sandbox") as StripeEnv;
        const token = newToken();

        const { data: purchase, error } = await supabaseAdmin
          .from("clip_purchases")
          .insert({
            story_id: scene.story_id,
            scene_id: scene.scene_id,
            buyer_email: data.email ?? null,
            provider: data.provider,
            amount: CLIP_PRICE_SEK,
            currency: "SEK",
            status: "pending",
            environment: data.provider === "sumup" ? "live" : environment,
            delivery_token: token,
          })
          .select("id")
          .single();
        if (error || !purchase) throw new Error("Could not start the purchase.");
        const purchaseId = purchase.id as string;

        if (data.provider === "stripe") {
          const stripe = createStripeClient(environment);
          const session = await stripe.checkout.sessions.create({
            line_items: [
              {
                price_data: {
                  currency: "sek",
                  product_data: { name: `${scene.film_title} — ${scene.scene_title}` },
                  unit_amount: CLIP_PRICE_SEK * 100,
                },
                quantity: 1,
              },
            ],
            mode: "payment",
            ui_mode: "embedded_page",
            return_url: `${data.origin}/film/${scene.story_id}?clip=${purchaseId}`,
            payment_intent_data: { description: `Clip — ${scene.scene_title}` },
            ...(data.email && { customer_email: data.email }),
            metadata: { clip_purchase_id: purchaseId },
          } as any);

          await supabaseAdmin
            .from("clip_purchases")
            .update({ reference: `stripe:${session.id}` })
            .eq("id", purchaseId);

          return {
            purchase_id: purchaseId,
            delivery_token: token,
            amount: CLIP_PRICE_SEK,
            scene_title: scene.scene_title,
            film_title: scene.film_title,
            client_secret: session.client_secret ?? "",
          };
        }

        const payToEmail = process.env["SUMUP_PAY_TO_EMAIL"];
        if (!payToEmail) throw new Error("SUMUP_NOT_CONNECTED");
        const checkout = await sumupRequest("/v0.1/checkouts", {
          method: "POST",
          body: JSON.stringify({
            checkout_reference: `clip:${purchaseId}`,
            amount: CLIP_PRICE_SEK,
            currency: "SEK",
            pay_to_email: payToEmail,
            description: `${scene.film_title} — ${scene.scene_title}`,
            redirect_url: `${data.origin}/film/${scene.story_id}?clip=${purchaseId}`,
            // Server-to-server confirmation: SumUp posts here the moment the
            // payment settles, so the clip is delivered even if the buyer
            // closes the page.
            return_url: `${sumupWebhookUrl(data.origin)}`,
          }),
        });

        await supabaseAdmin
          .from("clip_purchases")
          .update({ reference: `sumup:${checkout.id}` })
          .eq("id", purchaseId);

        return {
          purchase_id: purchaseId,
          delivery_token: token,
          amount: CLIP_PRICE_SEK,
          scene_title: scene.scene_title,
          film_title: scene.film_title,
          checkout_id: checkout.id as string,
        };
      } catch (error: any) {
        if (error?.message === "SUMUP_NOT_CONNECTED") {
          return { error: "SumUp is not connected yet. Add your SumUp key to enable it." };
        }
        return { error: getStripeErrorMessage(error) };
      }
    },
  );

const deliveryInput = z.object({
  purchase_id: z.string().uuid(),
  delivery_token: z.string().min(20),
});

// ---------- Native Apple Pay via SumUp (no card widget) ----------

const appleSessionInput = z.object({
  checkout_id: z.string().min(1),
  /** The validation URL Apple hands us in onvalidatemerchant. */
  target: z.string().url(),
  /** The shop's own domain, e.g. "reel-magic-maker-71.lovable.app". */
  context: z.string().min(1),
});

/**
 * Merchant validation: Apple requires a session created server-side. We pass
 * Apple's validation URL straight to SumUp, which holds the merchant cert.
 */
export const sumupApplePaySession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => appleSessionInput.parse(data))
  .handler(async ({ data }): Promise<{ session: unknown } | { error: string }> => {
    try {
      const session = await sumupRequest(
        `/v0.1/checkouts/${data.checkout_id}/apple-pay-session`,
        {
          method: "PUT",
          body: JSON.stringify({ target: data.target, context: data.context }),
        },
      );
      return { session };
    } catch (error: any) {
      return { error: error?.message || "Could not validate the Apple Pay session." };
    }
  });

const appleProcessInput = z.object({
  checkout_id: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
  /** The payment token from the onpaymentauthorized callback. */
  token: z.record(z.string(), z.unknown()),
});

/** Charge the checkout with the Apple Pay token from the buyer's device. */
export const sumupApplePayProcess = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => appleProcessInput.parse(data))
  .handler(async ({ data }): Promise<{ paid: boolean } | { error: string }> => {
    try {
      const result = await sumupRequest(`/v0.1/checkouts/${data.checkout_id}`, {
        method: "PUT",
        body: JSON.stringify({
          payment_type: "apple_pay",
          amount: data.amount,
          currency: data.currency,
          apple_pay: { token: data.token },
        }),
      });
      return { paid: result?.status === "PAID" };
    } catch (error: any) {
      return { error: error?.message || "The Apple Pay payment failed." };
    }
  });

/**
 * Ask the payment provider whether this purchase is paid, then deliver the clip.
 * Safe to call repeatedly — the clip stays "pending" until the provider confirms.
 */
export const getClipDelivery = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => deliveryInput.parse(data))
  .handler(async ({ data }): Promise<ClipDelivery | { error: string }> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { signedUrl } = await import("@/lib/storyreel-core.server");

      const { data: row } = await supabaseAdmin
        .from("clip_purchases")
        .select(
          "id, scene_id, story_id, status, provider, reference, environment, amount, currency, delivery_token",
        )
        .eq("id", data.purchase_id)
        .maybeSingle();
      if (!row) return { error: "That purchase could not be found." };
      // The token is the buyer's proof of purchase — never deliver without it.
      if (row.delivery_token !== data.delivery_token) return { error: "Invalid delivery key." };

      let status = row.status as "pending" | "paid";
      const reference = (row.reference as string | null) ?? "";

      if (status !== "paid" && reference) {
        if (row.provider === "stripe" && reference.startsWith("stripe:")) {
          const stripe = createStripeClient(row.environment as StripeEnv);
          const session = await stripe.checkout.sessions.retrieve(
            reference.slice("stripe:".length),
          );
          if (session.payment_status === "paid") status = "paid";
        } else if (row.provider === "sumup" && reference.startsWith("sumup:")) {
          const checkout = await sumupRequest(
            `/v0.1/checkouts/${reference.slice("sumup:".length)}`,
            {
              method: "GET",
            },
          );
          if (checkout.status === "PAID") status = "paid";
        }
        if (status === "paid") {
          await supabaseAdmin
            .from("clip_purchases")
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("id", row.id as string);
        }
      }

      const scene = await loadSceneForSale(row.scene_id as string);

      return {
        purchase_id: row.id as string,
        status,
        video_url: status === "paid" ? await signedUrl(scene.video_path) : null,
        scene_title: scene.scene_title,
        film_title: scene.film_title,
        amount: Number(row.amount),
        currency: row.currency as string,
      };
    } catch (error: any) {
      return { error: error?.message || "Could not check the payment." };
    }
  });
