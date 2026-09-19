import { describe, expect, it } from "vitest";

import { check } from "@/lib/continuity-engine";
import type { FilmBible } from "@/lib/director.functions";
import type { FilmScene, FilmView } from "@/lib/film.functions";
import { emptySceneTruth, mergeSceneTruth } from "@/lib/scene-truth";
import { normalizeStoryState } from "@/lib/story-state";

const truth = mergeSceneTruth(emptySceneTruth(), {
  emotional_core: "Recognition lands as grief",
  what_must_survive: "He sees the scar",
  chosen_execution: "Photo beside his hand",
  characters: "Julian",
  action: "He lowers the photo",
  setting: "A flooded garage",
  time_period: "Night",
  reveal: "The scar matches",
  continuity: "Scar stays left",
});

const scene = (over: Partial<FilmScene> = {}): FilmScene => ({
  id: "scene-a",
  scene_number: 1,
  title: "The garage",
  idea: "A detective finds a body",
  narration: "",
  credit_cost: 70,
  complexity: 6,
  clarity_verdict: "clear",
  clarity_note: "",
  queued: false,
  generation_id: "gen-1",
  status: "completed",
  video_url: "https://example.test/clip.mp4",
  voice_url: null,
  error_message: null,
  truth,
  recovery: null,
  ...over,
});

const film: Partial<FilmView> = {
  id: "story-1",
  title: "Echo",
  logline: "A detective investigates his own death.",
  setting: "A flooded garage",
  style: "cinematic",
  created_at: "2026-09-01T00:00:00Z",
};

const bible = (over: Partial<FilmBible> = {}): FilmBible =>
  ({
    title: "Echo",
    premise: "A detective works a case that points back at him.",
    cast: [],
    setting: "A flooded garage",
    mood: "cold dread",
    look: "sodium light",
    camera: "slow push",
    emotional_arc: "investigation to recognition",
    ending: "He understands",
    decisions: [],
    assumptions: [],
    discoveries: [],
    recommendations: [],
    open_questions: [],
    twist: null,
    ...over,
  }) as FilmBible;

describe("Fix 1 — no dangling payoff reference", () => {
  it("a reveal without a bible twist links to no payoff and raises no invalid reference", () => {
    const state = normalizeStoryState({ film, scenes: [scene()], film_bible: bible() });
    expect(state.payoffs).toEqual([]);
    expect(state.scenes[0].payoffs).toEqual([]);
    expect(check(state).filter((f) => f.ruleId === "CONTINUITY_INVALID_REFERENCE")).toEqual([]);
  });

  it("a reveal with a bible twist still links to the canonical payoff", () => {
    const state = normalizeStoryState({
      film,
      scenes: [scene()],
      film_bible: bible({
        twist: {
          pattern: "identity.future-self",
          statement: "The corpse is his future self",
          emotional_purpose: "Grief, not spectacle",
          foreshadowing: ["An identical scar"],
          reveal: "He matches the photo to his hand",
          visual_clue: "The scar",
          ending_implication: "He cannot prevent it",
        },
      }),
    });
    expect(state.payoffs.map((p) => p.id)).toEqual(["payoff-twist"]);
    expect(state.scenes[0].payoffs).toEqual(["payoff-twist"]);
    expect(check(state).filter((f) => f.ruleId === "CONTINUITY_INVALID_REFERENCE")).toEqual([]);
  });
});

describe("Fix 2 — canonical character identity", () => {
  it("a bare name and a parenthetical descriptor are one character", () => {
    const state = normalizeStoryState({
      film: { ...film, characters: [{ name: "Julian", look: "" }] },
      film_bible: bible({ cast: ["Julian (29, charismatic, the charming traitor)"] }),
    });
    expect(state.characters).toHaveLength(1);
    expect(state.characters[0].name).toBe("Julian");
    expect(state.characters[0].appearance).toBe("29, charismatic, the charming traitor");
  });

  it("two cast entries for the same person collapse to one", () => {
    const state = normalizeStoryState({
      film_bible: bible({ cast: ["Julian", "Julian (29, charismatic)"] }),
    });
    expect(state.characters.map((c) => c.name)).toEqual(["Julian"]);
  });

  it("different people stay separate — no substring matching", () => {
    const state = normalizeStoryState({
      film_bible: bible({ cast: ["Julian", "Julian Reyes"] }),
    });
    expect(state.characters.map((c) => c.name)).toEqual(["Julian", "Julian Reyes"]);
  });

  it("an em-dash descriptor still becomes appearance metadata", () => {
    const state = normalizeStoryState({ film_bible: bible({ cast: ["Ruben — grey coat"] }) });
    expect(state.characters[0].name).toBe("Ruben");
    expect(state.characters[0].appearance).toBe("grey coat");
  });
});

describe("Fix 3 — stale version is reachable", () => {
  const input = { film, scenes: [scene()], film_bible: bible() };

  it("no persisted version means no back-reference and no finding", () => {
    const state = normalizeStoryState(input);
    expect(state.generation.based_on_version).toBeNull();
    expect(check(state).filter((f) => f.ruleId === "CONTINUITY_STALE_VERSION")).toEqual([]);
  });

  it("a persisted version equal to the current one reports nothing", () => {
    const current = normalizeStoryState(input).version.id;
    const state = normalizeStoryState({ ...input, persisted_version: current });
    expect(state.generation.based_on_version).toBe(current);
    expect(check(state).filter((f) => f.ruleId === "CONTINUITY_STALE_VERSION")).toEqual([]);
  });

  it("a different persisted version with a rendered scene reports exactly one finding", () => {
    const state = normalizeStoryState({ ...input, persisted_version: "v1.deadbeef" });
    expect(state.generation.scenes_rendered).toBe(1);
    const stale = check(state).filter((f) => f.ruleId === "CONTINUITY_STALE_VERSION");
    expect(stale).toHaveLength(1);
    expect(stale[0].severity).toBeTruthy();
  });

  it("a different persisted version with nothing rendered stays quiet", () => {
    const state = normalizeStoryState({
      ...input,
      scenes: [scene({ video_url: null, status: "idle" })],
      persisted_version: "v1.deadbeef",
    });
    expect(check(state).filter((f) => f.ruleId === "CONTINUITY_STALE_VERSION")).toEqual([]);
  });
});
