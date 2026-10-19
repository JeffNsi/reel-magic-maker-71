import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { Download, Loader2, Play, ShoppingBag, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import {
  CLIP_PRICE_SEK,
  getClipDelivery,
  startClipPurchase,
  sumupApplePayProcess,
  sumupApplePaySession,
  type ClipDelivery,
} from "@/lib/clip-shop.functions";

/**
 * Buying one finished clip. Anyone can buy — signed in or not. The clip is only
 * handed over once the payment provider confirms the payment, and until then the
 * card shows that the purchase is still being confirmed.
 */

type Stored = { purchase_id: string; delivery_token: string };

function storageKey(sceneId: string) {
  return `clip-purchase:${sceneId}`;
}

function readStored(sceneId: string): Stored | null {
  try {
    const raw = localStorage.getItem(storageKey(sceneId));
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

let sumupSdkPromise: Promise<void> | null = null;
function loadSumUpSdk(): Promise<void> {
  if (!sumupSdkPromise) {
    sumupSdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load the SumUp card form."));
      document.head.appendChild(script);
    });
  }
  return sumupSdkPromise;
}

export function ClipPurchase({
  sceneId,
  ready,
  onDelivered,
}: {
  sceneId: string;
  /** Only a finished clip can be sold. */
  ready: boolean;
  onDelivered?: () => void;
}) {
  const start = useServerFn(startClipPurchase);
  const check = useServerFn(getClipDelivery);

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [stored, setStored] = useState<Stored | null>(null);
  const [delivery, setDelivery] = useState<ClipDelivery | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [sumupCheckoutId, setSumupCheckoutId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sumupMounted = useRef(false);

  useEffect(() => setStored(readStored(sceneId)), [sceneId]);

  // Poll for confirmation while the purchase is still pending.
  useEffect(() => {
    if (!stored) return;
    let stop = false;
    const run = async () => {
      const result = await check({ data: stored });
      if (stop) return;
      if ("error" in result) return;
      setDelivery(result);
      if (result.status === "paid") {
        setOpen(false);
        onDelivered?.();
        return;
      }
      setTimeout(run, 4000);
    };
    run();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);

  const begin = async (provider: "stripe" | "sumup") => {
    setBusy(true);
    try {
      const result = await start({
        data: {
          scene_id: sceneId,
          provider,
          origin: window.location.origin,
          ...(email ? { email } : {}),
          ...(provider === "stripe" ? { environment: getStripeEnvironment() } : {}),
        },
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const next = { purchase_id: result.purchase_id, delivery_token: result.delivery_token };
      localStorage.setItem(storageKey(sceneId), JSON.stringify(next));
      setStored(next);
      if (provider === "stripe") setClientSecret(result.client_secret ?? null);
      else setSumupCheckoutId(result.checkout_id ?? null);
    } catch (e: any) {
      toast.error(e?.message || "Could not start the purchase.");
    } finally {
      setBusy(false);
    }
  };

  // Native Apple Pay (Safari/iOS) — no card widget, straight through SumUp.
  const canApplePay =
    typeof window !== "undefined" &&
    !!(window as any).ApplePaySession &&
    (window as any).ApplePaySession.canMakePayments();

  // Prepare the SumUp checkout before the press: Safari requires session.begin()
  // synchronously inside the user gesture, so nothing may be awaited on tap.
  type Prepared = Extract<Awaited<ReturnType<typeof start>>, { purchase_id: string }>;
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const preparing = useRef(false);
  useEffect(() => {
    if (!open || !canApplePay || prepared || preparing.current) return;
    preparing.current = true;
    start({ data: { scene_id: sceneId, provider: "sumup", origin: window.location.origin } })
      .then((result) => {
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        setPrepared(result as Prepared);
      })
      .catch((e: any) => toast.error(e?.message || "Could not start the purchase."))
      .finally(() => {
        preparing.current = false;
      });
  }, [open, canApplePay, prepared, sceneId, start]);

  const payWithApplePay = () => {
    const result = prepared;
    if (!result) return;
    try {
      const next = { purchase_id: result.purchase_id, delivery_token: result.delivery_token };
      localStorage.setItem(storageKey(sceneId), JSON.stringify(next));
      setStored(next);

      const APS = (window as any).ApplePaySession;
      const session = new APS(3, {
        countryCode: "SE",
        currencyCode: "SEK",
        merchantCapabilities: ["supports3DS"],
        supportedNetworks: ["masterCard", "visa"],
        total: {
          label: `${result.film_title} — ${result.scene_title}`,
          amount: String(result.amount),
          type: "final",
        },
      });

      session.onvalidatemerchant = async (event: any) => {
        try {
          const validated = await sumupApplePaySession({
            data: {
              checkout_id: result.checkout_id!,
              target: event.validationURL,
              context: window.location.hostname,
            },
          });
          if ("error" in validated) throw new Error(validated.error);
          session.completeMerchantValidation(validated.session);
        } catch (e: any) {
          session.abort();
          toast.error(e?.message || "Apple Pay could not be started.");
        }
      };

      session.onpaymentauthorized = async (event: any) => {
        try {
          const processed = await sumupApplePayProcess({
            data: {
              checkout_id: result.checkout_id!,
              amount: result.amount,
              currency: "SEK",
              token: event.payment.token,
            },
          });
          if ("error" in processed || !processed.paid) {
            session.completePayment(APS.STATUS_FAILURE);
            toast.error("error" in processed ? processed.error : "The payment failed. Try again.");
            return;
          }
          session.completePayment(APS.STATUS_SUCCESS);
          toast.success("Payment received — delivering your clip.");
          const current = readStored(sceneId);
          if (current) setStored({ ...current });
        } catch (e: any) {
          session.completePayment(APS.STATUS_FAILURE);
          toast.error(e?.message || "The payment failed. Try again.");
        }
      };

      session.oncancel = () => toast.message("The payment was cancelled.");
      session.begin();
    } catch (e: any) {
      toast.error(e?.message || "Could not start the purchase.");
    }
  };

  // SumUp card + wallet form (Apple Pay on Safari/iOS, Google Pay elsewhere).
  useEffect(() => {
    if (!sumupCheckoutId || sumupMounted.current) return;
    sumupMounted.current = true;
    (async () => {
      try {
        await loadSumUpSdk();
        (window as any).SumUpCard?.mount({
          id: `sumup-clip-${sceneId}`,
          checkoutId: sumupCheckoutId,
          locale: "sv-SE",
          country: "SE",
          currency: "SEK",
          amount: CLIP_PRICE_SEK,
          showAmount: true,
          applePay: true,
          googlePay: true,
          onResponse: async (type: string) => {
            if (type === "success") {
              toast.success("Payment received — delivering your clip.");
              const current = readStored(sceneId);
              if (current) setStored({ ...current });
            } else if (type === "error") {
              toast.error("The payment failed. Try again.");
            }
          },
        });
      } catch (e: any) {
        toast.error(e?.message || "Could not load the card form.");
      }
    })();
  }, [sumupCheckoutId, sceneId]);

  if (!ready) return null;

  const delivered = delivery?.status === "paid" && delivery.video_url;
  const awaiting = !!stored && delivery?.status === "pending";

  return (
    <>
      {delivered ? (
        <div className="mt-3 rounded-xl border border-border bg-card/60 p-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Your clip</p>
          <video
            src={delivery!.video_url!}
            controls
            playsInline
            className="mt-2 aspect-[9/16] w-full max-w-[220px] rounded-lg bg-black"
          />
          <a href={delivery!.video_url!} download className="mt-2 inline-flex">
            <Button size="sm" variant="secondary">
              <Download className="mr-2 h-4 w-4" /> Download MP4
            </Button>
          </a>
        </div>
      ) : awaiting ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-card/60 p-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            Waiting for the payment to be confirmed — your clip appears here as soon as it is.
          </span>
          <button
            type="button"
            className="ml-auto shrink-0 text-xs underline underline-offset-4 hover:text-primary"
            onClick={() => {
              localStorage.removeItem(storageKey(sceneId));
              setStored(null);
              setDelivery(null);
            }}
          >
            Start over
          </button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          onClick={() => setOpen(true)}
          disabled={busy}
        >
          <ShoppingBag className="mr-2 h-4 w-4" /> Buy this clip — {CLIP_PRICE_SEK} kr
        </Button>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setClientSecret(null);
            setSumupCheckoutId(null);
            sumupMounted.current = false;
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Buy this clip — {CLIP_PRICE_SEK} kr</DialogTitle>
          </DialogHeader>

          {!clientSecret && !sumupCheckoutId && (
            <div className="space-y-3">
              <Input
                type="email"
                inputMode="email"
                placeholder="Your e-mail (for the receipt)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {canApplePay && (
                <Button className="w-full" onClick={payWithApplePay} disabled={busy || !prepared}>
                  Pay with Apple Pay
                </Button>
              )}
              <Button
                className="w-full"
                variant={canApplePay ? "secondary" : "default"}
                onClick={() => begin("stripe")}
                disabled={busy}
              >
                <Wallet className="mr-2 h-4 w-4" /> Card, Apple Pay or Google Pay
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => begin("sumup")}
                disabled={busy}
              >
                Pay with SumUp
              </Button>
              <p className="text-xs text-muted-foreground">
                <Play className="mr-1 inline h-3 w-3" />
                The clip plays and downloads here the moment the payment is confirmed.
              </p>
            </div>
          )}

          {clientSecret && (
            <EmbeddedCheckoutProvider stripe={getStripe()} options={{ clientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )}

          {sumupCheckoutId && (
            <div className="rounded-xl bg-white p-2">
              <div id={`sumup-clip-${sceneId}`} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
