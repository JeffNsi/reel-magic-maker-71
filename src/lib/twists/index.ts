import { IDENTITY_TWISTS } from "./patterns-identity";
import { REALITY_TWISTS } from "./patterns-reality";
import { TIME_TWISTS } from "./patterns-time";
import { RELATIONSHIP_TWISTS } from "./patterns-relationship";
import { MYSTERY_TWISTS } from "./patterns-mystery";
import { PERCEPTION_TWISTS } from "./patterns-perception";
import { EMOTIONAL_TWISTS } from "./patterns-emotional";
import { OBJECT_TWISTS } from "./patterns-object";
import { LOCATION_TWISTS } from "./patterns-location";
import { STRUCTURE_TWISTS } from "./patterns-structure";
import type { TwistFamily, TwistPattern } from "./types";

export type { TwistFamily, TwistPattern } from "./types";

/**
 * Plot Twist Intelligence Library — the search layer.
 *
 * The director never receives the whole library: a cheap metadata pre-filter
 * narrows it to the patterns that plausibly belong to THIS story, ranking
 * weights story fit and emotional value above spectacle, and only a small
 * shortlist is handed to the director as an internal resource. Adding a new
 * family is a new pattern file plus one line in this registry.
 */
export const TWIST_LIBRARY: Record<TwistFamily, TwistPattern[]> = {
  identity: IDENTITY_TWISTS,
  reality: REALITY_TWISTS,
  time: TIME_TWISTS,
  relationship: RELATIONSHIP_TWISTS,
  mystery: MYSTERY_TWISTS,
  perception: PERCEPTION_TWISTS,
  emotional: EMOTIONAL_TWISTS,
  object: OBJECT_TWISTS,
  location: LOCATION_TWISTS,
  structure: STRUCTURE_TWISTS,
};

export const ALL_TWISTS: TwistPattern[] = Object.values(TWIST_LIBRARY).flat();

export const TWIST_COUNT = ALL_TWISTS.length;

/** Signals in the creator's own words that pull whole families into range. */
const FAMILY_SIGNALS: Record<TwistFamily, string[]> = {
  identity: ["who","identity","name","stranger","twin","double","self","mask","face","brother","sister","son","daughter","father","mother","family","corpse","body","missing","detective"],
  reality: ["dream","simulation","real","illusion","ghost","watching","observed","virtual","hallucination","memory","world","reset"],
  time: ["time","year","years","past","future","young","younger","older","age","ageing","aging","loop","repeat","again","era","decade","clock","then","now","century","childhood","1926","2026"],
  relationship: ["friend","friends","betray","betrayal","lover","wife","husband","partner","parent","child","brother","sister","enemy","trust","secret","affair","family","married","couple","love"],
  mystery: ["detective","murder","killed","crime","clue","evidence","investigate","witness","missing","suspect","case","police","body","corpse","disappear","scene"],
  perception: ["remember","forget","memory","see","saw","looks","seems","mirror","reflection","narrator","misunderstood","confused","recognise","recognize","dementia","photograph"],
  emotional: ["grief","loss","dead","died","death","daughter","son","loneliness","lonely","alone","regret","forgive","mourn","love","guilt","sacrifice","goodbye","sad","hope"],
  object: ["photo","photograph","ring","letter","key","watch","phone","recording","painting","drawing","toy","necklace","ticket","receipt","mirror","door","chair","clothes","coat","medal","book","scar"],
  location: ["city","town","street","station","house","home","room","hospital","school","church","hotel","office","garden","basement","train","empty","abandoned","place","platform","building"],
  structure: ["ending","opening","begins","start","end","again","repeat","two stories","parallel","circular","flashback","told","narrated","structure"],
};

/** Explicit refusals — the creator's authority over the library. */
const NO_TWIST_SIGNALS = [
  "no twist","without a twist","no surprise","no surprises","no plot twist","don't want a twist",
  "do not want a twist","no reveal","straightforward","simple story","no gimmick","keep it simple",
  "nothing clever","no big reveal","inget twist","ingen twist","utan twist",
];

