import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { check, checkReport } from "@/lib/continuity-engine";
import { CONTINUITY_RULES, RULE_IDS, type RuleId } from "@/lib/continuity-rules";
import { emptySceneTruth } from "@/lib/scene-truth";
import { storyStateSchema, type StoryState } from "@/lib/story-state";

/**
 * Deterministic continuity engine tests — no network, no model, no credits.
 * Every case is built from the canonical StoryState contract only.
 */

const truth = (over: Partial<ReturnType<typeof emptySceneTruth>> = {}) => ({
  ...emptySceneTruth(),
  emotional_core: "A father realizes he is too late.",
  what_must_survive: "The message is read aloud.",
  chosen_execution: "Close on the phone, then his face.",
  ...over,
});

function state(over: Record<string, unknown> = {}): StoryState {
  const base = {
    identity: { story_id: "film-1", title: "Through the Glass", style: "cinematic" },
    story_dna: {},
    film_bible: { present: true },
    characters: [
      { id: "maya", name: "Maya" },
      { id: "jay", name: "Jay" },
    ],
    world: {
      locations: [{ id: "kitchen", name: "Kitchen" }],
      objects: [{ id: "phone", name: "Phone" }],
    },
    timeline: [
      { id: "scene-1", story_time: "2026", sequence: 1, scene_number: 1, description: "Opening" },
      { id: "scene-2", story_time: "2026", sequence: 2, scene_number: 2, description: "Reveal" },
    ],
    facts: [],
    relationships: [],
    open_threads: [],
    payoffs: [],
    scenes: [
      {
        id: "s1",
        scene_number: 1,
        title: "The message",
        location: "Kitchen",
        time: "Night",
        characters: ["Maya"],
        truth: truth({ foreshadowing: "A second reflection in the glass." }),
      },
      {
        id: "s2",
        scene_number: 2,
        title: "The glass",
        location: "Hallway",
        time: "Later",
        characters: ["Jay"],
        truth: truth({ reveal: "The reflection is not his." }),
      },
    ],
    twist: {},
    continuity: {},
    generation: { scenes_total: 2, scenes_rendered: 0, based_on_version: null },
    version: { schema: 1 as const, id: "v1.abc", derived_from: [], created_at: null },
    ...over,
  };
  return storyStateSchema.parse(base);
}

const ids = (findings: { ruleId: RuleId }[]) => findings.map((f) => f.ruleId);
const has = (findings: { ruleId: RuleId }[], id: RuleId) => ids(findings).includes(id);

describe("continuity engine — clean state", () => {
  it("1. a clean story produces zero findings", () => {
    expect(check(state())).toEqual([]);
  });

  it("21. missing optional data does not create false positives", () => {
    const sparse = state({
      characters: [],
      world: { locations: [], objects: [] },
      timeline: [],
      scenes: [{ id: "s1", scene_number: 1, title: "Untitled", truth: null }],
      generation: { scenes_total: 1, scenes_rendered: 0, based_on_version: null },
    });
    expect(check(sparse)).toEqual([]);
  });
});

describe("rules 1–3 — entities and references", () => {
  it("2. a missing entity is detected", () => {
    const s = state({
      scenes: [
        {
          id: "s1",
          scene_number: 1,
          title: "The message",
          characters: ["char_123"],
          truth: truth(),
        },
      ],
      timeline: [],
      generation: { scenes_total: 1, scenes_rendered: 0, based_on_version: null },
    });
    const findings = check(s);
    expect(has(findings, "CONTINUITY_MISSING_ENTITY")).toBe(true);
    expect(findings[0]?.evidence.some((e) => e.value === "char_123")).toBe(true);
  });

  it("3. duplicates are detected only where identity is supported", () => {
    const duplicated = state({
      characters: [
        { id: "maya", name: "Maya" },
        { id: "maya-2", name: "maya" },
      ],
    });
    expect(has(check(duplicated), "CONTINUITY_DUPLICATE_ENTITY")).toBe(true);
    // Distinct names are never treated as duplicates.
    expect(has(check(state()), "CONTINUITY_DUPLICATE_ENTITY")).toBe(false);
  });

  it("4. an invalid reference is detected", () => {
    const broken = state({
      payoffs: [
        { id: "payoff-twist", requirement: "The turn lands", setups: ["clue"], thread_id: "ghost" },
      ],
    });
    expect(has(check(broken), "CONTINUITY_INVALID_REFERENCE")).toBe(true);
  });
});

