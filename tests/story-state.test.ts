import { describe, expect, it } from "vitest";

import type { FilmBible, FilmModel } from "@/lib/director.functions";
import type { FilmScene, FilmView } from "@/lib/film.functions";
import { emptySceneTruth, mergeSceneTruth } from "@/lib/scene-truth";
import {
  emptyStoryState,
  normalizeStoryState,
  publicStoryState,
  readStoryState,
  storyStateSchema,
  versionId,
} from "@/lib/story-state";
import { TWIST_COUNT } from "@/lib/twists";

const HIDDEN = "The corpse is the detective's own future self";

const bible: FilmBible = {
  title: "Echo of Flesh",
  premise: "A detective works a case that points back at him.",
  cast: ["Ruben — grey coat, identical scar", "Mara — forensic lead"],
  setting: "A flooded parking garage at night",
  mood: "cold dread",
  look: "sodium light, wet concrete",
  camera: "slow handheld push",
  emotional_arc: "investigation to self-recognition",
  ending: "He touches the scar and understands",
  decisions: ["Keep the scar as the clue"],
  assumptions: [],
  discoveries: ["The clue should be physical, not spoken"],
  recommendations: [],
  open_questions: ["Does Mara already know?"],
  twist: {
    pattern: "identity.future-self",
    statement: HIDDEN,
    emotional_purpose: "Recognition lands as grief, not spectacle",
    foreshadowing: ["An identical scar", "A dossier photo face-down"],
    reveal: "He matches the dossier photo to his own hand",
    visual_clue: "The scar",
    ending_implication: "He cannot prevent it",
  },
};

const model: FilmModel = {
  story: "A detective investigates a death that is his own",
  characters: "Ruben, Mara",
  world: "Rain-soaked industrial city",
  time: "One night",
  emotion: "dread turning to grief",
  camera: "handheld",
  audience: "Anyone who fears their own future",
  ending: "Recognition",
  facts: [
    { key: "Scar", value: "Left hand, identical on both", source: "user_decision" },
    { key: "Weather", value: "Rain all night", source: "ai_assumption" },
  ],
  continuity: ["The scar never changes sides"],
  impact_chain: ["scar -> reveal -> ending"],
  open_questions: ["Does Mara already know?"],
};

const truth = mergeSceneTruth(emptySceneTruth(), {
  emotional_core: "Recognition lands as grief",
  what_must_survive: "He sees the scar on the body",
  chosen_execution: "Dossier photo beside his own hand",
  characters: "Ruben; Mara",
  action: "He lowers the photo next to his hand",
  setting: "Flooded parking garage",
  time_period: "Night, present day",
  reveal: "The scar matches",
  twist: HIDDEN,
  foreshadowing: "The photo lay face-down earlier",
  continuity: "Scar stays on the left hand",
  provenance: { what_must_survive: "user_decision" },
  user_decisions: ["Keep the scar as the clue"],
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
  recovery: { outcome: "generated", note: "restaged", awaiting_approval: false },
  ...over,
});

const film: Partial<FilmView> = {
  id: "story-1",
  title: "Echo of Flesh",
  logline: "A detective investigates his own death.",
  setting: "A flooded parking garage",
  style: "cinematic",
  created_at: "2026-09-01T00:00:00Z",
  characters: [{ name: "Ruben", look: "grey coat" }],
  director_session_id: "session-1",
};

const full = () =>
  normalizeStoryState({
    film,
    scenes: [
      scene(),
      scene({
        id: "scene-b",
        scene_number: 2,
        video_url: null,
        status: "idle",
        clarity_verdict: "risky",
      }),
    ],
    film_model: model,
    film_bible: bible,
  });

describe("A. StoryState type validity", () => {
  it("empty state parses and carries every canonical branch", () => {
    const state = emptyStoryState();
    expect(storyStateSchema.safeParse(state).success).toBe(true);
    expect(Object.keys(state).sort()).toEqual(
      [
        "characters",
        "continuity",
        "facts",
        "film_bible",
        "generation",
        "identity",
        "open_threads",
        "payoffs",
        "relationships",
        "scenes",
        "story_dna",
        "timeline",
        "twist",
        "version",
        "world",
      ].sort(),
    );
  });
});

describe("B. Story DNA normalization", () => {
  it("reads DNA from the bible and model without inventing content", () => {
    const { story_dna: dna } = full();
    expect(dna.premise).toBe(bible.premise);
    expect(dna.emotional_core).toBe(bible.emotional_arc);
    expect(dna.ending_intention).toBe(bible.ending);
    expect(dna.what_must_survive).toContain("He sees the scar on the body");
    expect(dna.central_question).toBe("Does Mara already know?");
  });

  it("leaves unknown DNA fields null rather than guessing", () => {
    const dna = normalizeStoryState({}).story_dna;
    expect(dna.premise).toBeNull();
    expect(dna.emotional_core).toBeNull();
    expect(dna.what_must_survive).toEqual([]);
  });
});

