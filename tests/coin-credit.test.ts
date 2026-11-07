import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  creditArgs,
  CREDIT_MESSAGES,
  creditPurchaseWith,
  type CreditArgs,
  type CreditPort,
} from "@/lib/coin-credit";
import { COIN_PACKS, isShopPack, VIP_DAYS } from "@/lib/coin-packs";

const USER = "11111111-1111-4111-8111-111111111111";
const input = {
  userId: USER,
  reference: `${USER}:small:1`,
  provider: "sumup" as const,
  pack: "small" as const,
  environment: "live",
};

describe("pack table (unchanged prices and amounts)", () => {
  it("keeps the shop's prices, coins and the 30-day VIP pass", () => {
    expect(COIN_PACKS.small).toMatchObject({ amountSek: 49, paid: 500, bonus: 0, vipDays: 0 });
    expect(COIN_PACKS.medium).toMatchObject({ amountSek: 99, paid: 1000, bonus: 500, vipDays: 0 });
    expect(COIN_PACKS.large).toMatchObject({ amountSek: 249, paid: 3000, bonus: 2000, vipDays: 0 });
    expect(COIN_PACKS.vip).toMatchObject({ amountSek: 149, paid: 0, bonus: 0, vipDays: 30 });
    expect(VIP_DAYS).toBe(30);
  });

  it("recognises only known packs", () => {
    expect(["small", "medium", "large", "vip"].every(isShopPack)).toBe(true);
    expect(isShopPack("toString")).toBe(false);
    expect(isShopPack("huge")).toBe(false);
    expect(isShopPack(undefined)).toBe(false);
  });
});

describe("creditArgs (what the database is asked to credit)", () => {
  it("takes amounts from the pack table, never from the caller", () => {
    expect(creditArgs(input)).toEqual({
      _user: USER,
      _reference: `${USER}:small:1`,
      _provider: "sumup",
      _pack: "small",
      _amount: 49,
      _currency: "SEK",
      _environment: "live",
      _paid_coins: 500,
      _bonus_coins: 0,
      _vip_days: 0,
    });
    expect(creditArgs({ ...input, pack: "vip" })).toMatchObject({ _paid_coins: 0, _vip_days: 30 });
  });

  it("records the charged amount when the caller knows it (0 is kept)", () => {
    expect(creditArgs({ ...input, provider: "stripe", amount: 0 })._amount).toBe(0);
  });
});

describe("creditPurchaseWith (one database call per confirmation)", () => {
  const port = (data: unknown, error: unknown = null) =>
    vi.fn<CreditPort>(async (_args: CreditArgs) => ({ data, error }));

  it("first confirmation credits", async () => {
    const p = port({ status: "credited", paid_coins: 500, bonus_coins: 210 });
    await expect(creditPurchaseWith(p, input)).resolves.toEqual({ credited: true });
    expect(p).toHaveBeenCalledTimes(1);
  });

  it("a repeated confirmation or webhook is accepted without crediting again", async () => {
    await expect(creditPurchaseWith(port({ status: "already_credited" }), input)).resolves.toEqual({
      credited: false,
    });
  });

  it.each([
    ["profile_not_found", CREDIT_MESSAGES.profile_not_found],
    ["reference_conflict", CREDIT_MESSAGES.reference_conflict],
    ["not_creditable", CREDIT_MESSAGES.not_creditable],
    ["invalid", CREDIT_MESSAGES.failed],
    [undefined, CREDIT_MESSAGES.failed],
  ])("refusal %s throws, so nothing is reported as delivered", async (status, message) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(creditPurchaseWith(port({ status }), input)).rejects.toThrow(message);
    vi.restoreAllMocks();
  });

  it("a database error throws, so the caller can report it and a retry is safe", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      creditPurchaseWith(port({ status: "credited" }, { code: "57014" }), input),
    ).rejects.toThrow(CREDIT_MESSAGES.failed);
    expect(log).toHaveBeenCalledWith("credit_coin_purchase failed", {
      provider: "sumup",
      pack: "small",
      code: "57014",
    });
    log.mockRestore();
  });
});

describe("purchase paths (source checks)", () => {
  const shop = readFileSync("src/lib/shop.functions.ts", "utf8");
  const webhook = readFileSync("src/routes/api/public/payments/webhook.ts", "utf8");

  it("SumUp confirmation credits only through credit_coin_purchase", () => {
    const fn = shop.slice(shop.indexOf("async function fulfillPurchase"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toContain('opts.supabase.rpc("credit_coin_purchase", args)');
    expect(shop).not.toMatch(/from\("profiles"\)/);
    expect(shop).not.toMatch(/from\("coin_purchases"\)/);
  });

  it("the Stripe webhook credits only through credit_coin_purchase and fails loudly", () => {
    const fn = webhook.slice(webhook.indexOf("async function creditPack"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toContain('supabase.rpc("credit_coin_purchase", args)');
    expect(body).toContain("await creditPurchaseWith(");
    expect(body).not.toMatch(/paid_coins|bonus_coins|from\("coin_purchases"\)/);
    // A thrown error reaches the handler, which answers 400 so Stripe retries.
    expect(webhook).toContain('return new Response("Webhook error", { status: 400 });');
  });

  it("no server code writes a coin balance read earlier", () => {
    for (const src of [shop, webhook]) {
      expect(src).not.toMatch(/paid_coins:\s*profile\.paid_coins\s*\+/);
      expect(src).not.toMatch(/bonus_coins:\s*profile\.bonus_coins\s*\+/);
    }
  });
});
