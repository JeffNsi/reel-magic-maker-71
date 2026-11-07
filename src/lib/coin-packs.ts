/**
 * The coin and VIP packs: price, what each credits and how long VIP lasts.
 * One source of truth for the shop, the payment webhook and the database
 * credit (public.credit_coin_purchase). Shared by server and client.
 */
export type ShopPack = "small" | "medium" | "large" | "vip";

export const VIP_DAYS = 30;

export const COIN_PACKS: Record<
  ShopPack,
  {
    priceId: string;
    amountSek: number;
    paid: number;
    bonus: number;
    vipDays: number;
    name: string;
  }
> = {
  small: {
    priceId: "coins_small",
    amountSek: 49,
    paid: 500,
    bonus: 0,
    vipDays: 0,
    name: "Starter Coin Pack",
  },
  medium: {
    priceId: "coins_medium",
    amountSek: 99,
    paid: 1000,
    bonus: 500,
    vipDays: 0,
    name: "Popular Coin Pack",
  },
  large: {
    priceId: "coins_large",
    amountSek: 249,
    paid: 3000,
    bonus: 2000,
    vipDays: 0,
    name: "Mega Coin Pack",
  },
  vip: {
    priceId: "vip_monthly",
    amountSek: 149,
    paid: 0,
    bonus: 0,
    vipDays: VIP_DAYS,
    name: "VIP Pass",
  },
};

export function isShopPack(value: unknown): value is ShopPack {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(COIN_PACKS, value);
}
