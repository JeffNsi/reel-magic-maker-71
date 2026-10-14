/**
 * Pure policy for film ownership and the daily creation limit.
 * No I/O here — the server functions call these with what they read.
 */

export const DAILY_FILM_LIMIT = 3;

export type FilmStatus = "queued" | "generating" | "ready" | "failed";

export type OwnershipDecision = "allow" | "deny";

/**
 * Only the stored owner may change or render a film. A legacy film without an
 * owner is read-only: there is no claim by browser session.
 */
export function ownershipDecision(ownerId: string | null, userId: string): OwnershipDecision {
  return ownerId && ownerId === userId ? "allow" : "deny";
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
export const LEGACY_FILM_MESSAGE =
  "This is an older film without an account — it can be viewed but not rendered. / Det här är en äldre film utan konto — den kan visas men inte renderas.";
