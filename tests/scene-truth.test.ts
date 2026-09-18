import { describe, expect, it } from "vitest";

import {
  buildGenerationRequest,
  checkFidelity,
  emptySceneTruth,
  mergeSceneTruth,
  readSceneTruth,
} from "@/lib/scene-truth";

const ctx = {
  style_prefix: "Cinematic vertical shot.",
  original_idea: "A woman meets her younger self at a train station.",
  scene_number: 3,
  scene_title: "Platform 19",
  cast: "Vera, 38, red scarf",
  film_setting: "A Stockholm station at dusk",
  film_continuity: "The red scarf appears in every scene",
};

const truth = mergeSceneTruth(emptySceneTruth(), {
  emotional_core: "Recognising yourself across time",
  what_must_survive: "The younger self must look back at her",
  chosen_execution: "A single pillar wipe reveals the younger woman behind her",
  action: "Vera walks past the pillar and stops",
  setting: "Station platform at dusk",
  reveal: "The younger woman wears the same pendant",
  twist: "The stranger is her younger self",
  foreshadowing: "The pendant was shown in scene one",
});

describe("scene truth contract", () => {
  it("carries the required creative fields into the generation request", () => {
    const request = buildGenerationRequest(truth, ctx);
    expect(request).toContain("Emotional core: Recognising yourself across time");
    expect(request).toContain("What must survive:");
    expect(request).toContain("Chosen execution:");
    expect(request).toContain("The younger woman wears the same pendant");
    expect(checkFidelity(truth, request).ok).toBe(true);
  });

  it("never trims the required fields away under a tight length budget", () => {
    const request = buildGenerationRequest(truth, ctx, { limit: 420 });
    const result = checkFidelity(truth, request);
    expect(result.missing).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("fails validation when a required field never reaches the request", () => {
    const result = checkFidelity(truth, "Cinematic vertical shot. A woman walks past a pillar.");
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("emotional_core");
  });

  it("keeps a creator decision authoritative over a later AI assumption", () => {
    const owned = mergeSceneTruth(emptySceneTruth(), {
      chosen_execution: "One unbroken shot, no cut",
      provenance: { chosen_execution: "user_decision" },
      user_decisions: ["No cut in this scene"],
    });
    const after = mergeSceneTruth(owned, {
      chosen_execution: "Cut to a close-up instead",
      provenance: { chosen_execution: "ai_assumption" },
    });
    expect(after.chosen_execution).toBe("One unbroken shot, no cut");
    expect(after.user_decisions).toContain("No cut in this scene");
  });

  it("treats an empty or malformed truth object as no truth at all", () => {
    expect(readSceneTruth(null)).toBeNull();
    expect(readSceneTruth({})).toBeNull();
    expect(readSceneTruth({ emotional_core: "Grief" })).not.toBeNull();
  });
});
