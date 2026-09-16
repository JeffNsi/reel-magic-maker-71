import { z } from "zod";

import type { SceneTruth, SceneTruthPatch } from "@/lib/scene-truth";

/**
 * GENERATION RECOVERY DIRECTOR
 *
 * A failed generation is not automatically a failed film. When the video model
 * refuses or fails a shot, the director keeps the meaning and looks for another
 * way to film it: adapt the filmmaking, never the meaning.
 *
 * This module is the pure half — failure diagnosis, candidate validation,
 * selection and the internal Creative Recovery Fidelity metric. It contains no
 * model call, so every rule here can be tested without spending a credit.
 *
 * It is explicitly NOT a way around a provider's safety systems. A rejected
 * depiction stays rejected; the director must find a genuinely different,
 * allowed representation of the same discovery.
 */

export type FailureCategory =
  | "safety"
  | "visual_complexity"
  | "character_consistency"
  | "camera_motion"
  | "transformation"
  | "continuity"
  | "ambiguous_instruction"
  | "other";

export const FAILURE_LABEL: Record<FailureCategory, string> = {
  safety: "The generation model declined to depict this scene.",
  visual_complexity: "Too much happens at once for one continuous shot.",
  character_consistency: "The characters could not be held together across the shot.",
  camera_motion: "The requested camera move was too difficult to execute.",
  transformation: "The shot needed a transformation the model cannot hold.",
  continuity: "The shot depended on too many continuity links.",
  ambiguous_instruction: "The shot was not clear enough for the model to execute.",
  other: "Generation model rejected this scene.",
};

/**
 * Read the failure from what the provider actually said. Nothing is invented:
 * an unrecognised message stays "other", which reads as
 * "Generation model rejected this scene."
 */
export function diagnoseFailure(message: string | null | undefined): {
  category: FailureCategory;
  provider_message: string;
  explained: string;
} {
  const raw = (message ?? "").trim();
  const text = raw.toLowerCase();

  const category: FailureCategory = !text
    ? "other"
    : /safety|policy|moderation|blocked|prohibited|dangerous|violat|not allowed|refus|declin|sensitive/.test(
          text,
        )
      ? "safety"
      : /too many|too much|complex|crowded|simultaneous/.test(text)
        ? "visual_complexity"
        : /character|face|identity consistency|likeness/.test(text)
          ? "character_consistency"
          : /camera|pan|dolly|tracking|move|motion/.test(text)
            ? "camera_motion"
            : /transform|morph|shift|change into|aging/.test(text)
              ? "transformation"
              : /continuity|match cut|consistent across/.test(text)
                ? "continuity"
                : /ambiguous|unclear|could not understand|invalid prompt|prompt/.test(text)
                  ? "ambiguous_instruction"
                  : "other";

  return { category, provider_message: raw, explained: FAILURE_LABEL[category] };
}

/** What the director may never quietly delete while recovering a scene. */
export type RecoveryInvariants = {
  emotional_core: string;
  what_must_survive: string;
  reveal: string;
  twist: string;
  foreshadowing: string;
  characters: string;
  user_decisions: string[];
};

export function invariantsOf(truth: SceneTruth): RecoveryInvariants {
  return {
    emotional_core: truth.emotional_core,
    what_must_survive: truth.what_must_survive,
    reveal: truth.reveal,
    twist: truth.twist,
    foreshadowing: truth.foreshadowing,
    characters: truth.characters,
    user_decisions: truth.user_decisions,
  };
}

const short = (max: number) => z.string().trim().max(max).default("");
const score = z.coerce.number().min(0).max(10).default(0);

export const candidateSchema = z.object({
  kind: z.enum(["direct", "restaged", "metaphorical"]),
  /** The new execution — how the same discovery is filmed instead. */
  chosen_execution: short(400),
  action: short(400),
  setting: short(300),
  camera: short(200),
  framing: short(200),
  movement: short(200),
  visual_direction: short(300),
  lighting: short(200),
  sound: short(200),
  reveal: short(300),
  continuity: short(300),
  /** The director's own account of what still survives in this version. */
  preserves: z
    .object({
      emotional_core: z.boolean().default(false),
      what_must_survive: z.boolean().default(false),
      reveal: z.boolean().default(false),
      character_meaning: z.boolean().default(false),
      visual_clue: z.boolean().default(false),
      ending_implication: z.boolean().default(false),
      foreshadowing: z.boolean().default(false),
    })
    .default({}),
  /** True when this version changes the story itself, not only the filming. */
  materially_changes_story: z.boolean().default(false),
  cinematic_quality: score,
  generation_feasibility: score,
  why: short(300),
});

export type RecoveryCandidate = z.infer<typeof candidateSchema>;

/**
 * Language that would mean gaming a provider's safety system rather than
 * directing a different scene. Any candidate that reaches for it is discarded.
 */
const EVASION =
  /(bypass|circumvent|evade|evading|get around|work around|workaround|sneak|slip past|disguis|obfuscat|mask the|hide the (violence|gore|body|content)|so the (model|filter|system) (won'?t|will not|can'?t)|avoid detection|trick the|split.*(to avoid|so the filter)|euphemis|coded (language|words))/i;

export type CandidateVerdict = {
  candidate: RecoveryCandidate;
  valid: boolean;
  /** Internal reasons a candidate was discarded. Never shown to a creator. */
  rejections: string[];
  /** CREATIVE RECOVERY FIDELITY, 0-10. Engineering/creative QA metric. */
  fidelity: number;
  fidelity_parts: Record<string, number>;
};

