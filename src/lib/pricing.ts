/**
 * One price, one constant. Every displayed and every charged amount for a
 * film scene reads from here, so the two can never drift.
 */

/** Credits one EZY (Lovable engine) five-second scene costs. */
export const EZY_SCENE_COST = 14;

/** Scenes in a standard film. */
export const FILM_SCENES = 5;

/** A standard film: five EZY scenes. */
export const FILM_COST = FILM_SCENES * EZY_SCENE_COST;

/** Single-shot short on the homepage (generateVideo) — unchanged at the film price. */
export const SINGLE_SHORT_COST = FILM_COST;

/** Only the Lovable engine (EZY) is billed in app credits; fal.ai engines bill the fal account. */
export function sceneCostFor(engine: "lovable" | "fal" | "live"): number {
  return engine === "lovable" ? EZY_SCENE_COST : 0;
}

export const NEEDS_CREDITS_MESSAGE =
  "Not enough credits for this scene. Top up or earn more in Rewards. / Inte tillräckligt med credits för den här scenen. Fyll på eller tjäna fler under Belöningar.";
