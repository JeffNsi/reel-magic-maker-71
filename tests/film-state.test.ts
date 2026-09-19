import { describe, expect, it } from "vitest";

import {
  affectedScenes,
  canonicalId,
  normalizeFilmState,
  requiredReferences,
  wardrobeAt,
} from "@/lib/film-state";
import { sceneTruthSchema } from "@/lib/scene-truth";
import { emptyStoryState, storyStateSchema, type StoryState } from "@/lib/story-state";

function story(over: Partial<StoryState> = {}): StoryState {
  return storyStateSchema.parse({ ...emptyStoryState(), ...over });
}

const truth = (o: Record<string, unknown>) => sceneTruthSchema.parse(o);

function base(): StoryState {
  return story({
    identity: { ...emptyStoryState().identity, story_id: "film-1" },
    story_dna: { ...emptyStoryState().story_dna, title: "The Vanishing Tide", style: "cinematic" },
    characters: [
      { ...blankChar(), id: "c1", name: "Amara", appearance: "short black hair, scar" },
      { ...blankChar(), id: "c2", name: "David" },
    ],
    world: {
      locations: [{ id: "l1", name: "Amara Apartment", description: "small, warm" }],
      environment: null,
      rules: [],
      objects: [{ id: "o1", name: "Phone", significance: "carries the reveal" }],
      visual_details: [],
    },
    scenes: [
      {
        ...blankScene(),
        id: "s1",
        scene_number: 1,
        title: "Morning",
        characters: ["Amara"],
        action: "Amara picks up the phone",
        truth: truth({
          setting: "Amara Apartment",
          wardrobe: "grey wool coat",
          characters: "Amara",
          action: "Amara picks up the phone",
          lighting: "cold window light",
        }),
      },
      {
        ...blankScene(),
        id: "s2",
        scene_number: 2,
        title: "Street",
        characters: ["Amara", "David"],
        truth: truth({ setting: "Stockholm Street", characters: "Amara and David" }),
      },
    ],
  });
}

function blankChar() {
  return {
    id: "",
    name: "",
    role: null,
    age: null,
    appearance: null,
    goal: null,
    want: null,
    need: null,
    fear: null,
    flaw: null,
    secret: null,
    motivation: null,
    relationships: [],
    knowledge: [],
    emotional_state: null,
    character_arc: null,
  };
}

function blankScene() {
  return {
    id: "",
    scene_number: 0,
    title: "",
    purpose: null,
    conflict: null,
    location: null,
    time: null,
    characters: [] as string[],
    objective: null,
    action: null,
    emotion: null,
    revealed: null,
    hidden: null,
    consequence: null,
    facts_created: [],
    facts_changed: [],
    threads_created: [],
    threads_resolved: [],
    payoffs: [],
    truth: null,
    generation: null,
  };
}

