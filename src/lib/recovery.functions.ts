import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { callGateway } from "@/lib/director.functions";
import { assertFilmOwner, getFilm, renderSceneCore, type FilmView } from "@/lib/film.functions";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  candidateSchema,
  diagnoseFailure,
  invariantsOf,
  patchFromCandidate,
  recoveryNote,
  selectRecovery,
  type RecoveryCandidate,
  type RecoveryRecord,
} from "@/lib/generation-recovery";
import { emptySceneTruth, mergeSceneTruth, type SceneTruth } from "@/lib/scene-truth";

/**
 * GENERATION RECOVERY DIRECTOR — the server side.
 *
 * When a scene's generation fails, the director reads the Scene Truth Contract,
 * diagnoses the failure, invents up to three genuinely different executions,
 * grades them against the invariants and renders the strongest valid one once.
 *
 * Boundaries kept deliberately narrow: exactly one recovery attempt per scene,
 * the existing render pipeline does the generating, and a recovery that would
 * change the story itself waits for the creator instead of proceeding.
 */

const RECOVERY_SYSTEM = `You are a film director whose shot was refused or failed at the video generation stage. Your job is to find another way to FILM the same scene — never another story.

Absolute rules:
- Adapt the filmmaking, not the meaning. The emotional core, what must survive, the reveal, the central relationship and the planted clues stay intact.
- If the generation model declined to depict something, that depiction is off the table. Find a genuinely different, allowed cinematic representation of the same discovery. NEVER attempt to disguise, encode, split up, rename or otherwise slip the refused depiction past a safety system. Anything that reads as working around a filter is a failed answer.
- Never reduce the scene to a bland fragment ("a detective looks at evidence"). The emotional progression must still land inside one continuous 5-second vertical shot.
- Do not ask the creator anything. Use only the information given.
- Everything you write is sent to the video model as the shot description, so rewrite the wording too: "characters" must describe only what is actually in frame in your version. If the refused depiction was a body, an injury or a death, no part of your text may describe one.

Produce exactly three meaningfully different candidates:
A "direct" — keep the original as closely as possible, with the problematic depiction removed.
B "restaged" — change staging, camera, framing, environment or physical representation.
C "metaphorical" — communicate the same discovery indirectly: reflection, photograph, object, shadow, reaction, environmental clue, sound, match cut, symbolic detail.

For each candidate, mark honestly in "preserves" what genuinely still survives, and set "materially_changes_story" true only when the candidate changes the story itself rather than how it is filmed. Score cinematic_quality and generation_feasibility 0-10.

Reply with JSON only:
{"candidates":[{"kind":"direct","chosen_execution":"","action":"","characters":"","setting":"","camera":"","framing":"","movement":"","visual_direction":"","lighting":"","sound":"","reveal":"","continuity":"","preserves":{"emotional_core":true,"what_must_survive":true,"reveal":true,"character_meaning":true,"visual_clue":true,"ending_implication":true,"foreshadowing":true},"materially_changes_story":false,"cinematic_quality":0,"generation_feasibility":0,"why":""}]}`;

const replySchema = z.object({ candidates: z.array(candidateSchema).min(1).max(3) });

function brief(
  truth: SceneTruth,
  film: { title: string; logline: string; setting: string },
  scene: { scene_number: number; title: string; idea: string },
  failure: { category: string; explained: string; provider_message: string },
) {
  const line = (label: string, value: string) => (value.trim() ? `${label}: ${value}` : "");
  return [
    `Film: ${film.title}. ${film.logline}`,
    line("Film setting", film.setting),
    `Scene ${scene.scene_number} — ${scene.title}`,
    line("Scene as written", scene.idea),
    "",
    "APPROVED SCENE TRUTH (authoritative):",
    line("Emotional core", truth.emotional_core),
    line("What must survive", truth.what_must_survive),
    line("Chosen execution that failed", truth.chosen_execution),
    line("Characters", truth.characters),
    line("Action", truth.action),
    line("Setting", truth.setting),
    line("Time / period", truth.time_period),
    line("Camera", truth.camera),
    line("Framing", truth.framing),
    line("Movement", truth.movement),
    line("Visual direction", truth.visual_direction),
    line("Lighting", truth.lighting),
    line("Wardrobe", truth.wardrobe),
    line("Sound", truth.sound),
    line("Reveal", truth.reveal),
    line("Twist", truth.twist),
    line("Foreshadowing already planted", truth.foreshadowing),
    line("Continuity", truth.continuity),
    truth.user_decisions.length
      ? `Creator's decisions (never overrule these): ${truth.user_decisions.join("; ")}`
      : "",
    "",
    "GENERATION RESULT: failed.",
    `Failure category: ${failure.category} — ${failure.explained}`,
    failure.provider_message ? `Provider said: ${failure.provider_message}` : "",
    "",
    "Give three ways to film this scene that keep every invariant above.",
  ]
    .filter(Boolean)
    .join("\n");
}