describe("C. Character normalization", () => {
  it("merges film characters and bible cast into stable ids", () => {
    const names = full().characters.map((c) => c.name);
    expect(names).toContain("Ruben");
    expect(names).toContain("Mara");
    expect(full().characters.every((c) => c.id.length > 0)).toBe(true);
  });
});

describe("D. Character knowledge representation", () => {
  it("accepts the four knowledge states", () => {
    const parsed = storyStateSchema.parse({
      ...emptyStoryState(),
      characters: [
        {
          id: "ruben",
          name: "Ruben",
          knowledge: [
            { subject: "the body is his", state: "unknown", scene: 1 },
            { subject: "the body is his", state: "revealed", scene: 3 },
            { subject: "Mara lied", state: "inferred", scene: 2 },
            { subject: "the scar", state: "known", scene: null },
          ],
        },
      ],
    });
    expect(parsed.characters[0].knowledge.map((k) => k.state)).toEqual([
      "unknown",
      "revealed",
      "inferred",
      "known",
    ]);
  });
});

describe("E. World representation", () => {
  it("normalizes setting, rules and anchors", () => {
    const world = full().world;
    expect(world.locations[0].name).toBe(bible.setting);
    expect(world.rules).toContain("The scar never changes sides");
    expect(world.environment).toBe(model.world);
  });
});

describe("F. Timeline representation", () => {
  it("one event per scene, ordered, with story time and characters", () => {
    const timeline = full().timeline;
    expect(timeline.map((e) => e.sequence)).toEqual([1, 2]);
    expect(timeline[0].story_time).toBe("Night, present day");
    expect(timeline[0].characters).toEqual(["Ruben", "Mara"]);
  });
});

describe("G. Fact representation", () => {
  it("carries provenance from the director's film model", () => {
    const facts = full().facts;
    expect(facts.find((f) => f.category === "Scar")?.source).toBe("user_decision");
    expect(facts.find((f) => f.category === "Weather")?.source).toBe("ai_assumption");
    expect(facts.every((f) => f.status === "true")).toBe(true);
  });
});

describe("H. Relationship representation", () => {
  it("accepts edges without inventing them during normalization", () => {
    expect(full().relationships).toEqual([]);
    const parsed = storyStateSchema.parse({
      ...emptyStoryState(),
      relationships: [
        {
          id: "r1",
          character_a: "ruben",
          character_b: "mara",
          type: "colleagues",
          state: "strained",
          established_in_scene: 1,
        },
      ],
    });
    expect(parsed.relationships[0].changed_in_scene).toBeNull();
  });
});

describe("I. Open thread representation", () => {
  it("open questions become open threads with deterministic status", () => {
    const threads = full().open_threads;
    expect(threads.length).toBe(1);
    expect(threads[0].question).toBe("Does Mara already know?");
    expect(threads[0].status).toBe("open");
    expect(() =>
      storyStateSchema.parse({
        ...emptyStoryState(),
        open_threads: [{ id: "t", question: "q", status: "pending" }],
      }),
    ).toThrow();
  });
});

describe("J. Payoff representation", () => {
  it("the accepted turn produces one payoff with its setups", () => {
    const payoffs = full().payoffs;
    expect(payoffs).toHaveLength(1);
    expect(payoffs[0].setups).toEqual(bible.twist?.foreshadowing);
    expect(payoffs[0].payoff_scene).toBe(1);
    expect(payoffs[0].status).toBe("set_up");
  });

  it("no twist means no invented payoff", () => {
    expect(normalizeStoryState({ film_bible: { ...bible, twist: null } }).payoffs).toEqual([]);
  });
});

describe("K. Scene representation", () => {
  it("keeps purpose, reveal, generation state and Scene Truth intact", () => {
    const [first, second] = full().scenes;
    expect(first.purpose).toBe("Recognition lands as grief");
    expect(first.revealed).toBe("The scar matches");
    expect(first.truth?.chosen_execution).toBe("Dossier photo beside his own hand");
    expect(first.generation).toMatchObject({
      status: "completed",
      has_clip: true,
      credit_cost: 70,
      recovered: true,
    });
    expect(second.generation).toMatchObject({ status: "idle", has_clip: false });
  });
});

describe("L. Plot Twist integration", () => {
  it("references the library pattern instead of restating twist logic", () => {
    const twist = full().twist;
    expect(twist.present).toBe(true);
    expect(twist.pattern).toBe("identity.future-self");
    expect(twist.reveal_type).toBe("identity");
    expect(twist.foreshadowing).toEqual(bible.twist?.foreshadowing);
    expect(twist.payoff_requirements).toContain(bible.twist?.reveal);
  });
});

