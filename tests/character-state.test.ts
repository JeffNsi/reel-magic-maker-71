import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { check } from "@/lib/continuity-engine";
import type { FilmScene } from "@/lib/film.functions";
import { emptySceneTruth, mergeSceneTruth } from "@/lib/scene-truth";
import {
  emptyStoryState,
  normalizeStoryState,
  storyStateSchema,
  type StoryState,
} from "@/lib/story-state";

/**
 * PHASE 2.1 — character state + character knowledge contract.
 * Pure data work: no network, no model, no credits, no database.
 */

const truth = (over: Partial<ReturnType<typeof emptySceneTruth>>) =>
  mergeSceneTruth(emptySceneTruth(), {
    emotional_core: "He understands too late",
    what_must_survive: "The recognition lands",
    chosen_execution: "A held look",
    characters: "Jay; Mara",
    action: "Jay steps inside",
    ...over,
  });

const scene = (over: Partial<FilmScene>): FilmScene => ({
  id: "s1",
  scene_number: 1,
  title: "Scene",
  idea: "An arrival",
  narration: "",
  credit_cost: 70,
  complexity: 5,
  clarity_verdict: "clear",
  clarity_note: "",
  queued: false,
  generation_id: null,
  status: "idle",
  video_url: null,
  voice_url: null,
  error_message: null,
  truth: null,
  recovery: null,
  ...over,
});

const film = {
  id: "film-1",
  title: "The Late Hour",
  characters: [
    { name: "Jay", look: "grey coat" },
    { name: "Mara", look: "raincoat" },
  ],
};

const normalized = () =>
  normalizeStoryState({
    film,
    scenes: [
      scene({
        id: "s1",
        scene_number: 1,
        truth: truth({ setting: "The apartment", time_period: "Night" }),
      }),
      scene({
        id: "s5",
        scene_number: 5,
        truth: truth({
          setting: "The hospital",
          time_period: "Morning",
          reveal: "Mara was there all along",
        }),
      }),
    ],
  });

describe("1-2. Canonical structures exist", () => {
  it("character_states and knowledge_events are part of StoryState", () => {
    const state = emptyStoryState();
    expect(state.character_states).toEqual([]);
    expect(state.knowledge_events).toEqual([]);
    expect(storyStateSchema.safeParse(state).success).toBe(true);
  });
});

describe("3. Canonical character ids", () => {
  it("state and knowledge reference character ids, not display names", () => {
    const state = normalized();
    const ids = new Set(state.characters.map((c) => c.id));
    expect(state.character_states.map((c) => c.character_id).every((id) => ids.has(id))).toBe(true);
    expect(
      state.knowledge_events
        .filter((e) => e.holder === "character")
        .every((e) => e.character_id !== null && ids.has(e.character_id)),
    ).toBe(true);
    expect(state.character_states.map((c) => c.character_id)).not.toContain("Jay");
  });
});

describe("4-7. Knowledge states", () => {
  it("accepts unknown, known, revealed and inferred without collapsing them", () => {
    const parsed = storyStateSchema.parse({
      ...emptyStoryState(),
      characters: [{ id: "jay", name: "Jay" }],
      knowledge_events: [
        { id: "k1", character_id: "jay", subject: "X", state: "unknown", scene_number: 1 },
        { id: "k2", character_id: "jay", subject: "X", state: "inferred", scene_number: 2 },
        { id: "k3", character_id: "jay", subject: "X", state: "revealed", scene_number: 4 },
        { id: "k4", character_id: "jay", subject: "Y", state: "known", scene_number: null },
      ],
    });
    expect(parsed.knowledge_events.map((e) => e.state)).toEqual([
      "unknown",
      "inferred",
      "revealed",
      "known",
    ]);
    expect(parsed.knowledge_events[1].state).not.toBe("known");
  });

  it("normalization records revelation, and never invents knowledge", () => {
    const state = normalized();
    const revealed = state.knowledge_events.filter((e) => e.state === "revealed");
    expect(revealed.length).toBeGreaterThan(0);
    expect(state.knowledge_events.some((e) => e.state === "inferred")).toBe(false);
    expect(normalizeStoryState({ film }).knowledge_events).toEqual([]);
  });
});

