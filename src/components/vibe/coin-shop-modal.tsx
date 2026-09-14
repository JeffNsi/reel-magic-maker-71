import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  createShopCheckout,
  createSumUpCheckout,
  confirmSumUpCheckout,
  getSumUpLink,
  type ShopPack,
} from "@/lib/shop.functions";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Coins, CreditCard, Crown, ExternalLink, Sparkles } from "lucide-react";

const PACK_LABELS: Record<ShopPack, string> = {
  small: "Starter Coin Pack",
  medium: "Popular Coin Pack",
  large: "Mega Coin Pack",
  vip: "VIP Pass",
};

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

function SumUpCardForm({
  pack,
  onSuccess,
}: {
  pack: ShopPack;
  onSuccess: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const createFn = useServerFn(createSumUpCheckout);
  const confirmFn = useServerFn(confirmSumUpCheckout);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await createFn({ data: { pack, origin: window.location.origin } });
      if ("error" in result) {
        if (!cancelled) setError(result.error);
        return;
      }
      try {
        await loadSumUpSdk();
        if (cancelled || !containerRef.current) return;
        (window as any).SumUpCard?.mount({
          id: "sumup-card-container",
          checkoutId: result.checkoutId,
          locale: "sv-SE",
          country: "SE",
          currency: "SEK",
          amount: pack.amountSek,
          showAmount: true,
          // Wallet buttons (Apple Pay on Safari/iOS, Google Pay elsewhere).
          applePay: true,
          googlePay: true,
          onResponse: async (type: string) => {
            if (type === "success") {
              const confirm = await confirmFn({
                data: { pack, checkoutId: result.checkoutId },
              });
              if ("error" in confirm) {
                toast.error(confirm.error);
                return;
              }
              if (confirm.paid) {
                toast.success("Payment complete — coins added!");
                onSuccess();
              }
            } else if (type === "error") {
              toast.error("The payment failed. Try again.");
            }
          },
        });
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Could not load the card form.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack]);

  if (error) {
    return <p className="rounded-xl border border-dw-border bg-dw-background/50 p-4 text-center text-sm text-dw-muted">{error}</p>;
  }
  return (
    <div className="rounded-xl bg-white p-2">
      <div id="sumup-card-container" ref={containerRef} />
    </div>
  );
}