describe("rule 4 — age arithmetic", () => {
  const withAge = (age: string) =>
    state({
      characters: [{ id: "maya", name: "Maya", age }],
      timeline: [
        { id: "scene-1", story_time: "2030", sequence: 1, scene_number: 1, description: "Opening" },
      ],
    });

  it("5. a correct age produces no finding", () => {
    expect(has(check(withAge("40, born 1990")), "CONTINUITY_AGE_MISMATCH")).toBe(false);
  });

  it("6. an incorrect age produces a finding", () => {
    expect(has(check(withAge("22, born 1990")), "CONTINUITY_AGE_MISMATCH")).toBe(true);
  });

  it("a missing birth year never becomes an age mismatch", () => {
    expect(has(check(withAge("22")), "CONTINUITY_AGE_MISMATCH")).toBe(false);
  });
});

describe("rules 5–6 — timeline and state", () => {
  it("7. a correct timeline produces no finding", () => {
    expect(has(check(state()), "CONTINUITY_TIMELINE_ORDER")).toBe(false);
  });

  it("8. a contradictory timeline produces a finding", () => {
    const s = state({
      timeline: [
        { id: "scene-1", story_time: "2026", sequence: 1, scene_number: 1, description: "Now" },
        { id: "scene-2", story_time: "1926", sequence: 2, scene_number: 2, description: "Then" },
      ],
    });
    expect(has(check(s), "CONTINUITY_TIMELINE_ORDER")).toBe(true);
  });

  it("9. a valid state produces no impossible-state finding", () => {
    expect(has(check(state()), "CONTINUITY_IMPOSSIBLE_STATE")).toBe(false);
  });

  it("10. an impossible state transition produces a finding", () => {
    const s = state({
      scenes: [
        {
          id: "s1",
          scene_number: 1,
          title: "Kitchen",
          location: "Kitchen",
          time: "Midnight",
          characters: ["Maya"],
          truth: truth(),
        },
        {
          id: "s2",
          scene_number: 2,
          title: "Pier",
          location: "Pier",
          time: "Midnight",
          characters: ["Maya"],
          truth: truth(),
        },
      ],
    });
    expect(has(check(s), "CONTINUITY_IMPOSSIBLE_STATE")).toBe(true);
  });
});

describe("rule 7 — relationships", () => {
  const relational = (mayaHolds: boolean, jayHolds: boolean, type = "sibling") =>
    state({
      characters: [
        { id: "maya", name: "Maya", relationships: mayaHolds ? ["rel-1"] : [] },
        { id: "jay", name: "Jay", relationships: jayHolds ? ["rel-1"] : [] },
      ],
      relationships: [{ id: "rel-1", character_a: "maya", character_b: "jay", type }],
    });

  it("11. a symmetric relationship produces no finding", () => {
    expect(has(check(relational(true, true)), "CONTINUITY_RELATIONSHIP_ASYMMETRY")).toBe(false);
  });

  it("12. an asymmetric relationship produces a finding", () => {
    expect(has(check(relational(true, false)), "CONTINUITY_RELATIONSHIP_ASYMMETRY")).toBe(true);
  });

  it("a one-directional type is not required to be symmetric", () => {
    expect(has(check(relational(true, false, "mentor")), "CONTINUITY_RELATIONSHIP_ASYMMETRY")).toBe(
      false,
    );
  });
});

describe("rule 8 — payoffs", () => {
  it("13. a payoff with a setup produces no finding", () => {
    const s = state({
      payoffs: [{ id: "p1", requirement: "The turn lands", setups: ["The second reflection"] }],
    });
    expect(has(check(s), "CONTINUITY_PAYOFF_WITHOUT_SETUP")).toBe(false);
  });

  it("14. a payoff without a setup produces a finding", () => {
    const s = state({ payoffs: [{ id: "p1", requirement: "Reveal Maya's identity", setups: [] }] });
    expect(has(check(s), "CONTINUITY_PAYOFF_WITHOUT_SETUP")).toBe(true);
  });
});

describe("rule 9 — twist ordering", () => {
  const twisted = (revealScene: number, foreshadowScene: number) =>
    state({
      twist: { present: true, reveal_scene: revealScene, foreshadowing: ["A second reflection"] },
      scenes: [1, 2, 3].map((n) => ({
        id: `s${n}`,
        scene_number: n,
        title: `Scene ${n}`,
        truth: truth(
          n === foreshadowScene ? { foreshadowing: "A second reflection in the glass." } : {},
        ),
      })),
      timeline: [],
      generation: { scenes_total: 3, scenes_rendered: 0, based_on_version: null },
    });

  it("15. valid twist ordering produces no finding", () => {
    expect(has(check(twisted(3, 1)), "CONTINUITY_TWIST_BEFORE_FORESHADOWING")).toBe(false);
  });

  it("16. a twist before its foreshadowing produces a finding", () => {
    expect(has(check(twisted(1, 3)), "CONTINUITY_TWIST_BEFORE_FORESHADOWING")).toBe(true);
  });
});

