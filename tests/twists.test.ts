import { describe, expect, it } from "vitest";

import { ALL_TWISTS, TWIST_COUNT, TWIST_LIBRARY, searchTwists, wantsNoTwist } from "@/lib/twists";

describe("plot twist library", () => {
  it("keeps every family registered and every pattern uniquely identified", () => {
    expect(Object.keys(TWIST_LIBRARY)).toHaveLength(10);
    expect(TWIST_COUNT).toBe(ALL_TWISTS.length);
    expect(TWIST_COUNT).toBeGreaterThanOrEqual(300);
    expect(new Set(ALL_TWISTS.map((p) => p.id)).size).toBe(ALL_TWISTS.length);
  });

  it("scores every pattern inside the declared ranges", () => {
    for (const p of ALL_TWISTS) {
      for (const value of [
        p.visual_potential,
        p.foreshadowing_potential,
        p.complexity,
        p.cliche_risk,
        p.originality,
        p.generation_feasibility,
      ]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(10);
      }
      expect(p.tags.length).toBeGreaterThan(0);
    }
  });

  it("returns a spread shortlist, never the whole library", () => {
    const shortlist = searchTwists({
      idea: "A detective investigates a corpse that turns out to be his own future self.",
    });
    expect(shortlist.length).toBeGreaterThan(0);
    expect(shortlist.length).toBeLessThanOrEqual(8);
    const perFamily = new Map<string, number>();
    for (const p of shortlist) perFamily.set(p.family, (perFamily.get(p.family) ?? 0) + 1);
    for (const count of perFamily.values()) expect(count).toBeLessThanOrEqual(2);
    const relevance = shortlist.map((p) => p.relevance);
    expect([...relevance].sort((a, b) => b - a)).toEqual(relevance);
  });

  it("returns nothing when there is no story text", () => {
    expect(searchTwists({ idea: "   " })).toEqual([]);
  });

  it("respects an explicit refusal of a twist", () => {
    expect(wantsNoTwist("Simple story, no twist please")).toBe(true);
    expect(wantsNoTwist("Jag vill inget twist")).toBe(true);
    expect(wantsNoTwist("A woman meets her younger self")).toBe(false);
  });
});
