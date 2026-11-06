/**
 * Episode unlocking. The decision and the charge happen in one database
 * transaction (public.unlock_episode, service role only); this module only
 * calls it and turns its status into the app's result or error message.
 */

export type UnlockStatus =
  | "unlocked"
  | "already_unlocked"
  | "not_enough_coins"
  | "vip_only"
  | "episode_not_found"
  | "episode_unavailable"
  | "profile_not_found"
  | "invalid";

export type UnlockOutcome = { unlocked: true; paid_coins: number; bonus_coins: number };

/** The database call, injected so the mapping is tested without a database. */
export type UnlockPort = (
  user: string,
  episode: string,
) => PromiseLike<{ data: unknown; error: unknown }>;

// The first three messages are unchanged from the previous implementation;
// the Vibe player opens the coin shop when it sees "Not enough coins".
export const UNLOCK_MESSAGES = {
  not_enough_coins: "Not enough coins. Earn more or buy a coin pack.",
  vip_only: "This episode is VIP-only. Subscribe to VIP to watch.",
  episode_not_found: "Episode not found.",
  episode_unavailable: "This episode is not available. / Avsnittet är inte tillgängligt.",
  profile_not_found: "Could not load your profile.",
  failed: "Could not unlock episode.",
} as const;

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/** Map the database result to the outcome, or throw the user-facing message. */
export function interpretUnlock(raw: unknown): UnlockOutcome {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const status = row?.["status"];

  if (status === "unlocked" || status === "already_unlocked") {
    const paid = count(row?.["paid_coins"]);
    const bonus = count(row?.["bonus_coins"]);
    if (paid === null || bonus === null) throw new Error(UNLOCK_MESSAGES.failed);
    return { unlocked: true, paid_coins: paid, bonus_coins: bonus };
  }
  if (
    status === "not_enough_coins" ||
    status === "vip_only" ||
    status === "episode_not_found" ||
    status === "episode_unavailable" ||
    status === "profile_not_found"
  ) {
    throw new Error(UNLOCK_MESSAGES[status]);
  }
  throw new Error(UNLOCK_MESSAGES.failed);
}

/** Unlock through the injected port; any database error becomes a plain failure. */
export async function unlockWith(
  port: UnlockPort,
  user: string,
  episode: string,
): Promise<UnlockOutcome> {
  const { data, error } = await port(user, episode);
  if (error) {
    console.error("unlock_episode failed", {
      episode,
      code: (error as { code?: unknown })?.code ?? null,
    });
    throw new Error(UNLOCK_MESSAGES.failed);
  }
  return interpretUnlock(data);
}
