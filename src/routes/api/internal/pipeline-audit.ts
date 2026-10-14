import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  answerDirector,
  challengeFilm,
  finishDirector,
  startDirector,
} from "@/lib/director.functions";
import { buildFilmCore, getFilm, renderSceneCore } from "@/lib/film.functions";
import { checkStatus } from "@/lib/storyreel.functions";
import {
  buildGenerationRequest,
  checkFidelity,
  emptySceneTruth,
  mergeSceneTruth,
  sceneTruthSchema,
} from "@/lib/scene-truth";

/**
 * INTERNAL TEST ROUTE — not part of the customer experience and not linked from
 * any page. It only inspects the existing pipeline (director → film bible →
 * scene truth → generation request → video); it changes no product behaviour.
 * Guarded by the LOVABLE_CRON_SECRET shared secret.
 */

const body = z.object({
  action: z.enum(["run", "render", "status", "recover-sim", "recover"]),
  idea: z.string().optional(),
  style: z.string().optional().default("cinematic"),
  answers: z.array(z.string()).optional().default([]),
  session_id: z.string().uuid(),
  film_id: z.string().uuid().optional(),
  scene_id: z.string().uuid().optional(),
  generation_id: z.string().uuid().optional(),
  failure_message: z.string().optional(),
  /** Scene Truth fields for a credit-free recovery simulation. */
  truth: z.record(z.string(), z.unknown()).optional(),
});

export const Route = createFileRoute("/api/internal/pipeline-audit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["LOVABLE_CRON_SECRET"];
        if (!secret || request.headers.get("x-audit-secret") !== secret) {
          return new Response("Not found", { status: 404 });
        }

        const input = body.parse(await request.json());
        const json = (value: unknown) =>
          new Response(JSON.stringify(value), {
            headers: { "Content-Type": "application/json" },
          });

        /** The stored owner of a film; audit renders act as that owner, never as a session. */
        const ownerOf = async (film_id: string) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("stories")
            .select("user_id")
            .eq("id", film_id)
            .maybeSingle();
          if (!data?.user_id) throw new Error("This film has no owner, so it cannot be rendered.");
          return data.user_id as string;
        };

        if (input.action === "status") {
          const state = await checkStatus({
            data: { generation_id: input.generation_id!, session_id: input.session_id },
          });
          return json(state);
        }

        /** Credit-free recovery simulation: no film, no scene row, no generation. */
        if (input.action === "recover-sim") {
          const { planRecovery } = await import("@/lib/recovery.functions");
          const { diagnoseFailure } = await import("@/lib/generation-recovery");
          const truth = mergeSceneTruth(
            emptySceneTruth(),
            sceneTruthSchema.partial().parse(input.truth ?? {}),
          );
          const failure = diagnoseFailure(input.failure_message ?? "");
          const plan = await planRecovery(
            truth,
            { title: "Simulation", logline: input.idea ?? "", setting: truth.setting },
            { scene_number: 1, title: "Simulated scene", idea: truth.action },
            failure,
          );
          return json({
            failure,
            selected: plan.selected
              ? {
                  kind: plan.selected.candidate.kind,
                  chosen_execution: plan.selected.candidate.chosen_execution,
                  reveal: plan.selected.candidate.reveal,
                  why: plan.selected.candidate.why,
                  fidelity: plan.selected.fidelity,
                  fidelity_parts: plan.selected.fidelity_parts,
                  materially_changes_story: plan.selected.candidate.materially_changes_story,
                }
              : null,
            candidates: plan.verdicts.map((v) => ({
              kind: v.candidate.kind,
              chosen_execution: v.candidate.chosen_execution,
              valid: v.valid,
              fidelity: v.fidelity,
              rejections: v.rejections,
            })),
          });
        }

        /** Real recovery on a real failed scene (one generation). */
        if (input.action === "recover") {
          const { recoverSceneCore } = await import("@/lib/recovery.functions");
          const out = await recoverSceneCore(
            {
              film_id: input.film_id!,
              scene_id: input.scene_id!,
              session_id: input.session_id,
              simulate: false,
              failure_message: input.failure_message,
            },
            await ownerOf(input.film_id!),
          );
          return json({
            outcome: out.outcome,
            failure_category: out.failure_category,
            fidelity: out.fidelity,
            record: out.record,
          });
        }

        if (input.action === "render") {
          const out = await renderSceneCore({
            film_id: input.film_id!,
            scene_id: input.scene_id!,
            session_id: input.session_id,
            engine: "lovable",
            audio: false,
            user_id: await ownerOf(input.film_id!),
          });
          return json({ generation_id: out.generation_id });
        }

        /** action "run": director interview → bible → reality check → scenes. */
        let state = await startDirector({
          data: {
            idea: input.idea!,
            style: input.style as never,
            session_id: input.session_id,
          },
        });

        for (const answer of input.answers) {
          if (!state.question) break;
          state = await answerDirector({
            data: {
              director_session_id: state.id,
              session_id: input.session_id,
              answer,
            },
          });
        }

        if (state.status !== "ready") {
          state = await finishDirector({
            data: { director_session_id: state.id, session_id: input.session_id },
          });
        }

        const challenge = await challengeFilm({
          data: { director_session_id: state.id, session_id: input.session_id },
        }).catch((error: Error) => ({ error: error.message }));

        const film = await buildFilmCore({
          director_session_id: state.id,
          session_id: input.session_id,
          style: input.style as never,
        });

        const requests = film.scenes.map((scene) => {
          const truth =
            scene.truth ??
            mergeSceneTruth(emptySceneTruth(), {
              action: scene.idea,
              setting: film.setting,
            });
          const preview = buildGenerationRequest(truth, {
            style_prefix: "",
            original_idea: film.logline || "",
            scene_number: scene.scene_number,
            scene_title: scene.title,
            cast: film.characters.map((c) => `${c.name}: ${c.look}`).join(". "),
            film_setting: film.setting,
            film_continuity: truth.continuity,
          });
          return {
            scene_id: scene.id,
            scene_number: scene.scene_number,
            title: scene.title,
            complexity: scene.complexity,
            
            truth,
            request: preview,
            fidelity: checkFidelity(truth, preview),
          };
        });

        return json({
          director_session_id: state.id,
          questions_asked: state.question_count,
          understanding: state.understanding,
          film_bible: state.film_bible,
          evolution: state.evolution,
          recommendation: state.recommendation,
          breakthroughs: state.breakthroughs,
          blueprint: state.blueprint,
          challenge,
          film: { id: film.id, title: film.title, logline: film.logline, setting: film.setting },
          scenes: requests,
        });
      },
    },
  },
});

/** Route module also re-exported for the film page's own loader typing. */
export const _unusedGetFilm = getFilm;
