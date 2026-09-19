import { z } from "zod";

import { sortFindings } from "@/lib/continuity-engine";
import type { Finding } from "@/lib/continuity-rules";

/**
 * DETERMINISTIC RENDER GATE — Phase 2.2.
 *
 * Finding[] → evaluateRenderGate() → ALLOW / BLOCK
 *
 * The gate decides whether one scene is eligible to proceed to video
 * generation, based purely on the Continuity Engine's findings. It is pure,
 * synchronous and side-effect free: no AI, no provider, no database, no
 * credits, no UI, no persistence. It never repairs, resolves, ignores or
 * rewrites anything — it only returns a result.
 *
 * SCENE RELEVANCE: a finding applies to a scene only when the finding's own
 * evidence carries that scene id. No relationship between findings and scenes
 * is invented. Limitation: findings whose evidence carries only a scene
 * *number* (not an id) cannot be matched here and are treated as not applying
 * to the requested scene — matching by number would require guessing which
 * id a number belongs to.
 *
 * BLOCKING POLICY (severity-based): critical and high findings block; medium
 * and low become warnings; anything else is ignored for gating. The Finding
 * contract currently has NO resolution/status field, so every finding is
 * treated as open. Resolution-aware gating is deferred to a later phase.
 */

export type RenderGateResult = {
  allowed: boolean;
  blockingFindings: Finding[];
  warnings: Finding[];
  reason: string;
};

/** Severities that block rendering. */
const BLOCKING = new Set<Finding["severity"]>(["critical", "high"]);
/** Severities that surface as warnings. */
const WARNING = new Set<Finding["severity"]>(["medium", "low"]);

export const RENDER_GATE_ALLOWED_REASON = "Scene is eligible for rendering.";
export const RENDER_GATE_BLOCKED_REASON =
  "Scene has unresolved high-severity continuity findings.";

const sceneIdSchema = z.string().trim().min(1);

/** True when the finding's own evidence places it on this scene. */
function appliesToScene(finding: Finding, sceneId: string): boolean {
  return finding.evidence.some((entry) => entry.sceneId === sceneId);
}

/**
 * Evaluate render eligibility for one scene. The input findings are never
 * mutated; ordering is the engine's deterministic finding ordering.
 */
export function evaluateRenderGate(
  findings: Finding[],
  sceneId: string,
): RenderGateResult {
  const scene = sceneIdSchema.parse(sceneId);
  const relevant = (findings ?? []).filter((item) => appliesToScene(item, scene));

  const blockingFindings = sortFindings(relevant.filter((f) => BLOCKING.has(f.severity)));
  const warnings = sortFindings(relevant.filter((f) => WARNING.has(f.severity)));

  const allowed = blockingFindings.length === 0;
  return {
    allowed,
    blockingFindings,
    warnings,
    reason: allowed ? RENDER_GATE_ALLOWED_REASON : RENDER_GATE_BLOCKED_REASON,
  };
}
