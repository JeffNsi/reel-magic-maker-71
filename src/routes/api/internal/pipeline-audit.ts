import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  answerDirector,
  challengeFilm,
  finishDirector,
  startDirector,
} from "@/lib/director.functions";
import { buildFilmCore, getFilm, renderScene } from "@/lib/film.functions";
import { checkStatus } from "@/lib/storyreel.functions";
import { buildGenerationRequest, checkFidelity, emptySceneTruth, mergeSceneTruth } from "@/lib/scene-truth";

/**
 * INTERNAL TEST ROUTE — not part of the customer experience and not linked from
 * any page. It only inspects the existing pipeline (director → film bible →
 * scene truth → generation request → video); it changes no product behaviour.
 * Guarded by the LOVABLE_CRON_SECRET shared secret.
 */

const body = z.object({
  action: z.enum(["run", "render", "status"]),
  idea: z.string().optional(),
  style: z.string().optional().default("cinematic"),
  answers: z.array(z.string()).optional().default([]),
  session_id: z.string().uuid(),
  film_id: z.string().uuid().optional(),
  scene_id: z.string().uuid().optional(),
  generation_id: z.string().uuid().optional(),
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

        if (input.action === "status") {
          const state = await checkStatus({
            data: { generation_id: input.generation_id!, session_id: input.session_id },
          });
          return json(state);
        }

        if (input.action === "render") {
          const out = await renderScene({
            data: {
              film_id: input.film_id!,
              scene_id: input.scene_id!,
              session_id: input.session_id,
              engine: "lovable",
              audio: false,
            },
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
            clarity: scene.clarity,
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
