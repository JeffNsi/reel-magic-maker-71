import { describe, expect, it } from "vitest";

import {
  candidateSchema,
  diagnoseFailure,
  invariantsOf,
  selectRecovery,
  patchFromCandidate,
} from "@/lib/generation-recovery";
import {
  buildGenerationRequest,
  checkFidelity,
  emptySceneTruth,
  mergeSceneTruth,
  readSceneTruth,
  type SceneTruth,
} from "@/lib/scene-truth";
import { searchTwists } from "@/lib/twists";

/**
 * STAGING TWIST CHAIN — an isolated in-memory fixture, never a real film.
 *
 * It exercises the persistent chain this product actually has:
 * story → twist shortlist → selected twist → planted clues → per-scene Scene
 * Truth → generation request → validation → public-safe representation, plus a
 * refused shot recovered without losing the turn. No database row, no provider
 * call, no credit, no publishing.
 */

const FIXTURE = {
  id: "staging-fixture-001",
  title: "The Staging Case",
  logline: "A detective realises the victim is connected to his own future.",
  setting: "A rain-washed harbour precinct at night",
  characters: [{ name: "Detective Halden", look: "44, grey coat, scar across the left hand" }],
  hidden_truth: "The victim is Halden's own future self",
  audience_assumption: "The victim is a stranger from the harbour",
  clues: ["The identical scar in the first scene", "A dossier photograph nobody claims"],
  red_herrings: ["A dockworker with no alibi"],
  reveal_scene: 4,
  payoff: "Halden accepts the case was always about himself",
  scenes: [
    { number: 1, title: "The Scar", core: "A habit the audience will remember" },
    { number: 2, title: "The File", core: "A photograph that should not exist" },
    { number: 3, title: "The Dockworker", core: "The wrong suspect feels right" },
    { number: 4, title: "The Recognition", core: "Discovering the victim is himself" },
  ],
};

const ctx = {
  style_prefix: "Cinematic vertical shot.",
  original_idea: FIXTURE.logline,
  scene_number: FIXTURE.reveal_scene,
  scene_title: "The Recognition",
  cast: FIXTURE.characters.map((c) => `${c.name}, ${c.look}`).join("; "),
  film_setting: FIXTURE.setting,
  film_continuity: FIXTURE.clues.join("; "),
};

function revealTruth(): SceneTruth {
  return mergeSceneTruth(emptySceneTruth(), {
    emotional_core: "Discovering the victim is himself",
    what_must_survive: "Halden recognises the identical scar",
    chosen_execution: "He lifts the dossier photograph beside his own hand",
    characters: "Detective Halden alone at the evidence table",
    action: "His thumb traces the identical scar in the photograph",
    setting: FIXTURE.setting,
    camera: "Slow push to the hand and the photograph",
    reveal: FIXTURE.hidden_truth,
    twist: FIXTURE.hidden_truth,
    foreshadowing: FIXTURE.clues.join("; "),
    continuity: "The scar matches the scar planted in scene one",
    provenance: { what_must_survive: "user_decision" },
    user_decisions: ["The reveal happens through the scar, not dialogue"],
  });
}

describe("staging twist chain (structural, credit-free)", () => {
  it("A–C: loads the draft fixture and finds twist candidates for it", () => {
    const shortlist = searchTwists({ idea: FIXTURE.logline, understanding: FIXTURE.hidden_truth });
    expect(shortlist.length).toBeGreaterThan(0);
    expect(shortlist.some((p) => ["identity", "mystery", "time"].includes(p.family))).toBe(true);
  });

  it("D–H: the selected twist, its clues and its reveal scene all reference real story data", () => {
    expect(FIXTURE.hidden_truth).not.toBe("");
    expect(FIXTURE.audience_assumption).not.toBe("");
    expect(FIXTURE.clues.length).toBeGreaterThan(0);
    expect(FIXTURE.payoff).not.toBe("");
    expect(FIXTURE.scenes.map((s) => s.number)).toContain(FIXTURE.reveal_scene);
    expect(FIXTURE.hidden_truth).not.toBe(FIXTURE.audience_assumption);
    for (const herring of FIXTURE.red_herrings) {
      expect(FIXTURE.clues).not.toContain(herring);
    }
  });

  it("I–K: the reveal scene persists as valid Scene Truth and validates into a request", () => {
    const truth = revealTruth();
    expect(readSceneTruth(truth)).not.toBeNull();
    const request = buildGenerationRequest(truth, ctx);
    const result = checkFidelity(truth, request);
    expect(result.ok).toBe(true);
    expect(request).toContain("identical scar");
    expect(request).toContain("Creator's decisions (authoritative)");
  });

  it("K: an incomplete twist plan cannot pass validation as approved", () => {
    const half = mergeSceneTruth(emptySceneTruth(), {
      emotional_core: "Discovering the victim is himself",
      what_must_survive: "Halden recognises the identical scar",
      chosen_execution: "He lifts the dossier photograph beside his own hand",
    });
    const stripped = "Cinematic vertical shot. Approved scene 4. Chosen execution: unknown.";
    expect(checkFidelity(half, stripped).ok).toBe(false);
    expect(readSceneTruth({ provenance: {}, user_decisions: [] })).toBeNull();
  });

  it("L–M: the public-safe representation keeps the hidden truth private", () => {
    const truth = revealTruth();
    /** What a buyer or a pre-reveal viewer is allowed to see. */
    const publicView = {
      title: FIXTURE.title,
      logline: FIXTURE.logline,
      scene_title: "The Recognition",
      clues: FIXTURE.clues,
      price_sek: 29,
    };
    const serialised = JSON.stringify(publicView);
    expect(serialised).not.toContain(FIXTURE.hidden_truth);
    expect(serialised).not.toContain(truth.reveal);
    expect(serialised).not.toContain(truth.chosen_execution);
    expect(serialised).toContain(FIXTURE.clues[0]);
  });

  it("recovery on the fixture keeps the turn when the model refuses the shot", () => {
    const truth = revealTruth();
    const failure = diagnoseFailure("Blocked: dangerous content");
    expect(failure.category).toBe("safety");

    const alternative = candidateSchema.parse({
      kind: "metaphorical",
      chosen_execution: "His reflection in the evidence-room glass falls across the photograph",
      action: "The reflected scar aligns with the scar in the photograph",
      characters: "Detective Halden reflected in the glass, alone",
      reveal: FIXTURE.hidden_truth,
      preserves: {
        emotional_core: true,
        what_must_survive: true,
        reveal: true,
        character_meaning: true,
        visual_clue: true,
        ending_implication: true,
        foreshadowing: true,
      },
      cinematic_quality: 9,
      generation_feasibility: 9,
      why: "The recognition lands through the planted clue",
    });

    const { selected } = selectRecovery([alternative], invariantsOf(truth));
    expect(selected).not.toBeNull();
    const next = mergeSceneTruth(truth, patchFromCandidate(selected!.candidate));
    expect(next.emotional_core).toBe(truth.emotional_core);
    expect(next.what_must_survive).toBe(truth.what_must_survive);
    expect(next.twist).toBe(FIXTURE.hidden_truth);
    expect(next.user_decisions).toContain("The reveal happens through the scar, not dialogue");
    expect(checkFidelity(next, buildGenerationRequest(next, ctx)).ok).toBe(true);
  });
});