describe("8-11. Scene origin, append-only, multiple events and characters", () => {
  it("knowledge carries its scene origin", () => {
    const event = normalized().knowledge_events.find((e) => e.holder === "character")!;
    expect(event.scene_number).toBe(5);
    expect(event.scene_id).toBe("s5");
  });

  it("an earlier unknown event is preserved beside a later revealed one", () => {
    const parsed = storyStateSchema.parse({
      ...emptyStoryState(),
      characters: [{ id: "jay", name: "Jay" }],
      character_states: [
        {
          character_id: "jay",
          knowledge: [
            { id: "k1", character_id: "jay", subject: "X", state: "unknown", scene_number: 1 },
            { id: "k2", character_id: "jay", subject: "X", state: "revealed", scene_number: 4 },
          ],
        },
      ],
    });
    const history = parsed.character_states[0].knowledge;
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ scene_number: 1, state: "unknown" });
    expect(history[1]).toMatchObject({ scene_number: 4, state: "revealed" });
  });

  it("different characters carry their own knowledge", () => {
    const state = normalized();
    const holders = state.character_states.map((c) => c.character_id).sort();
    expect(holders).toEqual(["jay", "mara"]);
    expect(state.character_states.every((c) => c.knowledge.length === 1)).toBe(true);
  });

  it("reader knowledge is distinguishable from character knowledge", () => {
    const state = normalized();
    const reader = state.knowledge_events.filter((e) => e.holder === "reader");
    expect(reader).toHaveLength(1);
    expect(reader[0].character_id).toBeNull();
    expect(state.character_states.every((c) => c.knowledge.every((k) => k.holder === "character"))).toBe(
      true,
    );
  });
});

describe("12. State transitions preserve history", () => {
  it("both the apartment and the hospital event survive", () => {
    const jay = normalized().character_states.find((c) => c.character_id === "jay")!;
    expect(jay.events.map((e) => e.value)).toEqual(["The apartment", "The hospital"]);
    expect(jay.events.map((e) => e.scene_number)).toEqual([1, 5]);
    expect(jay.events.every((e) => e.aspect === "location")).toBe(true);
  });
});

describe("13. Evidence is never fabricated", () => {
  it("every derived event points at a real scene field", () => {
    const state = normalized();
    for (const event of [
      ...state.character_states.flatMap((c) => c.events),
      ...state.knowledge_events,
    ]) {
      expect(event.evidence.length).toBeGreaterThan(0);
      for (const ref of event.evidence) {
        expect(["setting", "reveal"]).toContain(ref.field);
        expect(state.scenes.map((s) => s.id)).toContain(ref.scene_id);
      }
    }
  });

  it("a hand-authored event without evidence stays empty", () => {
    const parsed = storyStateSchema.parse({
      ...emptyStoryState(),
      knowledge_events: [{ id: "k", character_id: null, subject: "X", state: "known" }],
    });
    expect(parsed.knowledge_events[0].evidence).toEqual([]);
    expect(parsed.knowledge_events[0].fact_id).toBeNull();
  });
});

describe("14-15. Invalid references remain detectable", () => {
  const broken = (): StoryState =>
    storyStateSchema.parse({
      ...emptyStoryState(),
      characters: [{ id: "jay", name: "Jay" }],
      scenes: [{ id: "s1", scene_number: 1, title: "One" }],
      character_states: [{ character_id: "ghost" }],
      knowledge_events: [
        {
          id: "k1",
          character_id: "ghost",
          subject: "X",
          state: "known",
          fact_id: "missing-fact",
          scene_number: 9,
        },
      ],
    });

  it("the existing engine reports missing characters, facts and scenes", () => {
    const ids = check(broken()).map((f) => f.id);
    expect(ids).toContain("CONTINUITY_INVALID_REFERENCE:character-state-ghost");
    expect(ids).toContain("CONTINUITY_INVALID_REFERENCE:knowledge-k1-character-ghost");
    expect(ids).toContain("CONTINUITY_INVALID_REFERENCE:knowledge-k1-fact-missing-fact");
    expect(ids).toContain("CONTINUITY_INVALID_REFERENCE:knowledge-k1-scene-9");
  });

  it("valid references produce no reference finding", () => {
    const state = normalized();
    const ids = check(state)
      .filter((f) => f.ruleId === "CONTINUITY_INVALID_REFERENCE")
      .map((f) => f.id);
    expect(ids.filter((id) => /knowledge|character-state/.test(id))).toEqual([]);
  });
});

describe("16-17. Purity and determinism", () => {
  it("normalization does not mutate its inputs", () => {
    const scenes = [scene({ truth: truth({ setting: "The apartment" }) })];
    const copy = structuredClone(scenes);
    normalizeStoryState({ film, scenes });
    expect(scenes).toEqual(copy);
  });

  it("check() does not mutate the state", () => {
    const state = normalized();
    const before = structuredClone(state);
    check(state);
    expect(state).toEqual(before);
  });

  it("same input gives byte-identical character state output", () => {
    expect(JSON.stringify(normalized().character_states)).toBe(
      JSON.stringify(normalized().character_states),
    );
    expect(normalized().version.id).toBe(normalized().version.id);
  });
});

describe("19-20. No AI, no network, no database", () => {
  const source = ["src/lib/story-state.ts", "src/lib/continuity-engine.ts"].map((path) =>
    readFileSync(new URL(`../${path}`, import.meta.url), "utf8"),
  );

  it("the continuity data layer contains no provider, fetch or persistence calls", () => {
    for (const code of source) {
      expect(code).not.toMatch(/fetch\(|openai|anthropic|embedding|supabase|createServerFn/i);
      expect(code).not.toMatch(/CREATE TABLE|ALTER TABLE|insert\(/i);
    }
  });
});
