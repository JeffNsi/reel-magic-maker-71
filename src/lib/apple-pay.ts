/** Browser wallet types; no browser access at module evaluation time. */
export type ApplePayToken = Record<string, unknown>;
export type WalletSession = {
  onvalidatemerchant: ((event: { validationURL: string }) => void) | null;
  onpaymentauthorized: ((event: { payment: { token: ApplePayToken } }) => void) | null;
  oncancel: (() => void) | null;
  begin(): void;
  abort(): void;
  completeMerchantValidation(session: unknown): void;
  completePayment(status: number): void;
};
export type WalletConstructor = {
  new(version: number, request: {
    countryCode: string;
    currencyCode: string;
    merchantCapabilities: string[];
    supportedNetworks: string[];
    total: { label: string; amount: string; type: string };
  }): WalletSession;
  canMakePayments(): boolean;
  STATUS_SUCCESS: number;
  STATUS_FAILURE: number;
};
export function getApplePay(): WalletConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { ApplePaySession?: WalletConstructor }).ApplePaySession;
}