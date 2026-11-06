import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  AD_REWARDS_ENABLED,
  claimCheckinWith,
  DAILY_REWARDS,
  interpretCheckin,
  REWARD_MESSAGES,
  type CheckinPort,
} from "@/lib/rewards";

const USER = "11111111-1111-4111-8111-111111111111";
const PROFILE = {
  id: USER,
  email: "u@example.com",
  paid_coins: 0,
  bonus_coins: 230,
  is_vip: false,
  vip_until: null,
  last_checkin_date: "2026-11-06",
  checkin_streak: 1,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-06T22:00:00Z",
};

describe("daily check-in result mapping", () => {
  it("returns the updated profile and the reward", () => {
    expect(interpretCheckin({ status: "claimed", reward: 20, profile: PROFILE })).toEqual({
      id: USER,
      email: "u@example.com",
      paid_coins: 0,
      bonus_coins: 230,
      is_vip: false,
      vip_until: null,
      last_checkin_date: "2026-11-06",
      checkin_streak: 1,
      reward: 20,
    });
  });

  it("keeps the existing message for a second claim the same day", () => {
    expect(() => interpretCheckin({ status: "already_claimed" })).toThrow(
      "You already checked in today.",
    );
  });

  it.each([
    [null],
    [{ status: "invalid" }],
    [{ status: "claimed" }],
    [{ status: "claimed", reward: 20 }],
    [{ status: "claimed", reward: -1, profile: PROFILE }],
    [{ status: "claimed", reward: 20, profile: { ...PROFILE, bonus_coins: "230" } }],
    [{ status: "claimed", reward: 20, profile: { ...PROFILE, id: 7 } }],
  ])("never reports a claim from a malformed result: %j", (raw) => {
    expect(() => interpretCheckin(raw)).toThrow(REWARD_MESSAGES.failed);
  });

  it("maps a missing profile to the existing profile message", () => {
    expect(() => interpretCheckin({ status: "profile_not_found" })).toThrow(
      "Could not load your profile.",
    );
  });
});

describe("claimCheckinWith (one database call per request)", () => {
  it("sends the signed-in user and the reward table, nothing from the browser", async () => {
    const port = vi.fn<CheckinPort>(async () => ({
      data: { status: "claimed", reward: 20, profile: PROFILE },
      error: null,
    }));
    await claimCheckinWith(port, USER);
    expect(port).toHaveBeenCalledTimes(1);
    expect(port).toHaveBeenCalledWith(USER, [20, 60, 80, 100, 100, 100, 100]);
  });

  it("duplicate requests are decided by the database, never credited twice here", async () => {
    let claimed = false;
    const port: CheckinPort = async () => {
      const first = !claimed;
      claimed = true;
      return first
        ? { data: { status: "claimed", reward: 20, profile: PROFILE }, error: null }
        : { data: { status: "already_claimed" }, error: null };
    };
    const results = await Promise.allSettled([
      claimCheckinWith(port, USER),
      claimCheckinWith(port, USER),
      claimCheckinWith(port, USER),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(2);
  });

  it("turns a database error into a plain failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const port: CheckinPort = async () => ({ data: null, error: { code: "42501" } });
    await expect(claimCheckinWith(port, USER)).rejects.toThrow(REWARD_MESSAGES.failed);
    expect(log).toHaveBeenCalledWith("claim_daily_checkin failed", { code: "42501" });
    log.mockRestore();
  });

  it("uses the same reward table the rewards page shows", () => {
    expect(DAILY_REWARDS).toEqual([20, 60, 80, 100, 100, 100, 100]);
    const page = readFileSync("src/routes/vibe.rewards.tsx", "utf8");
    expect(page).toContain("const REWARDS = DAILY_REWARDS;");
  });
});

describe("server functions (source checks)", () => {
  const src = readFileSync("src/lib/vibe.functions.ts", "utf8");
  const body = (name: string) => {
    const start = src.indexOf(`export const ${name}`);
    return src.slice(start, src.indexOf("\n  });", start));
  };

  it("claimDailyCheckin only calls the atomic database function", () => {
    const fn = body("claimDailyCheckin").replace(/\s+/g, " ");
    expect(fn).toContain('rpc("claim_daily_checkin", { _user: user, _rewards: rewards })');
    expect(fn).toContain("context.userId");
    expect(fn).not.toContain(".update(");
    expect(fn).not.toContain("bonus_coins");
  });

  it("watchAd credits nothing: no verified ad provider exists", () => {
    const fn = body("watchAd");
    expect(fn).toContain("throw new Error(REWARD_MESSAGES.ads_paused)");
    expect(fn).not.toMatch(/\.update\(|\.insert\(|\.rpc\(|supabase/);
    expect(AD_REWARDS_ENABLED).toBe(false);
  });

  it("no server code writes bonus coins from a value read earlier", () => {
    expect(src).not.toMatch(/bonus_coins:\s*profile\.bonus_coins\s*\+/);
    expect(src).not.toContain("adminProfiles");
  });

  it("the rewards page shows ads as paused instead of promising coins", () => {
    const page = readFileSync("src/routes/vibe.rewards.tsx", "utf8");
    expect(page).toContain("{AD_REWARDS_ENABLED ? <WatchAdCard /> : <AdRewardsPausedCard />}");
    expect(page).toContain(
      "Myntbelöningar för reklam är pausade tills verifierade annonser finns.",
    );
  });
});

describe("watchAd endpoint behaviour (missing verification and repeated calls)", () => {
  it("refuses every call, however often it is repeated", async () => {
    vi.resetModules();
    vi.doMock("@tanstack/react-start", () => ({
      createServerFn: () => {
        const builder = {
          middleware: () => builder,
          inputValidator: () => builder,
          handler: (fn: (ctx: unknown) => Promise<unknown>) => fn,
        };
        return builder;
      },
    }));
    vi.doMock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
    const writes = vi.fn();
    vi.doMock("@/integrations/supabase/client.server", () => ({
      supabaseAdmin: { from: writes, rpc: writes },
    }));
    const { watchAd } = (await import("@/lib/vibe.functions")) as unknown as {
      watchAd: (ctx: unknown) => Promise<unknown>;
    };
    for (let i = 0; i < 5; i += 1) {
      await expect(watchAd({ context: { userId: USER } })).rejects.toThrow(
        REWARD_MESSAGES.ads_paused,
      );
    }
    expect(writes).not.toHaveBeenCalled();
    vi.doUnmock("@tanstack/react-start");
    vi.doUnmock("@/integrations/supabase/auth-middleware");
    vi.doUnmock("@/integrations/supabase/client.server");
  });
});