describe("M. StoryState version identity", () => {
  it("same content gives the same id, changed content a different one", () => {
    const a = full();
    const b = full();
    expect(a.version.id).toBe(b.version.id);
    expect(a.version.schema).toBe(1);
    expect(a.generation.based_on_version).toBe(a.version.id);
    const changed = normalizeStoryState({
      film,
      scenes: [scene({ title: "The garage, later" })],
      film_model: model,
      film_bible: bible,
    });
    expect(changed.version.id).not.toBe(a.version.id);
    expect(versionId(a)).toBe(a.version.id);
  });

  it("records which existing systems it was derived from", () => {
    expect(full().version.derived_from).toEqual(["film", "scenes", "film_model", "film_bible"]);
  });
});

describe("N. Missing / legacy fields", () => {
  it("an empty input yields empty structures, not fabricated values", () => {
    const state = normalizeStoryState({});
    expect(state.scenes).toEqual([]);
    expect(state.characters).toEqual([]);
    expect(state.identity.title).toBe("");
    expect(state.generation.scenes_total).toBe(0);
  });

  it("legacy scenes without Scene Truth still normalize", () => {
    const state = normalizeStoryState({ film, scenes: [scene({ truth: null, recovery: null })] });
    expect(state.scenes[0].truth).toBeNull();
    expect(state.scenes[0].action).toBe("A detective finds a body");
    expect(state.scenes[0].generation?.recovered).toBe(false);
  });

  it("readStoryState rejects unknown shapes instead of guessing", () => {
    expect(readStoryState(null)).toBeNull();
    expect(readStoryState({ nope: true })).toBeNull();
    expect(readStoryState(emptyStoryState())?.version.schema).toBe(1);
  });
});

describe("O. Existing Film Bible compatibility", () => {
  it("references the bible rather than replacing it", () => {
    const ref = full().film_bible;
    expect(ref.present).toBe(true);
    expect(ref.cast).toEqual(bible.cast);
    expect(ref.mood).toBe(bible.mood);
    expect(ref.has_twist).toBe(true);
    expect(Object.keys(ref)).not.toContain("premise");
  });
});

describe("P. Existing Scene Truth compatibility", () => {
  it("Scene Truth is stored unchanged, including provenance", () => {
    const stored = full().scenes[0].truth;
    expect(stored).toEqual(truth);
    expect(stored?.provenance.what_must_survive).toBe("user_decision");
    expect(stored?.user_decisions).toContain("Keep the scar as the clue");
  });
});

describe("Q. No hidden truth leakage", () => {
  it("the public projection contains no hidden truth or internal data", () => {
    const state = full();
    expect(state.twist.hidden_truth).toBe(HIDDEN);
    const json = JSON.stringify(publicStoryState(state));
    expect(json).not.toContain(HIDDEN);
    expect(json).not.toContain("scar");
    expect(json).not.toContain("gen-1");
    expect(json).not.toContain("session-1");
    expect(json).not.toContain("story-1");
    expect(json).not.toContain("70");
    expect(json).not.toContain("user_decision");
  });

  it("the public projection still shows what a viewer needs", () => {
    const view = publicStoryState(full());
    expect(view.title).toBe("Echo of Flesh");
    expect(view.scene_count).toBe(2);
    expect(view.scenes_rendered).toBe(1);
    expect(view.scenes[0]).toEqual({ scene_number: 1, title: "The garage", has_clip: true });
  });
});

describe("R. No duplicate twist engine", () => {
  it("StoryState holds no patterns and the library is still the only engine", () => {
    expect(TWIST_COUNT).toBeGreaterThanOrEqual(300);
    const source = new URL("../src/lib/story-state.ts", import.meta.url);
    const code = require("node:fs").readFileSync(source, "utf8") as string;
    expect(code).not.toMatch(/TWIST_LIBRARY|searchTwists|buildFamily/);
  });
});

describe("S. Existing Director regression protection", () => {
  it("normalization is read-only: the inputs are not mutated", () => {
    const bibleCopy = structuredClone(bible);
    const modelCopy = structuredClone(model);
    const scenes = [scene()];
    const sceneCopy = structuredClone(scenes);
    normalizeStoryState({ film, scenes, film_model: modelCopy, film_bible: bibleCopy });
    expect(bibleCopy).toEqual(bible);
    expect(modelCopy).toEqual(model);
    expect(scenes).toEqual(sceneCopy);
  });
});

describe("T. Existing generation regression protection", () => {
  it("generation state only reports, never changes cost or provider", () => {
    const gen = full().generation;
    expect(gen.scenes_total).toBe(2);
    expect(gen.scenes_rendered).toBe(1);
    expect(gen.budget_credits).toBe(140);
    expect(Object.keys(gen)).toEqual([
      "based_on_version",
      "scenes_total",
      "scenes_rendered",
      "budget_credits",
    ]);
  });

  it("continuity is honestly marked unvalidated in this phase", () => {
    const continuity = full().continuity;
    expect(continuity.validated).toBe(false);
    expect(continuity.known_issues).toEqual([]);
    expect(continuity.affected_scenes).toEqual([2]);
  });
});