describe("canonical film state", () => {
  it("gives every character a permanent canonical id", () => {
    const s = normalizeFilmState({ story: base(), film: null });
    expect(s.characters.map((c) => c.canonical_id)).toEqual(["AMARA_01", "DAVID_01"]);
  });

  it("is deterministic for the same input", () => {
    const a = normalizeFilmState({ story: base(), film: null });
    const b = normalizeFilmState({ story: base(), film: null });
    expect(a).toEqual(b);
  });

  it("does not mutate the input story state", () => {
    const input = base();
    const snapshot = JSON.stringify(input);
    normalizeFilmState({ story: input, film: null });
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("locks identity, face, hair, skin and body by default", () => {
    const s = normalizeFilmState({ story: base(), film: null });
    const amara = s.characters[0]!;
    expect(amara.locks.identity).toBe(true);
    expect(amara.locks.face).toBe(true);
    expect(amara.locks.hair).toBe(true);
    expect(amara.locks.wardrobe).toBe(false);
  });

  it("never invents appearance the story did not establish", () => {
    const s = normalizeFilmState({ story: base(), film: null });
    expect(s.characters[1]!.appearance).toBeNull();
  });

  it("creates permanent environment ids from declared and scene locations", () => {
    const s = normalizeFilmState({ story: base(), film: null });
    expect(s.environments.map((e) => e.canonical_id)).toEqual([
      "AMARA_APARTMENT_01",
      "STOCKHOLM_STREET_01",
    ]);
  });

  it("reuses the same environment id across scenes in the same place", () => {
    const st = base();
    st.scenes[1]!.truth = truth({ setting: "Amara Apartment" });
    const s = normalizeFilmState({ story: st, film: null });
    expect(s.scenes.map((x) => x.environment_id)).toEqual([
      "AMARA_APARTMENT_01",
      "AMARA_APARTMENT_01",
    ]);
    expect(s.environments).toHaveLength(1);
  });

  it("chains scenes forwards and backwards", () => {
    const s = normalizeFilmState({ story: base(), film: null });
    expect(s.scenes[0]!.previous_scene_id).toBeNull();
    expect(s.scenes[0]!.next_scene_id).toBe("s2");
    expect(s.scenes[1]!.previous_scene_id).toBe("s1");
    expect(s.scenes[1]!.next_scene_id).toBeNull();
  });

  it("records wardrobe as an explicit scene-owned event", () => {
    const s = normalizeFilmState({ story: base(), film: null });
    expect(s.wardrobe).toHaveLength(1);
    expect(s.wardrobe[0]).toMatchObject({
      character_id: "AMARA_01",
      value: "grey wool coat",
      scene_number: 1,
    });
  });

  it("inherits wardrobe into later scenes without a new event", () => {
    const s = normalizeFilmState({ story: base(), film: null });
    expect(wardrobeAt(s, "AMARA_01", 2)?.value).toBe("grey wool coat");
    expect(wardrobeAt(s, "DAVID_01", 2)).toBeNull();
  });

  it("uses the newest explicit wardrobe change", () => {
    const st = base();
    st.scenes[1]!.truth = truth({
      setting: "Stockholm Street",
      characters: "Amara",
      wardrobe: "red raincoat",
    });
    const s = normalizeFilmState({ story: st, film: null });
    expect(wardrobeAt(s, "AMARA_01", 2)?.value).toBe("red raincoat");
    expect(wardrobeAt(s, "AMARA_01", 1)?.value).toBe("grey wool coat");
  });

  it("tracks props the scene actually names", () => {
    const s = normalizeFilmState({ story: base(), film: null });
    expect(s.props[0]!.canonical_id).toBe("PHONE_01");
    expect(s.scenes[0]!.props).toEqual(["PHONE_01"]);
    expect(s.scenes[1]!.props).toEqual([]);
  });

  it("builds a global continuity graph", () => {
    const s = normalizeFilmState({ story: base(), film: null });
    expect(s.continuity_graph).toContainEqual({
      from: "AMARA_01",
      relation: "appears_in",
      to: "1",
    });
    expect(s.continuity_graph).toContainEqual({
      from: "AMARA_APARTMENT_01",
      relation: "used_by",
      to: "1",
    });
  });

  it("reports affected scenes when canonical truth changes", () => {
    const s = normalizeFilmState({ story: base(), film: null });
    expect(affectedScenes(s, "AMARA_01")).toEqual([1, 2]);
    expect(affectedScenes(s, "DAVID_01")).toEqual([2]);
  });

  it("requires references before generation and reports missing packs", () => {
    const s = normalizeFilmState({ story: base(), film: null });
    const r = requiredReferences(s, "s1");
    expect(r.characters).toEqual(["AMARA_01"]);
    expect(r.environments).toEqual(["AMARA_APARTMENT_01"]);
    expect(r.missing.length).toBeGreaterThan(0);
  });

  it("never marks anything as validated in this phase", () => {
    const s = normalizeFilmState({ story: base(), film: null });
    expect(s.scenes.every((x) => x.validation_status === "unknown")).toBe(true);
  });

  it("keeps evidence pointing at real fields only", () => {
    const s = normalizeFilmState({ story: base(), film: null });
    expect(s.characters[0]!.evidence.map((e) => e.field)).toContain("characters.appearance");
    expect(s.characters[1]!.evidence.every((e) => e.value.length > 0)).toBe(true);
  });

  it("handles an empty story without inventing entities", () => {
    const s = normalizeFilmState({ story: story(), film: null });
    expect(s.characters).toEqual([]);
    expect(s.environments).toEqual([]);
    expect(s.scenes).toEqual([]);
    expect(s.continuity_graph).toEqual([]);
  });

  it("keeps canonical ids unique for duplicate names", () => {
    const taken = new Set<string>();
    expect(canonicalId("Amara", taken)).toBe("AMARA_01");
    expect(canonicalId("Amara", taken)).toBe("AMARA_02");
  });

  it("records generation history without promoting output to truth", () => {
    const st = base();
    const s = normalizeFilmState({
      story: st,
      film: {
        id: "film-1",
        title: "The Vanishing Tide",
        logline: "",
        setting: "",
        style: "cinematic",
        blueprint: "",
        created_at: "",
        characters: [{ name: "David", look: "tall, grey coat" }],
        director_session_id: null,
        saved: false,
        share_slug: null,
        scenes: [
          {
            id: "s1",
            scene_number: 1,
            title: "Morning",
            idea: "",
            narration: "",
            credit_cost: 70,
            complexity: null,
            clarity_verdict: null,
            clarity_note: "",
            queued: false,
            generation_id: "g1",
            status: "completed",
            video_url: "https://example.com/1.mp4",
            voice_url: null,
            error_message: null,
            truth: null,
            recovery: null,
          },
        ],
      },
    });
    expect(s.generation_history).toHaveLength(1);
    expect(s.generation_history[0]!.validation).toBe("unknown");
    // the film view's look filled a gap, but never overwrote canonical appearance
    expect(s.characters[1]!.appearance).toBe("tall, grey coat");
    expect(s.characters[0]!.appearance).toBe("short black hair, scar");
  });
});
