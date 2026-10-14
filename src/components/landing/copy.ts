import { COIN_COST } from "@/lib/storyreel.functions";
import { CLIP_PRICE_SEK } from "@/lib/clip-shop.functions";

/** Homepage wording reuses the existing generation and purchase prices. */
export const FILM_PRICE_COPY = `One film costs ${COIN_COST} credits. A finished clip can also be purchased separately for ${CLIP_PRICE_SEK} kr.`;

/** Editorial titles describe the subject, never a cut-off piece of the prompt. */
export function showcaseTitle(idea: string, style: string, index: number) {
  const subjects: [RegExp, string][] = [
    [/detective/i, "The Quiet Investigation"],
    [/train|station/i, "Last Train Home"],
    [/rooftop/i, "Above the City"],
    [/astronaut|visor/i, "Beyond the Visor"],
    [/fisherman|harbou?r/i, "Before the Tide"],
    [/desert|highway/i, "The Open Road"],
    [/forest|woods/i, "Into the Woods"],
    [/ocean|sea|shore/i, "At the Waterline"],
    [/city|street/i, "City in Motion"],
  ];
  return subjects.find(([pattern]) => pattern.test(idea))?.[1] ?? `${style} Study ${index + 1}`;
}