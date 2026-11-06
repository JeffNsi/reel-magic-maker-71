/**
 * Free-coin rewards (daily check-in, ads). Rewards are credited only by the
 * database (public.claim_daily_checkin, service role only), which locks the
 * profile, records a unique reward event and increments atomically. This
 * module holds the shared constants and turns the database result into the
 * app's result or error message. Shared by server and client: no secrets.
 */
import type { Profile } from "@/lib/vibe.functions";

/** Reward per day of the 7-day check-in streak (also shown on the rewards page). */
export const DAILY_REWARDS = [20, 60, 80, 100, 100, 100, 100] as const;

/**
 * Coin rewards for ads stay off until a real ad provider confirms each viewing
 * server-side with a unique, signed event id. There is no such integration yet:
 * the previous button only ran a 5-second timer in the browser.
 */
export const AD_REWARDS_ENABLED: boolean = false;

export const REWARD_MESSAGES = {
  already_claimed: "You already checked in today.",
  profile_not_found: "Could not load your profile.",
  failed: "Could not record check-in.",
  ads_paused:
    "Ad rewards are paused until verified ads are available. / Reklambelöningar är pausade tills verifierade annonser finns.",
} as const;

export type CheckinPort = (
  user: string,
  rewards: number[],
) => PromiseLike<{ data: unknown; error: unknown }>;

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isTextOrNull = (v: unknown) => v === null || typeof v === "string";

/** Map the database result to the updated profile plus reward, or throw the message. */
export function interpretCheckin(raw: unknown): Profile & { reward: number } {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const status = row?.["status"];
  if (status === "already_claimed") throw new Error(REWARD_MESSAGES.already_claimed);
  if (status === "profile_not_found") throw new Error(REWARD_MESSAGES.profile_not_found);
  if (status !== "claimed") throw new Error(REWARD_MESSAGES.failed);

  const reward = row?.["reward"];
  const p = row?.["profile"];
  const profile = p && typeof p === "object" ? (p as Record<string, unknown>) : null;
  if (
    !isInt(reward) ||
    reward < 0 ||
    !profile ||
    typeof profile["id"] !== "string" ||
    !isInt(profile["paid_coins"]) ||
    !isInt(profile["bonus_coins"]) ||
    !isInt(profile["checkin_streak"]) ||
    typeof profile["is_vip"] !== "boolean" ||
    !isTextOrNull(profile["vip_until"]) ||
    !isTextOrNull(profile["last_checkin_date"]) ||
    !isTextOrNull(profile["email"] ?? null)
  ) {
    throw new Error(REWARD_MESSAGES.failed);
  }
  return {
    id: profile["id"],
    email: (profile["email"] as string | null | undefined) ?? null,
    paid_coins: profile["paid_coins"],
    bonus_coins: profile["bonus_coins"],
    is_vip: profile["is_vip"],
    vip_until: profile["vip_until"] as string | null,
    last_checkin_date: profile["last_checkin_date"] as string | null,
    checkin_streak: profile["checkin_streak"],
    reward,
  };
}

/** Claim through the injected port; any database error becomes a plain failure. */
export async function claimCheckinWith(
  port: CheckinPort,
  user: string,
): Promise<Profile & { reward: number }> {
  const { data, error } = await port(user, [...DAILY_REWARDS]);
  if (error) {
    console.error("claim_daily_checkin failed", {
      code: (error as { code?: unknown })?.code ?? null,
    });
    throw new Error(REWARD_MESSAGES.failed);
  }
  return interpretCheckin(data);
}
