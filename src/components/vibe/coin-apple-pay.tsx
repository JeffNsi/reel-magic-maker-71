import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Apple, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApplePay } from "@/lib/apple-pay";
import { coinApplePaySession, coinApplePayProcess, createSumUpCheckout, confirmSumUpCheckout, type ShopPack } from "@/lib/shop.functions";
import { useLocale } from "@/hooks/use-locale";

export function CoinApplePay({ pack, onSuccess }: { pack: ShopPack; onSuccess: () => void }) {
  const { locale } = useLocale();
  const sv = locale === "sv";
  const create = useServerFn(createSumUpCheckout);
  const validate = useServerFn(coinApplePaySession);
  const process = useServerFn(coinApplePayProcess);
  const confirm = useServerFn(confirmSumUpCheckout);
  const [available, setAvailable] = useState(false);
  const [checkout, setCheckout] = useState<{ checkoutId: string; amount: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setCheckout(null);
    const APS = getApplePay();
    if (!APS?.canMakePayments()) return;
    setAvailable(true);
    // Prepare before the press: Safari requires session.begin() inside the user gesture.
    void create({ data: { pack, origin: window.location.origin } }).then((result) => {
      if (cancelled) return;
      if ("error" in result) setError(result.error);
      else setCheckout(result);
    }).catch(() => { if (!cancelled) setError(sv ? "Köpet kunde inte förberedas." : "Could not prepare checkout."); });
    return () => { cancelled = true; };
  }, [pack, create, attempt, sv]);

  const pay = () => {
    const APS = getApplePay();
    if (!APS || !checkout || busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = new APS(3, {
        countryCode: "SE", currencyCode: "SEK", merchantCapabilities: ["supports3DS"],
        supportedNetworks: ["masterCard", "visa"],
        total: { label: "Shortizereel — Coin Shop", amount: checkout.amount.toFixed(2), type: "final" },
      });
      session.onvalidatemerchant = async (event) => {
        try {
          const result = await validate({ data: { pack, checkoutId: checkout.checkoutId, target: event.validationURL, context: window.location.hostname } });
          if ("error" in result) throw new Error(result.error);
          session.completeMerchantValidation(result.session);
        } catch (failure) {
          session.abort(); setBusy(false);
          setError(failure instanceof Error ? failure.message : "Apple Pay failed. / Apple Pay misslyckades.");
        }
      };
      session.onpaymentauthorized = async (event) => {
        try {
          const result = await process({ data: { pack, checkoutId: checkout.checkoutId, token: event.payment.token } });
          if ("error" in result) throw new Error(result.error);
          if (!result.paid) throw new Error(sv ? "Betalningen är inte bekräftad." : "Payment has not been confirmed.");
          session.completePayment(APS.STATUS_SUCCESS);
          const delivered = await confirm({ data: { pack, checkoutId: checkout.checkoutId } });
          if ("error" in delivered) throw new Error(delivered.error);
          if (!delivered.paid) throw new Error(sv ? "Köpet väntar på bekräftelse." : "Purchase awaiting confirmation.");
          onSuccess();
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "Apple Pay failed. / Apple Pay misslyckades.");
        } finally { setBusy(false); }
      };
      session.oncancel = () => { setBusy(false); setError(sv ? "Betalningen avbröts." : "Payment cancelled."); };
      session.begin();
    } catch (failure) {
      setBusy(false); setError(failure instanceof Error ? failure.message : "Apple Pay failed. / Apple Pay misslyckades.");
    }
  };

  if (!available) return null;
  return <div className="space-y-2">
    <Button className="w-full" onClick={pay} disabled={!checkout || busy}>
      {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Apple className="mr-2 size-4" />}
      {sv ? "Betala med Apple Pay" : "Pay with Apple Pay"}
    </Button>
    {error && <div role="alert" className="text-sm text-destructive">
      <p>{error}</p>
      <Button variant="ghost" size="sm" onClick={() => { setError(null); if (!checkout) setAttempt((n) => n + 1); }}>{sv ? "Stäng" : "Dismiss"}</Button>
    </div>}
  </div>;
}