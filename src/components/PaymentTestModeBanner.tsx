const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;

export function PaymentTestModeBanner() {
  if (!clientToken) return null;
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full border-b border-dw-gold/30 bg-dw-gold/10 px-4 py-2 text-center text-xs text-dw-foreground">
        All payments made in the preview are in test mode — no real money is charged.
      </div>
    );
  }
  return null;
}