const input = z.object({
  film_id: z.string().uuid(),
  scene_id: z.string().uuid(),
  session_id: z.string().uuid(),
  /** Diagnose, plan and grade without rendering — used by internal tests. */
  simulate: z.boolean().optional().default(false),
  /** Provider message to diagnose when simulating a failure. */
  failure_message: z.string().max(500).optional(),
});

export type RecoveryResult = {
  outcome: RecoveryRecord["outcome"] | "simulated";
  failure_category: RecoveryRecord["failure_category"];
  /** One plain line for the creator. */
  message: string;
  /** Internal QA metric, not a customer-facing rating. */
  fidelity: number;
  record: RecoveryRecord;
  film: FilmView | null;
};

/**
 * Ask the director for up to three alternatives and grade them against the
 * scene's invariants. No database write and no generation happens here, so the
 * whole decision can be tested without spending a generation credit.
 */
export async function planRecovery(
  truth: SceneTruth,
  film: { title: string; logline: string; setting: string },
  scene: { scene_number: number; title: string; idea: string },
  failure: ReturnType<typeof diagnoseFailure>,
) {
  const inv = invariantsOf(truth);
  let candidates: RecoveryCandidate[] = [];
  try {
    const reply = await callGateway<unknown>(brief(truth, film, scene, failure), RECOVERY_SYSTEM);
    candidates = replySchema.parse(reply).candidates;
  } catch (error) {
    console.error("recovery planning failed", error);
    candidates = [];
  }
  return selectRecovery(candidates, inv);
}

