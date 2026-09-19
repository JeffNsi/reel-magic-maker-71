import { describe, expect, it } from "vitest";

import { check, checkReport } from "@/lib/continuity-engine";
import { RULE_IDS } from "@/lib/continuity-rules";
import { emptyStoryState, storyStateSchema, type StoryState } from "@/lib/story-state";

/**
 * PHASE 2.2 — facts, threads and payoff rules.
 *
 * Every rule must be deterministic, advisory and false-positive safe: when the
 * information a rule needs is absent, it reports nothing.
 */

const base = (): StoryState => emptyStoryState();

const withState = (patch: Partial<StoryState>): StoryState =>
  storyStateSchema.parse({ ...base(), ...patch });

const fact = (
  id: string,
  category: string,
  value: string,
  status: "true" | "changed" | "retracted" = "true",
) => ({ id, statement: value, category, source: "user_decision" as const, status });

const byRule = (state: StoryState, rule: string) => check(state).filter((f) => f.ruleId === rule);

describe("phase 2.2 — catalogue", () => {
  it("catalogue exposes the five new rules", () => {
    for (const id of [
      "CONTINUITY_FACT_CONTRADICTION",
      "CONTINUITY_RETRACTED_FACT_IN_USE",
      "CONTINUITY_DUPLICATE_THREAD",
      "CONTINUITY_PAYOFF_STATUS_INCONSISTENT",
      "CONTINUITY_THREAD_RESOLVED_WITHOUT_SCENE",
    ]) {
      expect(RULE_IDS).toContain(id);
    }
  });
});

describe("CONTINUITY_FACT_CONTRADICTION", () => {
  it("flags two active facts with the same category and different values", () => {
    const state = withState({
      facts: [
        fact("f1", "detective", "The detective is alive"),
        fact("f2", "detective", "The detective is dead"),
      ],
    });
    const found = byRule(state, "CONTINUITY_FACT_CONTRADICTION");
    expect(found).toHaveLength(1);
    expect(found[0]!.evidence).toHaveLength(2);
  });

  it("ignores facts that agree", () => {
    const state = withState({
      facts: [fact("f1", "detective", "alive"), fact("f2", "detective", "alive")],
    });
    expect(byRule(state, "CONTINUITY_FACT_CONTRADICTION")).toHaveLength(0);
  });

  it("ignores different categories", () => {
    const state = withState({
      facts: [fact("f1", "detective", "alive"), fact("f2", "tide", "rising")],
    });
    expect(byRule(state, "CONTINUITY_FACT_CONTRADICTION")).toHaveLength(0);
  });

  it("treats changed/retracted facts as history, not conflict", () => {
    const state = withState({
      facts: [fact("f1", "detective", "alive"), fact("f2", "detective", "dead", "changed")],
    });
    expect(byRule(state, "CONTINUITY_FACT_CONTRADICTION")).toHaveLength(0);
  });

  it("skips uncategorised facts entirely", () => {
    const state = withState({ facts: [fact("f1", "", "x"), fact("f2", "", "y")] });
    expect(byRule(state, "CONTINUITY_FACT_CONTRADICTION")).toHaveLength(0);
  });
});

describe("CONTINUITY_RETRACTED_FACT_IN_USE", () => {
  const staleFacts = [fact("f1", "detective", "alive", "retracted")];

  it("flags a knowledge event leaning on a retracted fact", () => {
    const state = withState({
      facts: staleFacts,
      knowledge_events: [
        {
          id: "k1",
          holder: "character",
          character_id: null,
          subject: "detective",
          fact_id: "f1",
          state: "known",
        },
      ],
    });
    expect(byRule(state, "CONTINUITY_RETRACTED_FACT_IN_USE")).toHaveLength(1);
  });

  it("flags a thread leaning on a changed fact", () => {
    const state = withState({
      facts: [fact("f1", "tide", "rising", "changed")],
      open_threads: [{ id: "t1", question: "Why?", facts: ["f1"] }],
    });
    expect(byRule(state, "CONTINUITY_RETRACTED_FACT_IN_USE")).toHaveLength(1);
  });

  it("ignores references to facts that are still true", () => {
    const state = withState({
      facts: [fact("f1", "tide", "rising")],
      open_threads: [{ id: "t1", question: "Why?", facts: ["f1"] }],
    });
    expect(byRule(state, "CONTINUITY_RETRACTED_FACT_IN_USE")).toHaveLength(0);
  });

  it("ignores absent fact references", () => {
    const state = withState({
      knowledge_events: [
        {
          id: "k1",
          holder: "reader",
          character_id: null,
          subject: "mood",
          fact_id: null,
          state: "revealed",
        },
      ],
    });
    expect(byRule(state, "CONTINUITY_RETRACTED_FACT_IN_USE")).toHaveLength(0);
  });
});

