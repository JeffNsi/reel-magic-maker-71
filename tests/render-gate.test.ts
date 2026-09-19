import { describe, expect, it } from "vitest";

import type { Finding, RuleId, Severity } from "@/lib/continuity-rules";
import {
  evaluateRenderGate,
  RENDER_GATE_ALLOWED_REASON,
  RENDER_GATE_BLOCKED_REASON,
} from "@/lib/render-gate";

/**
 * PHASE 2.2 — DETERMINISTIC RENDER GATE.
 *
 * The gate consumes Finding[] and decides ALLOW / BLOCK for one scene. Pure,
 * deterministic, no AI, no credits, no mutation.
 */

const SCENE = "scene-abc";

let counter = 0;
function finding(
  severity: Severity,
  sceneId: string | null = SCENE,
  ruleId: RuleId = "CONTINUITY_SCENE_TRUTH_INCOMPLETE",
): Finding {
  counter += 1;
  return {
    id: `${ruleId}:t${counter}`,
    ruleId,
    severity,
    category: "scene_truth",
    title: "Test finding",
    message: `finding ${counter}`,
    evidence:
      sceneId === null
        ? [{ sceneNumber: 1 }]
        : [{ sceneId, sceneNumber: 1 }],
    suggestedActions: [],
  };
}

describe("evaluateRenderGate", () => {
  it("allows when there are no findings", () => {
    const result = evaluateRenderGate([], SCENE);
    expect(result).toEqual({
      allowed: true,
      blockingFindings: [],
      warnings: [],
      reason: RENDER_GATE_ALLOWED_REASON,
    });
  });

  it("allows with a LOW finding, surfaced as a warning", () => {
    const low = finding("low");
    const result = evaluateRenderGate([low], SCENE);
    expect(result.allowed).toBe(true);
    expect(result.blockingFindings).toEqual([]);
    expect(result.warnings).toEqual([low]);
    expect(result.reason).toBe(RENDER_GATE_ALLOWED_REASON);
  });

  it("allows with a MEDIUM finding, surfaced as a warning", () => {
    const medium = finding("medium");
    const result = evaluateRenderGate([medium], SCENE);
    expect(result.allowed).toBe(true);
    expect(result.warnings).toEqual([medium]);
  });

  it("blocks on a HIGH finding", () => {
    const high = finding("high");
    const result = evaluateRenderGate([high], SCENE);
    expect(result.allowed).toBe(false);
    expect(result.blockingFindings).toEqual([high]);
    expect(result.reason).toBe(RENDER_GATE_BLOCKED_REASON);
  });

  it("blocks on a CRITICAL finding", () => {
    const critical = finding("critical", SCENE, "CONTINUITY_TWIST_BEFORE_FORESHADOWING");
    const result = evaluateRenderGate([critical], SCENE);
    expect(result.allowed).toBe(false);
    expect(result.blockingFindings).toEqual([critical]);
  });

  it("ignores findings belonging to another scene", () => {
    const other = finding("critical", "scene-elsewhere");
    const result = evaluateRenderGate([other], SCENE);
    expect(result.allowed).toBe(true);
    expect(result.blockingFindings).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("cannot match findings whose evidence only carries a scene number", () => {
    // Documented limitation: number-only evidence is not matched by id.
    const numberOnly = finding("high", null);
    const result = evaluateRenderGate([numberOnly], SCENE);
    expect(result.allowed).toBe(true);
    expect(result.blockingFindings).toEqual([]);
  });

  it("returns all blocking findings when several apply", () => {
    const a = finding("high");
    const b = finding("critical", SCENE, "CONTINUITY_TWIST_BEFORE_FORESHADOWING");
    const c = finding("high", "scene-elsewhere"); // not relevant
    const result = evaluateRenderGate([a, b, c], SCENE);
    expect(result.allowed).toBe(false);
    expect(result.blockingFindings).toHaveLength(2);
    expect(result.blockingFindings).toContain(a);
    expect(result.blockingFindings).toContain(b);
  });

  it("blocks on mixed warnings and blocking findings, keeping both lists", () => {
    const warn = finding("low");
    const block = finding("high");
    const result = evaluateRenderGate([warn, block], SCENE);
    expect(result.allowed).toBe(false);
    expect(result.warnings).toEqual([warn]);
    expect(result.blockingFindings).toEqual([block]);
  });

  it("orders output deterministically (severity, then rule, then id)", () => {
    const z = { ...finding("high"), id: "CONTINUITY_INVALID_REFERENCE:z" };
    const a = { ...finding("high", SCENE, "CONTINUITY_INVALID_REFERENCE"), id: "CONTINUITY_INVALID_REFERENCE:a" };
    const crit = finding("critical", SCENE, "CONTINUITY_TWIST_BEFORE_FORESHADOWING");
    const one = evaluateRenderGate([z, a, crit], SCENE);
    const two = evaluateRenderGate([crit, z, a], SCENE);
    expect(one).toEqual(two);
    expect(one.blockingFindings.map((f) => f.id)).toEqual([crit.id, a.id, z.id]);
  });

  it("never mutates the findings input", () => {
    const input = [finding("low"), finding("high")];
    const snapshot = JSON.stringify(input);
    evaluateRenderGate(input, SCENE);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("rejects an empty scene identifier", () => {
    expect(() => evaluateRenderGate([], "")).toThrow();
    expect(() => evaluateRenderGate([], "   ")).toThrow();
  });

  it("consumes the existing Finding contract unchanged", () => {
    const item: Finding = finding("info");
    const result = evaluateRenderGate([item], SCENE);
    // info severity is neither blocking nor warning — allowed, nothing surfaced
    expect(result.allowed).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});
