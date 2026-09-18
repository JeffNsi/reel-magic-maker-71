import { describe, expect, it } from "vitest";

import {
  candidateSchema,
  diagnoseFailure,
  invariantsOf,
  judgeCandidate,
  patchFromCandidate,
  recoveryNote,
  selectRecovery,
  type RecoveryCandidate,
  type RecoveryRecord,
} from "@/lib/generation-recovery";
import { emptySceneTruth, mergeSceneTruth } from "@/lib/scene-truth";

const truth = mergeSceneTruth(emptySceneTruth(), {
  emotional_core: "Discovering the victim is himself",
  what_must_survive: "The detective recognises his own scar",
  chosen_execution: "He pulls back the sheet and sees his own face",
  characters: "Detective Halden, 44",
  reveal: "The identical scar identifies the body as his own",
  twist: "The corpse is his future self",
  foreshadowing: "The scar was shown in scene one",
});

const inv = invariantsOf(truth);

const candidate = (over: Partial<RecoveryCandidate>): RecoveryCandidate =>
  candidateSchema.parse({
    kind: "restaged",
    chosen_execution: "He compares a dossier photograph with his own hand",
    action: "His thumb traces the identical scar on the photograph",
    characters: "Detective Halden alone at the evidence table",
    reveal: "The identical scar identifies the photograph as himself",
    preserves: {
      emotional_core: true,
      what_must_survive: true,
      reveal: true,
      character_meaning: true,
      visual_clue: true,
      ending_implication: true,
      foreshadowing: true,
    },
    cinematic_quality: 8,
    generation_feasibility: 9,
    why: "The recognition lands through the clue instead of the depiction",
    ...over,
  });

describe("generation recovery director", () => {
  it("classifies failures from what the provider actually said", () => {
    expect(diagnoseFailure("Blocked: dangerous content").category).toBe("safety");
    expect(diagnoseFailure("Too many simultaneous actions").category).toBe("visual_complexity");
    expect(diagnoseFailure("Could not hold character likeness").category).toBe(
      "character_consistency",
    );
    expect(diagnoseFailure("Requested dolly move failed").category).toBe("camera_motion");
    expect(diagnoseFailure("Cannot morph the subject").category).toBe("transformation");
  });

  it("invents no reason when the provider gave none", () => {
    const unknown = diagnoseFailure(null);
    expect(unknown.category).toBe("other");
    expect(unknown.provider_message).toBe("");
    expect(unknown.explained).toBe("Generation model rejected this scene.");
  });

  it("accepts a re-staged alternative that keeps every invariant", () => {
    const verdict = judgeCandidate(candidate({}), inv);
    expect(verdict.valid).toBe(true);
    expect(verdict.rejections).toEqual([]);
    expect(verdict.fidelity).toBeGreaterThan(8);
  });

  it("rejects anything that reads as safety evasion rather than re-direction", () => {
    const verdict = judgeCandidate(
      candidate({ why: "Coded language so the filter won't catch the depiction" }),
      inv,
    );
    expect(verdict.valid).toBe(false);
    expect(verdict.rejections.join(" ")).toContain("evasion");
  });

  it("rejects an alternative that quietly drops the reveal or the clues", () => {
    const noReveal = judgeCandidate(
      candidate({ preserves: { emotional_core: true, what_must_survive: true, reveal: false } }),
      inv,
    );
    expect(noReveal.valid).toBe(false);
    expect(noReveal.rejections).toContain("reveal dropped");

    const noClues = judgeCandidate(
      candidate({
        preserves: {
          emotional_core: true,
          what_must_survive: true,
          reveal: true,
          character_meaning: true,
          foreshadowing: false,
        },
      }),
      inv,
    );
    expect(noClues.valid).toBe(false);
    expect(noClues.rejections).toContain("planted clues would be invalidated");
  });

  it("rejects an alternative the model still could not film", () => {
    expect(judgeCandidate(candidate({ generation_feasibility: 2 }), inv).valid).toBe(false);
  });

  it("selects the strongest valid alternative and nothing when none is valid", () => {
    const weak = candidate({ kind: "direct", cinematic_quality: 4, generation_feasibility: 5 });
    const strong = candidate({ kind: "metaphorical", cinematic_quality: 9 });
    const picked = selectRecovery([weak, strong], inv);
    expect(picked.selected?.candidate.kind).toBe("metaphorical");

    const impossible = selectRecovery(
      [
        candidate({ preserves: { emotional_core: false } }),
        candidate({ generation_feasibility: 1 }),
      ],
      inv,
    );
    expect(impossible.selected).toBeNull();
    expect(impossible.verdicts).toHaveLength(2);
  });

  it("rewrites only how the scene is filmed, never the meaning", () => {
    const patch = patchFromCandidate(candidate({}));
    expect(Object.keys(patch)).not.toContain("emotional_core");
    expect(Object.keys(patch)).not.toContain("what_must_survive");
    expect(Object.keys(patch)).not.toContain("twist");
    expect(patch.provenance?.chosen_execution).toBe("ai_recommendation");

    const next = mergeSceneTruth(truth, patch);
    expect(next.emotional_core).toBe(truth.emotional_core);
    expect(next.what_must_survive).toBe(truth.what_must_survive);
    expect(next.twist).toBe(truth.twist);
    expect(next.chosen_execution).not.toBe(truth.chosen_execution);
  });

  it("reports an impossible scene honestly instead of a false completion", () => {
    const record = {
      outcome: "no_valid_recovery",
      selected_execution: "",
    } as unknown as RecoveryRecord;
    expect(recoveryNote(record)).toContain("Nothing was lost");
    expect(recoveryNote(record)).not.toContain("another way to film");
  });
});
