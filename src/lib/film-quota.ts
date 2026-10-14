/**
 * Pure policy for film ownership and the daily creation limit.
 * No I/O here — the server functions call these with what they read.
 */

export const DAILY_FILM_LIMIT = 3;

export type FilmStatus = "queued" | "generating" | "ready" | "failed";

export type OwnershipDecision = "allow" | "claim" | "deny";

/**
 * A film with an owner is only usable by that owner. A legacy film without an
 * owner is claimed by the signed-in user who reached it with its browser session.
 */
export function ownershipDecision(ownerId: string | null, userId: string): OwnershipDecision {
  if (!ownerId) return "claim";
  return ownerId === userId ? "allow" : "deny";
}

/**
 * Should a used daily slot be given back after a failed creation?
 * Only when the failure was not the user's fault: the slot is never taken for
 * invalid input (validated first), and service/AI failures release it.
 */
export function shouldReleaseSlot(error: unknown): boolean {
  return error != null; // every failure after the claim is a service-side failure
}

/** Status a film should carry, given its scenes' latest generation status. */
export function filmStatusFrom(sceneStatuses: (string | null)[]): FilmStatus {
  if (!sceneStatuses.length) return "queued";
  if (sceneStatuses.every((s) => s === "completed")) return "ready";
  if (sceneStatuses.some((s) => s === "failed")) return "failed";
  if (sceneStatuses.some((s) => s === "queued" || s === "processing")) return "generating";
  return "queued";
}

export const QUOTA_MESSAGE =
  "You have created 3 films today — the daily limit. Try again tomorrow. / Du har skapat 3 filmer i dag — dagsgränsen. Försök igen i morgon.";
export const NOT_OWNER_MESSAGE =
  "This film belongs to another account. / Den här filmen tillhör ett annat konto.";
