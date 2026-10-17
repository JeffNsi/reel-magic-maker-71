/** Validate provider-owned checkout facts before using it for a coin purchase. */
export function assertCoinCheckout(
  checkout: { checkout_reference?: unknown; amount?: unknown; currency?: unknown },
  userId: string,
  pack: string,
  amount: number,
): void {
  if (
    typeof checkout.checkout_reference !== "string" ||
    !checkout.checkout_reference.startsWith(`${userId}:${pack}:`) ||
    Number(checkout.amount) !== amount ||
    checkout.currency !== "SEK"
  ) {
    throw new Error("Invalid purchase. / Ogiltigt köp.");
  }
}

export function assertAppleValidationUrl(target: string): void {
  const url = new URL(target);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !(
      url.hostname === "apple-pay-gateway.apple.com" ||
      /^apple-pay-gateway-[a-z0-9-]+\.apple\.com$/.test(url.hostname)
    )
  )
    throw new Error("Invalid Apple Pay validation address. / Ogiltig Apple Pay-valideringsadress.");
}