export function wantsNoTwist(...sources: (string | null | undefined)[]) {
  const haystack = sources.filter(Boolean).join(" ").toLowerCase();
  return NO_TWIST_SIGNALS.some((phrase) => haystack.includes(phrase));
}

const words = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9åäö\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);

export type TwistSearchContext = {
  idea: string;
  /** The director's own memory: story, characters, world, time, emotion, ending. */
  model?: string;
  answers?: string;
  understanding?: string;
};

export type ScoredTwist = TwistPattern & { relevance: number };

/**
 * Relevance = does this pattern belong to THIS story, would it deepen it, and
 * can a five-second vertical shot actually show it. Emotional and narrative
 * weight (family signal + tag fit + foreshadowing) counts more than spectacle,
 * and cliché risk is a penalty rather than a filter — a familiar shape can
 * still win if the story is genuinely about it, and the director adapts it.
 */
export function searchTwists(
  context: TwistSearchContext,
  limit = 8,
): ScoredTwist[] {
  const text = [context.idea, context.understanding, context.model, context.answers]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!text.trim()) return [];
  const tokens = new Set(words(text));

  const familyScore = new Map<TwistFamily, number>();
  for (const [family, signals] of Object.entries(FAMILY_SIGNALS) as [TwistFamily, string[]][]) {
    const hits = signals.filter((signal) =>
      signal.includes(" ") ? text.includes(signal) : tokens.has(signal),
    ).length;
    familyScore.set(family, hits);
  }

  const scored: ScoredTwist[] = [];
  for (const pattern of ALL_TWISTS) {
    const family = familyScore.get(pattern.family) ?? 0;
    const tagHits = pattern.tags.filter((tag) => tokens.has(tag)).length;
    const subjectHits = pattern.character_relationships.filter((role) => tokens.has(role)).length;
    const nameHits = words(pattern.name).filter((word) => tokens.has(word)).length;
    /** Pre-filter: nothing in this story points at this pattern. */
    if (family === 0 && tagHits === 0 && nameHits === 0) continue;

    const relevance =
      family * 3 +
      tagHits * 4 +
      nameHits * 3 +
      subjectHits * 2 +
      pattern.foreshadowing_potential * 0.6 +
      pattern.visual_potential * 0.5 +
      pattern.generation_feasibility * 0.4 +
      pattern.originality * 0.3 -
      pattern.complexity * 0.3;
    scored.push({ ...pattern, relevance: Math.round(relevance * 10) / 10 });
  }

  scored.sort((a, b) => b.relevance - a.relevance);

  /** Spread the shortlist across families so the director sees real options. */
  const perFamily = new Map<TwistFamily, number>();
  const shortlist: ScoredTwist[] = [];
  for (const pattern of scored) {
    const used = perFamily.get(pattern.family) ?? 0;
    if (used >= 2) continue;
    perFamily.set(pattern.family, used + 1);
    shortlist.push(pattern);
    if (shortlist.length >= limit) break;
  }
  return shortlist;
}

/** The shortlist as compact prompt text — an internal resource, never UI copy. */
export function twistShortlistBrief(patterns: ScoredTwist[]) {
  if (patterns.length === 0) return "";
  const lines = patterns.map(
    (pattern) =>
      `- [${pattern.family}/${pattern.subfamily}] ${pattern.name} — ${pattern.mechanism}; feels: ${pattern.emotional_effect}; visual ${pattern.visual_potential}/10, foreshadowing ${pattern.foreshadowing_potential}/10, cliche risk ${pattern.cliche_risk}/10, renderable ${pattern.generation_feasibility}/10`,
  );
  return `TWIST SHORTLIST (internal resource only — never shown to the creator, never mandatory):\n${lines.join("\n")}`;
}