function EmbeddedCheckoutView({
  pack,
  userId,
}: {
  pack: ShopPack;
  userId: string;
}) {
  const createFn = useServerFn(createShopCheckout);
  const fetchClientSecret = async (): Promise<string> => {
    const result = await createFn({
      data: {
        pack,
        returnUrl: window.location.href,
        environment: getStripeEnvironment(),
      },
    });
    if ("error" in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error("Could not start checkout.");
    return result.clientSecret;
  };

  return (
    <div id="checkout" className="max-h-[70vh] overflow-y-auto rounded-xl">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}

type Method = "builtin" | "sumup" | "sumup_link";

export function CoinShopModal({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}) {
  const [tab, setTab] = useState<"coins" | "vip">("coins");
  const [selectedPack, setSelectedPack] = useState<ShopPack | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const linkFn = useServerFn(getSumUpLink);

  useEffect(() => {
    if (open) {
      supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    } else {
      setSelectedPack(null);
      setMethod(null);
    }
  }, [open]);

  const handleSuccess = () => {
    onSuccess?.();
    onOpenChange(false);
  };

  const openSumUpLink = async (pack: ShopPack) => {
    const result = await linkFn({ data: { pack } });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
    toast.message("Payment link opened in a new tab. Your coins are added when the payment is confirmed.");
  };

  const back = () => {
    if (method) setMethod(null);
    else setSelectedPack(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl border-dw-border bg-dw-card text-dw-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-center text-xl font-bold">
            {(selectedPack || method) && (
              <button
                onClick={back}
                aria-label="Back"
                className="absolute left-4 top-4 rounded-full p-1 text-dw-muted transition-colors hover:text-dw-foreground"
              >
                <ArrowLeft className="size-5" />
              </button>
            )}
            Coin Shop
          </DialogTitle>
        </DialogHeader>

        {!selectedPack && (
          <>
            <div className="mt-2 flex rounded-full bg-dw-background p-1">
              <button
                onClick={() => setTab("coins")}
                className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
                  tab === "coins" ? "bg-dw-card text-dw-foreground shadow" : "text-dw-muted"
                }`}
              >
                Coins
              </button>
              <button
                onClick={() => setTab("vip")}
                className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
                  tab === "vip" ? "bg-dw-card text-dw-foreground shadow" : "text-dw-muted"
                }`}
              >
                VIP
              </button>
            </div>

            {tab === "coins" ? (
              <div className="mt-4 space-y-3">
                <CoinPack
                  name="Starter"
                  coins={500}
                  price="49 SEK"
                  icon={<Coins className="size-6 text-dw-gold" />}
                  onClick={() => setSelectedPack("small")}
                />
                <CoinPack
                  name="Popular"
                  coins={1500}
                  bonus="+500 bonus"
                  price="99 SEK"
                  icon={<Sparkles className="size-6 text-dw-primary" />}
                  highlight
                  onClick={() => setSelectedPack("medium")}
                />
                <CoinPack
                  name="Mega"
                  coins={5000}
                  bonus="+2000 bonus"
                  price="249 SEK"
                  icon={<Coins className="size-6 text-dw-gold" />}
                  onClick={() => setSelectedPack("large")}
                />
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dw-gold/20 bg-dw-gold/5 p-5 text-center">
                <Crown className="mx-auto size-10 text-dw-gold" aria-hidden />
                <h3 className="mt-3 text-lg font-bold">VIP Pass</h3>
                <p className="mt-1 text-sm text-dw-muted">Unlimited access for 30 days</p>
                <p className="mt-3 text-2xl font-bold dw-gold-text">149 SEK/month</p>
                <Button
                  onClick={() => setSelectedPack("vip")}
                  className="mt-4 h-12 w-full rounded-xl dw-btn-gold text-sm font-semibold"
                >
                  Get VIP
                </Button>
              </div>
            )}
          </>
        )}

        {selectedPack && !method && (
          <div className="mt-4 space-y-3">
            <p className="text-center text-sm text-dw-muted">
              How do you want to pay for <span className="font-semibold text-dw-foreground">{PACK_LABELS[selectedPack]}</span>?
            </p>
            <MethodButton
              title="Card"
              subtitle="Secure checkout in the app"
              icon={<CreditCard className="size-5 text-dw-primary" />}
              onClick={() => setMethod("builtin")}
            />
            <MethodButton
              title="SumUp"
              subtitle="Pay by card through SumUp"
              icon={<CreditCard className="size-5 text-dw-gold" />}
              onClick={() => setMethod("sumup")}
            />
            <MethodButton
              title="SumUp payment link"
              subtitle="Opens a SumUp page in a new tab"
              icon={<ExternalLink className="size-5 text-dw-muted" />}
              onClick={() => openSumUpLink(selectedPack)}
            />
          </div>
        )}

        {selectedPack && method === "builtin" && userId && (
          <div className="mt-4">
            <EmbeddedCheckoutView pack={selectedPack} userId={userId} />
          </div>
        )}

        {selectedPack && method === "sumup" && (
          <div className="mt-4">
            <SumUpCardForm pack={selectedPack} onSuccess={handleSuccess} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MethodButton({
  title,
  subtitle,
  icon,
  onClick,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-dw-border bg-dw-background/50 p-4 text-left transition-colors hover:bg-dw-card-hover"
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-dw-card">{icon}</div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-dw-muted">{subtitle}</p>
      </div>
    </button>
  );
}

function CoinPack({
  name,
  coins,
  price,
  bonus,
  icon,
  highlight,
  onClick,
}: {
  name: string;
  coins: number;
  price: string;
  bonus?: string;
  icon: ReactNode;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left transition-colors ${
        highlight
          ? "border-dw-primary/30 bg-dw-primary/5"
          : "border-dw-border bg-dw-background/50 hover:bg-dw-card-hover"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-dw-card">{icon}</div>
        <div>
          <p className="font-semibold">{name}</p>
          <p className="text-xs text-dw-muted">
            {coins.toLocaleString()} coins {bonus && <span className="text-dw-gold">{bonus}</span>}
          </p>
        </div>
      </div>
      <span className="text-sm font-bold">{price}</span>
    </button>
  );
}
