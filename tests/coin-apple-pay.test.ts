import { describe, expect, it } from "vitest";
import { assertAppleValidationUrl, assertCoinCheckout } from "@/lib/coin-apple-pay";

describe("coin Apple Pay checkout authorization", () => {
  const checkout = { checkout_reference: "owner:small:123", amount: 49, currency: "SEK" };
  it("accepts the owner's 49 SEK Starter checkout", () => {
    expect(() => assertCoinCheckout(checkout, "owner", "small", 49)).not.toThrow();
  });
  it("rejects another user's checkout", () => {
    expect(() => assertCoinCheckout(checkout, "other", "small", 49)).toThrow("Ogiltigt köp");
  });
  it("rejects a different pack", () => {
    expect(() => assertCoinCheckout(checkout, "owner", "large", 249)).toThrow();
  });
  it("rejects mismatched amounts", () => {
    expect(() => assertCoinCheckout({ ...checkout, amount: 1 }, "owner", "small", 49)).toThrow();
  });
  it("rejects a different currency", () => {
    expect(() =>
      assertCoinCheckout({ ...checkout, currency: "EUR" }, "owner", "small", 49),
    ).toThrow();
  });
  it("accepts Apple's HTTPS gateway", () => {
    expect(() =>
      assertAppleValidationUrl("https://apple-pay-gateway.apple.com/paymentservices/startSession"),
    ).not.toThrow();
  });
  it.each([
    "https://apple-pay-gateway.apple.com.evil.test/",
    "http://apple-pay-gateway.apple.com/",
    "https://example.com/",
  ])("rejects non-Apple validation %s", (url) => {
    expect(() => assertAppleValidationUrl(url)).toThrow();
  });
});