describe("CONTINUITY_DUPLICATE_THREAD", () => {
  it("flags two threads asking the same question", () => {
    const state = withState({
      open_threads: [
        { id: "t1", question: "Who took the boat?" },
        { id: "t2", question: "who took the boat" },
      ],
    });
    expect(byRule(state, "CONTINUITY_DUPLICATE_THREAD")).toHaveLength(1);
  });

  it("ignores distinct questions", () => {
    const state = withState({
      open_threads: [
        { id: "t1", question: "Who took the boat?" },
        { id: "t2", question: "Where is the boat?" },
      ],
    });
    expect(byRule(state, "CONTINUITY_DUPLICATE_THREAD")).toHaveLength(0);
  });
});

describe("CONTINUITY_PAYOFF_STATUS_INCONSISTENT", () => {
  it("flags a payoff marked paid_off with no scene", () => {
    const state = withState({
      payoffs: [{ id: "p1", requirement: "The turn lands", status: "paid_off" }],
    });
    expect(byRule(state, "CONTINUITY_PAYOFF_STATUS_INCONSISTENT")).toHaveLength(1);
  });

  it("accepts a paid_off payoff with a scene", () => {
    const state = withState({
      scenes: [{ id: "s1", scene_number: 3, title: "Reveal" }],
      payoffs: [{ id: "p1", requirement: "The turn lands", status: "paid_off", payoff_scene: 3 }],
    });
    expect(byRule(state, "CONTINUITY_PAYOFF_STATUS_INCONSISTENT")).toHaveLength(0);
  });

  it("ignores payoffs that are only planned", () => {
    const state = withState({
      payoffs: [{ id: "p1", requirement: "Later", status: "planned" }],
    });
    expect(byRule(state, "CONTINUITY_PAYOFF_STATUS_INCONSISTENT")).toHaveLength(0);
  });
});

describe("CONTINUITY_THREAD_RESOLVED_WITHOUT_SCENE", () => {
  it("flags a resolved thread no scene claims", () => {
    const state = withState({
      scenes: [{ id: "s1", scene_number: 1, title: "Opening" }],
      open_threads: [{ id: "t1", question: "Why?", status: "resolved" }],
    });
    expect(byRule(state, "CONTINUITY_THREAD_RESOLVED_WITHOUT_SCENE")).toHaveLength(1);
  });

  it("accepts a resolved thread a scene claims", () => {
    const state = withState({
      scenes: [{ id: "s1", scene_number: 4, title: "Answer", threads_resolved: ["t1"] }],
      open_threads: [{ id: "t1", question: "Why?", status: "resolved" }],
    });
    expect(byRule(state, "CONTINUITY_THREAD_RESOLVED_WITHOUT_SCENE")).toHaveLength(0);
  });

  it("ignores open threads — an open thread is not a contradiction", () => {
    const state = withState({
      open_threads: [{ id: "t1", question: "Why?", status: "open" }],
    });
    expect(byRule(state, "CONTINUITY_THREAD_RESOLVED_WITHOUT_SCENE")).toHaveLength(0);
  });
});

describe("phase 2.2 — engine discipline", () => {
  it("duplicate fact ids are caught by the entity rule", () => {
    const state = withState({
      facts: [fact("f1", "a", "one"), fact("f1", "b", "two")],
    });
    expect(
      check(state).some((f) => f.ruleId === "CONTINUITY_DUPLICATE_ENTITY" && f.id.includes("fact")),
    ).toBe(true);
  });

  it("never mutates its input", () => {
    const state = withState({
      facts: [fact("f1", "detective", "alive"), fact("f2", "detective", "dead")],
      open_threads: [{ id: "t1", question: "Why?", status: "resolved" }],
    });
    const snapshot = JSON.stringify(state);
    check(state);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it("produces identical findings across runs", () => {
    const state = withState({
      facts: [fact("f1", "detective", "alive"), fact("f2", "detective", "dead")],
      open_threads: [
        { id: "t1", question: "Who?" },
        { id: "t2", question: "who" },
      ],
    });
    expect(check(state)).toEqual(check(state));
  });

  it("empty state produces no findings", () => {
    const report = checkReport(base());
    expect(report.findings).toHaveLength(0);
    expect(report.advisory).toBe(true);
  });
});
