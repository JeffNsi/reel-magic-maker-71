/**
 * DETERMINISTIC CONTINUITY RULES — catalogue and contract.
 *
 * This file owns the *data* of the continuity engine: the Finding contract, the
 * severity ordering and the rule catalogue (id, severity, category, title and
 * the suggested actions each rule offers). No rule logic and no story data live
 * here, and nothing in this file reads, writes or derives creative content.
 *
 * The engine built on this catalogue is read-only, AI-free and advisory.
 */

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Lower rank sorts first — deterministic ordering, never insertion order. */
export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export const CATEGORIES = [
  "entity",
  "reference",
  "timeline",
  "state",
  "relationship",
  "setup",
  "twist",
  "version",
  "scene_truth",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const RULE_IDS = [
  "CONTINUITY_MISSING_ENTITY",
  "CONTINUITY_DUPLICATE_ENTITY",
  "CONTINUITY_INVALID_REFERENCE",
  "CONTINUITY_AGE_MISMATCH",
  "CONTINUITY_TIMELINE_ORDER",
  "CONTINUITY_IMPOSSIBLE_STATE",
  "CONTINUITY_RELATIONSHIP_ASYMMETRY",
  "CONTINUITY_PAYOFF_WITHOUT_SETUP",
  "CONTINUITY_TWIST_BEFORE_FORESHADOWING",
  "CONTINUITY_STALE_VERSION",
  "CONTINUITY_SCENE_TRUTH_INCOMPLETE",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** Structured evidence — only ever filled from values present in StoryState. */
export type Evidence = {
  sceneId?: string | undefined;
  sceneNumber?: number | undefined;
  entityId?: string | undefined;
  entityType?:
    | "character"
    | "location"
    | "object"
    | "fact"
    | "relationship"
    | "thread"
    | "payoff"
    | "twist"
    | "scene"
    | "version";
  field?: string;
  value?: string;
};

export type Finding = {
  /** Deterministic, content-derived id — never random, stable across runs. */
  id: string;
  ruleId: RuleId;
  severity: Severity;
  category: Category;
  title: string;
  message: string;
  evidence: Evidence[];
  suggestedActions: string[];
};

export type RuleDefinition = {
  id: RuleId;
  severity: Severity;
  category: Category;
  title: string;
  /** What the rule needs before it may report anything at all. */
  requires: string;
  suggestedActions: string[];
};

/**
 * The catalogue. A rule that cannot find the information it `requires` must
 * skip — absence of data is never evidence of a contradiction.
 */
export const CONTINUITY_RULES: Record<RuleId, RuleDefinition> = {
  CONTINUITY_MISSING_ENTITY: {
    id: "CONTINUITY_MISSING_ENTITY",
    severity: "high",
    category: "entity",
    title: "Referenced entity does not exist",
    requires: "A populated character/location/object list plus a reference to a name not in it.",
    suggestedActions: [
      "Add the missing character, location or object to the canonical state.",
      "Or correct the name used in the scene so it matches an existing entity.",
    ],
  },
  CONTINUITY_DUPLICATE_ENTITY: {
    id: "CONTINUITY_DUPLICATE_ENTITY",
    severity: "medium",
    category: "entity",
    title: "Duplicate canonical entity",
    requires: "Two entities of the same type sharing an id, or a character sharing a name.",
    suggestedActions: [
      "Merge the duplicates into one canonical entity.",
      "Or rename one of them so each identity is distinct.",
    ],
  },
  CONTINUITY_INVALID_REFERENCE: {
    id: "CONTINUITY_INVALID_REFERENCE",
    severity: "high",
    category: "reference",
    title: "Broken reference between records",
    requires: "A reference id or scene number that points at no existing record.",
    suggestedActions: [
      "Point the reference at an existing record.",
      "Or remove the stale reference.",
    ],
  },
  CONTINUITY_AGE_MISMATCH: {
    id: "CONTINUITY_AGE_MISMATCH",
    severity: "high",
    category: "state",
    title: "Stated age contradicts the dates",
    requires: "A stated age, a birth year and a scene story year — all three present.",
    suggestedActions: [
      "Correct the stated age, the birth year or the scene's story year.",
      "Or remove the date that is not meant literally.",
    ],
  },
  CONTINUITY_TIMELINE_ORDER: {
    id: "CONTINUITY_TIMELINE_ORDER",
    severity: "medium",
    category: "timeline",
    title: "Scene order contradicts the story dates",
    requires: "Two timeline events with explicit years whose order contradicts the sequence.",
    suggestedActions: [
      "Reorder the scenes to match the story dates.",
      "Or mark the earlier date as a deliberate flashback in the scene's continuity note.",
    ],
  },
  CONTINUITY_IMPOSSIBLE_STATE: {
    id: "CONTINUITY_IMPOSSIBLE_STATE",
    severity: "high",
    category: "state",
    title: "Impossible state at the same story time",
    requires: "One character in two places at one identical, explicit story time.",
    suggestedActions: [
      "Change one scene's story time.",
      "Or move the character out of one of the two scenes.",
    ],
  },
  CONTINUITY_RELATIONSHIP_ASYMMETRY: {
    id: "CONTINUITY_RELATIONSHIP_ASYMMETRY",
    severity: "medium",
    category: "relationship",
    title: "Reciprocal relationship recorded on one side only",
    requires: "A mutual relationship type that one of the two characters does not carry.",
    suggestedActions: [
      "Record the relationship on both characters.",
      "Or change the type if the bond is one-directional.",
    ],
  },
  CONTINUITY_PAYOFF_WITHOUT_SETUP: {
    id: "CONTINUITY_PAYOFF_WITHOUT_SETUP",
    severity: "high",
    category: "setup",
    title: "Payoff has no setup",
    requires: "A payoff record with an empty setup list.",
    suggestedActions: [
      "Plant at least one setup for this payoff in an earlier scene.",
      "Or drop the payoff requirement.",
    ],
  },
  CONTINUITY_TWIST_BEFORE_FORESHADOWING: {
    id: "CONTINUITY_TWIST_BEFORE_FORESHADOWING",
    severity: "critical",
    category: "twist",
    title: "Twist reveals before it is foreshadowed",
    requires: "A reveal scene number and at least one scene carrying foreshadowing.",
    suggestedActions: [
      "Move the foreshadowing into a scene before the reveal.",
      "Or move the reveal later in the film.",
    ],
  },
  CONTINUITY_STALE_VERSION: {
    id: "CONTINUITY_STALE_VERSION",
    severity: "medium",
    category: "version",
    title: "Rendered clips are based on an older story version",
    requires: "A rendered scene plus a based_on_version that differs from the current version.",
    suggestedActions: [
      "Review the rendered scenes against the current story.",
      "Re-render only the scenes whose approved truth changed.",
    ],
  },
  CONTINUITY_SCENE_TRUTH_INCOMPLETE: {
    id: "CONTINUITY_SCENE_TRUTH_INCOMPLETE",
    severity: "high",
    category: "scene_truth",
    title: "Scene Truth is missing a required field",
    requires: "A scene that has Scene Truth where a required field is empty.",
    suggestedActions: ["Fill the missing required field before rendering the scene."],
  },
};

export function ruleDefinition(id: RuleId): RuleDefinition {
  return CONTINUITY_RULES[id];
}