/** Find another way to film a scene the video model refused, and render it once. */
export async function recoverSceneCore(
  data: z.infer<typeof input>,
  userId: string,
): Promise<RecoveryResult> {
  {
    await assertFilmOwner(data.film_id, data.session_id, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const film = await getFilm({ data: { film_id: data.film_id, session_id: data.session_id } });
    const scene = film.scenes.find((s) => s.id === data.scene_id);
    if (!scene) throw new Error("That scene could not be found.");

    const { data: row } = await supabaseAdmin
      .from("story_scenes")
      .select("recovery")
      .eq("id", scene.id)
      .maybeSingle();

    /** ONE RETRY ONLY — never a generation loop, never unbounded credits. */
    if (!data.simulate && row?.recovery) {
      throw new Error(
        "The Director already tried a second way to film this scene. Edit the scene yourself to take it further.",
      );
    }

    if (!data.simulate && scene.status !== "failed") {
      throw new Error("This scene has not failed, so there is nothing to recover.");
    }

    /**
     * Whether the failed attempt cost anything is read from the app's own
     * record, never assumed: an unknown answer stays unknown.
     */
    let billable: boolean | null = null;
    if (scene.generation_id) {
      const { data: gen } = await supabaseAdmin
        .from("generations")
        .select("coins_spent")
        .eq("id", scene.generation_id)
        .maybeSingle();
      const spent = gen?.coins_spent as number | null | undefined;
      billable = typeof spent === "number" ? spent > 0 : null;
    }

    const truth =
      scene.truth ??
      mergeSceneTruth(emptySceneTruth(), { action: scene.idea, setting: film.setting });
    const failure = diagnoseFailure(data.failure_message ?? scene.error_message);
    const { verdicts, selected } = await planRecovery(truth, film, scene, failure);

    const record: RecoveryRecord = {
      attempted_at: new Date().toISOString(),
      failure_category: failure.category,
      provider_message: failure.provider_message,
      original_execution: truth.chosen_execution,
      original_action: truth.action,
      emotional_core: truth.emotional_core,
      what_must_survive: truth.what_must_survive,
      candidates: verdicts.map((v) => ({
        kind: v.candidate.kind,
        chosen_execution: v.candidate.chosen_execution,
        valid: v.valid,
        fidelity: v.fidelity,
        rejections: v.rejections,
      })),
      selected_kind: selected?.candidate.kind ?? null,
      selected_execution: selected?.candidate.chosen_execution ?? "",
      why_selected: selected?.candidate.why ?? "",
      fidelity: selected?.fidelity ?? 0,
      fidelity_parts: selected?.fidelity_parts ?? {},
      emotional_core_survived: selected?.candidate.preserves.emotional_core ?? false,
      what_must_survive_survived: selected?.candidate.preserves.what_must_survive ?? false,
      materially_changes_story: selected?.candidate.materially_changes_story ?? false,
      outcome: !selected
        ? "no_valid_recovery"
        : selected.candidate.materially_changes_story
          ? "awaiting_approval"
          : "generated",
      original_attempt_billable: billable,
      generation_id: null,
    };

    /** Simulation stops here: nothing is written and no credit can be spent. */
    if (data.simulate) {
      return {
        outcome: "simulated",
        failure_category: record.failure_category,
        message: recoveryNote(record),
        fidelity: record.fidelity,
        record,
        film: null,
      };
    }

    if (!selected) {
      await supabaseAdmin.from("story_scenes").update({ recovery: record }).eq("id", scene.id);
      return {
        outcome: "no_valid_recovery",
        failure_category: record.failure_category,
        message: recoveryNote(record),
        fidelity: 0,
        record,
        film: await getFilm({ data: { film_id: data.film_id, session_id: data.session_id } }),
      };
    }

    /**
     * A purely technical change proceeds through the normal generation flow. A
     * recovery that would change the story itself is held for the creator, and
     * Scene Truth is left untouched until they approve it.
     */
    if (record.materially_changes_story) {
      await supabaseAdmin
        .from("story_scenes")
        .update({ recovery: { ...record, pending: patchFromCandidate(selected.candidate) } })
        .eq("id", scene.id);
      return {
        outcome: "awaiting_approval",
        failure_category: record.failure_category,
        message: `${recoveryNote(record)} This changes the story itself, so it is yours to approve.`,
        fidelity: record.fidelity,
        record,
        film: await getFilm({ data: { film_id: data.film_id, session_id: data.session_id } }),
      };
    }

    const next = mergeSceneTruth(truth, patchFromCandidate(selected.candidate));
    await supabaseAdmin
      .from("story_scenes")
      .update({ truth: next, idea: next.action || scene.idea, recovery: record })
      .eq("id", scene.id);

    await noteEvolution(film.director_session_id, record);

    const rendered = await renderSceneCore({
      user_id: userId,
      ...{
        film_id: data.film_id,
        scene_id: data.scene_id,
        session_id: data.session_id,
        engine: "lovable",
        audio: false,
      },
    });

    record.generation_id = rendered.generation_id;
    await supabaseAdmin.from("story_scenes").update({ recovery: record }).eq("id", scene.id);

    return {
      outcome: "generated",
      failure_category: record.failure_category,
      message: recoveryNote(record),
      fidelity: record.fidelity,
      record,
      film: rendered.film,
    };
  }
}

export const recoverScene = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(({ data, context }) => recoverSceneCore(data, context.userId));

/** Approve a recovery that changes the story, then render it once. */
export const approveRecovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    input.omit({ simulate: true, failure_message: true }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ film: FilmView; generation_id: string }> => {
    await assertFilmOwner(data.film_id, data.session_id, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const film = await getFilm({ data: { film_id: data.film_id, session_id: data.session_id } });
    const scene = film.scenes.find((s) => s.id === data.scene_id);
    if (!scene) throw new Error("That scene could not be found.");

    const { data: row } = await supabaseAdmin
      .from("story_scenes")
      .select("recovery")
      .eq("id", scene.id)
      .maybeSingle();

    const stored = row?.recovery as (RecoveryRecord & { pending?: unknown }) | null;
    if (!stored?.pending) throw new Error("There is no recovery waiting for your approval.");

    const truth = scene.truth ?? emptySceneTruth();
    const next = mergeSceneTruth(truth, stored.pending as ReturnType<typeof patchFromCandidate>);
    const record: RecoveryRecord = { ...stored, outcome: "generated" };

    await supabaseAdmin
      .from("story_scenes")
      .update({ truth: next, idea: next.action || scene.idea, recovery: record })
      .eq("id", scene.id);

    await noteEvolution(film.director_session_id, record);

    const rendered = await renderSceneCore({
      user_id: userId,
      ...{
        film_id: data.film_id,
        scene_id: data.scene_id,
        session_id: data.session_id,
        engine: "lovable",
        audio: false,
      },
    });

    record.generation_id = rendered.generation_id;
    await supabaseAdmin.from("story_scenes").update({ recovery: record }).eq("id", scene.id);
    return { film: rendered.film, generation_id: rendered.generation_id };
  });

/**
 * Creative Evolution already records how a film changed; a generation
 * constraint is one more honest discovery, written into the existing report
 * rather than a new system of its own.
 */
async function noteEvolution(sessionId: string | null, record: RecoveryRecord) {
  if (!sessionId || !record.selected_execution) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row } = await supabaseAdmin
    .from("director_sessions")
    .select("evolution")
    .eq("id", sessionId)
    .maybeSingle();

  const evolution = (row?.evolution as { discoveries?: unknown } | null) ?? null;
  if (!evolution) return;

  const discoveries = Array.isArray(evolution.discoveries)
    ? (evolution.discoveries as unknown[]).filter((d): d is string => typeof d === "string")
    : [];

  const entry = `Generation constraint discovered — ${record.provider_message || "the video model rejected the planned shot"}. The Director adapted the execution while preserving the emotional core: ${record.selected_execution}`;
  if (discoveries.some((d) => d.startsWith("Generation constraint discovered"))) return;

  await supabaseAdmin
    .from("director_sessions")
    .update({ evolution: { ...evolution, discoveries: [...discoveries, entry].slice(0, 12) } })
    .eq("id", sessionId);
}