function hasEvasion(candidate: RecoveryCandidate) {
  return EVASION.test(
    [
      candidate.chosen_execution,
      candidate.action,
      candidate.visual_direction,
      candidate.reveal,
      candidate.why,
    ].join(" "),
  );
}

/**
 * Grade one alternative against the invariants. A candidate is only valid when
 * the emotional core, what must survive and the reveal all still land, and when
 * nothing in it reads as an attempt to defeat a safety system.
 */
export function judgeCandidate(
  candidate: RecoveryCandidate,
  inv: RecoveryInvariants,
): CandidateVerdict {
  const rejections: string[] = [];
  const need = (value: string) => !!value.trim();

  if (!candidate.chosen_execution.trim() && !candidate.action.trim()) {
    rejections.push("no execution described");
  }
  if (hasEvasion(candidate)) rejections.push("reads as safety evasion, not re-direction");
  if (!candidate.preserves.emotional_core) rejections.push("emotional core not preserved");
  if (need(inv.what_must_survive) && !candidate.preserves.what_must_survive) {
    rejections.push("what must survive not preserved");
  }
  if (need(inv.reveal) && !candidate.preserves.reveal) rejections.push("reveal dropped");
  if (need(inv.reveal) && !candidate.reveal.trim()) rejections.push("reveal not re-staged");
  if (need(inv.twist) && !candidate.preserves.reveal) rejections.push("twist payoff dropped");
  if (need(inv.foreshadowing) && !candidate.preserves.foreshadowing) {
    rejections.push("planted clues would be invalidated");
  }
  if (need(inv.characters) && !candidate.preserves.character_meaning) {
    rejections.push("central relationship lost");
  }
  if (candidate.generation_feasibility < 4) rejections.push("still not filmable");

  const parts: Record<string, number> = {
    emotional_core: candidate.preserves.emotional_core ? 10 : 0,
    narrative_purpose: candidate.preserves.what_must_survive ? 10 : need(inv.what_must_survive) ? 0 : 7,
    reveal: candidate.preserves.reveal ? 10 : need(inv.reveal) ? 0 : 7,
    character_meaning: candidate.preserves.character_meaning ? 10 : need(inv.characters) ? 0 : 7,
    visual_clue: candidate.preserves.visual_clue ? 10 : 5,
    ending_implication: candidate.preserves.ending_implication ? 10 : 5,
    cinematic_quality: candidate.cinematic_quality,
    generation_feasibility: candidate.generation_feasibility,
  };

  const values = Object.values(parts);
  const fidelity =
    Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;

  return { candidate, valid: rejections.length === 0, rejections, fidelity, fidelity_parts: parts };
}

/**
 * The strongest valid alternative wins on fidelity; feasibility breaks a tie, so
 * a shot that can actually be rendered is preferred over a prettier one that
 * cannot. Nothing is chosen when nothing is valid — the scene stops safely.
 */
export function selectRecovery(
  candidates: RecoveryCandidate[],
  inv: RecoveryInvariants,
): { verdicts: CandidateVerdict[]; selected: CandidateVerdict | null } {
  const verdicts = candidates.map((candidate) => judgeCandidate(candidate, inv));
  const valid = verdicts
    .filter((verdict) => verdict.valid)
    .sort(
      (a, b) =>
        b.fidelity - a.fidelity ||
        b.candidate.generation_feasibility - a.candidate.generation_feasibility,
    );
  return { verdicts, selected: valid[0] ?? null };
}

/** The Scene Truth fields a selected recovery is allowed to rewrite. */
export function patchFromCandidate(candidate: RecoveryCandidate): SceneTruthPatch {
  const keep = (value: string) => (value.trim() ? value.trim() : undefined);
  return {
    chosen_execution: keep(candidate.chosen_execution),
    action: keep(candidate.action),
    setting: keep(candidate.setting),
    camera: keep(candidate.camera),
    framing: keep(candidate.framing),
    movement: keep(candidate.movement),
    visual_direction: keep(candidate.visual_direction),
    lighting: keep(candidate.lighting),
    sound: keep(candidate.sound),
    reveal: keep(candidate.reveal),
    continuity: keep(candidate.continuity),
    provenance: {
      chosen_execution: "ai_recommendation",
      action: "ai_recommendation",
      camera: "ai_recommendation",
      framing: "ai_recommendation",
      movement: "ai_recommendation",
      reveal: "ai_recommendation",
    },
  };
}

/** The internal record of one recovery attempt, stored on the scene. */
export type RecoveryRecord = {
  attempted_at: string;
  failure_category: FailureCategory;
  provider_message: string;
  original_execution: string;
  original_action: string;
  emotional_core: string;
  what_must_survive: string;
  candidates: {
    kind: RecoveryCandidate["kind"];
    chosen_execution: string;
    valid: boolean;
    fidelity: number;
    rejections: string[];
  }[];
  selected_kind: RecoveryCandidate["kind"] | null;
  selected_execution: string;
  why_selected: string;
  fidelity: number;
  fidelity_parts: Record<string, number>;
  emotional_core_survived: boolean;
  what_must_survive_survived: boolean;
  materially_changes_story: boolean;
  outcome: "generated" | "awaiting_approval" | "no_valid_recovery";
  /** Whether the provider billed the failed attempt — only if the app knows. */
  original_attempt_billable: boolean | null;
  generation_id: string | null;
};

/** One short, non-technical line about what the director did. */
export function recoveryNote(record: RecoveryRecord): string {
  if (record.outcome === "no_valid_recovery") {
    return "The Director couldn't find a reliable way to generate this scene without changing what matters. Nothing was lost.";
  }
  return `The Director found another way to film this scene: ${record.selected_execution}`;
}
