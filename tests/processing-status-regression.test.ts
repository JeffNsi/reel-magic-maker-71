import { describe, expect, it } from "vitest";

import { filmSceneStateSchema, normalizeFilmState } from "@/lib/film-state";
import { resolveSceneReferences, type ResolverCanon } from "@/lib/reference-resolver";
import { emptyStoryState, storyStateSchema, type StoryState } from "@/lib/story-state";

/**
 * Regression: QA Homecoming run 2026-10-17. Scenes 2-5 fell back to text-only
 * because startGeneration writes status "processing" on the generation row,
 * and the film-state enum rejected it, so loadResolverCanon threw and every
 * later scene in the same run lost its reference images.
 */

const baseScene = {
  scene_id: "s1",
  scene_number: 1,
  previous_scene_id: null,
  next_scene_id: null,
  title: "Arrival",
  characters: [],
  environment_id: null,
  wardrobe: [],
  props: [],
  time_of_day: null,
  weather: null,
  lighting: null,
  camera: null,
  action: null,
  dialogue: null,
  emotion: null,
  narrative_purpose: null,
  continuity_requirements: [],
  input_references: [],
  output_assets: [],
};

describe("generation_status enum", () => {
  it("accepts processing, the status startGeneration writes while a clip renders", () => {
    const parsed = filmSceneStateSchema.parse({ ...baseScene, generation_status: "processing" });
    expect(parsed.generation_status).toBe("processing");
  });

  it("still rejects unknown statuses", () => {
    expect(() =>
      filmSceneStateSchema.parse({ ...baseScene, generation_status: "exploding" }),
    ).toThrow();
  });
});

describe("normalizeFilmState with a scene mid-render", () => {
  function storyWithProcessingScene(): StoryState {
    const empty = emptyStoryState();
    return storyStateSchema.parse({
      ...empty,
      identity: { ...empty.identity, story_id: "film-qa" },
      story_dna: { ...empty.story_dna, title: "QA Homecoming", style: "cinematic" },
      characters: [
        {
          id: "c1",
          name: "QA Library deffa1",
          appearance: "oval face, black curls",
          arc: "",
          relationships: [],
          evidence: [],
        },
      ],
      scenes: [
        {
          id: "s1",
          scene_number: 1,
          title: "Arrival",
          location: "Stockholm apartment",
          time: null,
          characters: ["QA Library deffa1"],
          action: "A filmmaker returns home",
          emotion: null,
          purpose: null,
          duration_seconds: 5,
          depends_on: [],
          facts_changed: [],
          threads_created: [],
          threads_resolved: [],
          payoffs: [],
          truth: null,
          generation: {
            status: "processing",
            has_clip: false,
            credit_cost: 14,
            clarity_verdict: null,
            recovered: false,
          },
        },
        {
          id: "s2",
          scene_number: 2,
          title: "Discovery",
          location: "Stockholm apartment",
          time: null,
          characters: ["QA Library deffa1"],
          action: "Finds an unopened letter",
          emotion: null,
          purpose: null,
          duration_seconds: 5,
          depends_on: [],
          facts_changed: [],
          threads_created: [],
          threads_resolved: [],
          payoffs: [],
          truth: null,
          generation: null,
        },
      ],
    });
  }

  it("parses the film state instead of throwing while scene 1 is processing", () => {
    const state = normalizeFilmState({ story: storyWithProcessingScene(), film: null });
    const scene1 = state.scenes.find((s) => s.scene_number === 1);
    expect(scene1?.generation_status).toBe("processing");
  });
});

describe("reference resolution during a parallel render", () => {
  it("still resolves references for scene 2 while scene 1 is processing", () => {
    const canon: ResolverCanon = {
      characters: [
        {
          canonical_id: "QA_LIBRARY_DEFFA1_01",
          name: "QA Library deffa1",
          face: "oval face",
          hair: "black curls",
          skin: "",
          body: "",
          height: "",
          build: "",
          locks: { identity: true, face: true, hair: true, skin: true, body: true },
          reference_assets: [
            { kind: "front", storage_path: "p/front-v1.jpg", version: 1, url: "https://example.test/front.jpg" },
          ],
        },
      ],
      environments: [],
      wardrobe: [],
      props: [],
      scenes: [
        {
          scene_id: "s1",
          scene_number: 1,
          title: "Arrival",
          previous_scene_id: null,
          next_scene_id: "s2",
          environment_id: null,
          characters: ["QA_LIBRARY_DEFFA1_01"],
          status: "processing",
          has_clip: false,
        },
        {
          scene_id: "s2",
          scene_number: 2,
          title: "Discovery",
          previous_scene_id: "s1",
          next_scene_id: null,
          environment_id: null,
          characters: ["QA_LIBRARY_DEFFA1_01"],
          status: "idle",
          has_clip: false,
        },
      ],
      style_assets: [
        { kind: "style", storage_path: "p/style-v1.jpg", version: 1, url: "https://example.test/style.jpg" },
      ],
    };

    const refs = resolveSceneReferences(canon, 2);
    expect(refs).not.toBeNull();
    expect(refs?.mode).not.toBe("text-only");
  });
});
