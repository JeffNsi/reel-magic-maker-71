import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { checkReport } from "@/lib/continuity-engine";
import { CONTINUITY_RULES, type Finding } from "@/lib/continuity-rules";
import { evaluateRenderGate } from "@/lib/render-gate";
import { normalizeStoryState } from "@/lib/story-state";
import type {
  Challenge,
  Evolution,
  FilmBible,
  FilmModel,
  Recommendation,
} from "@/lib/director.functions";

/**
 * CONTINUITY REPORT — wiring only.
 *
 * The deterministic pieces already exist and are reused untouched:
 * normalizeStoryState() builds the canonical state, checkReport() finds the
 * advisory findings, evaluateRenderGate() says what the gate *would* decide.
 *
 * This is advisory and display-only. It never blocks a render, never calls an
 * AI provider, never spends a credit and never writes anything. The raw
 * StoryState stays internal: only the flat shape below leaves the server, and
 * only on the owner's session-scoped film page — never on the public share
 * route.
 */

export type ContinuityFinding = {
  rule_id: string;
  severity: Finding["severity"];
  category: Finding["category"];
  title: string;
  message: string;
  suggested_actions: string[];
  /** The scene numbers this finding's own evidence points at. */
  scene_numbers: number[];
};

export type ContinuitySceneGate = {
  scene_id: string;
  scene_number: number;
  allowed: boolean;
  blocking_count: number;
  warning_count: number;
};

export type ContinuityReportView = {
  counts: Record<Finding["severity"], number>;
  findings: ContinuityFinding[];
  scenes: ContinuitySceneGate[];
  advisory: true;
};

const ref = z.object({
  film_id: z.string().uuid(),
  session_id: z.string().uuid(),
});

/** The advisory continuity report for one film, for its owner only. */
export const getContinuityReport = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ref.parse(data))
  .handler(async ({ data }): Promise<ContinuityReportView> => {
    const { loadFilm } = await import("@/lib/film.functions");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const film = await loadFilm(data.film_id, data.session_id);

    /**
     * The director session fills in the film model, bible, recommendation and
     * reality check. When there is none, the engine simply skips the rules
     * whose data is absent — a partial state is valid and must not throw.
     */
    let session: {
      film_model?: unknown;
      film_bible?: unknown;
      recommendation?: unknown;
      challenge?: unknown;
      evolution?: unknown;
    } | null = null;

    if (film.director_session_id) {
      const { data: row } = await supabaseAdmin
        .from("director_sessions")
        .select("film_model, film_bible, recommendation, challenge, evolution")
        .eq("id", film.director_session_id)
        .maybeSingle();
      session = row ?? null;
    }

    const state = normalizeStoryState({
      film,
      scenes: film.scenes,
      film_model: (session?.film_model ?? null) as FilmModel | null,
      film_bible: (session?.film_bible ?? null) as FilmBible | null,
      recommendation: (session?.recommendation ?? null) as Recommendation | null,
      challenge: (session?.challenge ?? null) as Challenge | null,
      evolution: (session?.evolution ?? null) as Evolution | null,
      /**
       * Nothing persists a story version today, so none is passed. The moment a
       * caller stores one, the stale-version rule starts reporting.
       */
      persisted_version: null,
    });


    const report = checkReport(state);

    const findings: ContinuityFinding[] = report.findings.map((finding) => ({
      rule_id: finding.ruleId,
      severity: finding.severity,
      category: finding.category,
      title: CONTINUITY_RULES[finding.ruleId]?.title ?? finding.title,
      message: finding.message,
      suggested_actions: CONTINUITY_RULES[finding.ruleId]?.suggestedActions ?? [],
      scene_numbers: Array.from(
        new Set(
          finding.evidence
            .map((entry) => entry.sceneNumber)
            .filter((value): value is number => typeof value === "number"),
        ),
      ).sort((a, b) => a - b),
    }));

    /** Evaluated for display only — the gate decides nothing here. */
    const scenes: ContinuitySceneGate[] = film.scenes.map((scene) => {
      const gate = evaluateRenderGate(report.findings, scene.id);
      return {
        scene_id: scene.id,
        scene_number: scene.scene_number,
        allowed: gate.allowed,
        blocking_count: gate.blockingFindings.length,
        warning_count: gate.warnings.length,
      };
    });

    return { counts: report.counts, findings, scenes, advisory: true };
  });