describe("rule 10 — stale version", () => {
  it("17. a matching version produces no stale finding", () => {
    const s = state({
      generation: { scenes_total: 2, scenes_rendered: 2, based_on_version: "v1.abc" },
    });
    expect(has(check(s), "CONTINUITY_STALE_VERSION")).toBe(false);
  });

  it("18. an older version produces a stale finding", () => {
    const s = state({
      generation: { scenes_total: 2, scenes_rendered: 2, based_on_version: "v1.old" },
    });
    expect(has(check(s), "CONTINUITY_STALE_VERSION")).toBe(true);
  });
});

describe("rule 11 — Scene Truth completeness", () => {
  it("19. complete Scene Truth produces no finding", () => {
    expect(has(check(state()), "CONTINUITY_SCENE_TRUTH_INCOMPLETE")).toBe(false);
  });

  it("20. incomplete Scene Truth produces a finding", () => {
    const s = state({
      scenes: [
        {
          id: "s1",
          scene_number: 1,
          title: "The message",
          truth: truth({ what_must_survive: "" }),
        },
      ],
      timeline: [],
      generation: { scenes_total: 1, scenes_rendered: 0, based_on_version: null },
    });
    const findings = check(s);
    expect(has(findings, "CONTINUITY_SCENE_TRUTH_INCOMPLETE")).toBe(true);
    expect(findings[0]?.evidence.some((e) => e.field === "what_must_survive")).toBe(true);
  });
});

describe("engine guarantees", () => {
  it("22. the engine never mutates the input state", () => {
    const s = state({
      payoffs: [{ id: "p1", requirement: "Reveal", setups: [] }],
      generation: { scenes_total: 2, scenes_rendered: 2, based_on_version: "v1.old" },
    });
    const snapshot = JSON.stringify(s);
    const deepFreeze = (value: unknown) => {
      if (value && typeof value === "object") {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
      }
    };
    deepFreeze(s);
    expect(() => check(s)).not.toThrow();
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it("23. the engine contains no AI, network or credit calls", () => {
    const sources = ["src/lib/continuity-engine.ts", "src/lib/continuity-rules.ts"].map((path) =>
      readFileSync(new URL(`../${path}`, import.meta.url), "utf8"),
    );
    for (const source of sources) {
      for (const forbidden of [
        "fetch(",
        "openai",
        "anthropic",
        "gemini",
        "lovable/ai",
        "embedding",
        "supabase",
        "credit_cost",
        "Date.now",
        "Math.random",
      ]) {
        expect(source.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }
    }
  });

  it("24 & 25. findings carry structured evidence and suggested actions", () => {
    const s = state({ payoffs: [{ id: "p1", requirement: "Reveal", setups: [] }] });
    const findings = check(s);
    expect(findings.length).toBeGreaterThan(0);
    for (const item of findings) {
      expect(item.evidence.length).toBeGreaterThan(0);
      expect(item.suggestedActions.length).toBeGreaterThan(0);
      expect(item.id.startsWith(item.ruleId)).toBe(true);
    }
  });

  it("is deterministic and stably sorted", () => {
    const s = state({
      characters: [
        { id: "maya", name: "Maya" },
        { id: "maya-2", name: "Maya" },
      ],
      payoffs: [{ id: "p1", requirement: "Reveal", setups: [] }],
      generation: { scenes_total: 2, scenes_rendered: 2, based_on_version: "v1.old" },
    });
    const a = check(s);
    const b = check(s);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const ranks = a.map((f) => ["critical", "high", "medium", "low", "info"].indexOf(f.severity));
    expect(ranks).toEqual(ranks.slice().sort((x, y) => x - y));
  });

  it("the catalogue covers every declared rule id", () => {
    expect(Object.keys(CONTINUITY_RULES).sort()).toEqual([...RULE_IDS].sort());
    for (const id of RULE_IDS) expect(CONTINUITY_RULES[id].suggestedActions.length).toBeGreaterThan(0);
  });

  it("the report is advisory and version-stamped", () => {
    const report = checkReport(state());
    expect(report.advisory).toBe(true);
    expect(report.version).toBe("v1.abc");
    expect(report.counts.critical).toBe(0);
  });
});
