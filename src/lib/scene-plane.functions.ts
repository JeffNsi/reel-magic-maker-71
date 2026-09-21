import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getModel, platformOf } from "@/generation/catalog";
import type { PlatformFlavor } from "@/generation/catalog/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  compileScenePlane,
  pickModelForScene,
  type CompiledPlane,
  type FormatNote,
  type OmittedReference,
  type PlaneGate,
  type PlaneReference,
} from "@/lib/director-plane";
import { SHOT_COST, loadFilm, sceneGenerationInput } from "@/lib/film.functions";
import { resolveSceneReferences, type SceneReferences } from "@/lib/reference-resolver";
import { submitPlane, type RunRow } from "@/lib/generation-run.functions";

/**
 * PHASE 4 — the Director directs the engine.
 *
 * The scene view compiles the approved Film Bible and Scene Truth into exactly
 * one GenerationPlane through the pure compiler in director-plane.ts. Nothing in
 * this module invents a prompt, edits canon or promotes a generated clip to
 * canonical truth: the output is recorded as history against the scene only.
 *
 * Owner-only: reads are scoped by the film's session id, exactly like the film
 * page, and nothing here is exposed on the public share route.
 */

const ref = z.object({
  film_id: z.string().uuid(),
  session_id: z.string().uuid(),
});

export type ScenePlaneView = {
  scene_id: string;
  scene_number: number;
  /** The Director's default pick and the one line explaining it. */
  model: { id: string; label: string; reason: string; platform: PlatformFlavor };
  settings: Record<string, string | number | boolean>;
  references: PlaneReference[];
  omitted: OmittedReference[];
  format: { vertical: boolean; duration: number | null; notes: FormatNote[] };
  gate: PlaneGate;
  image_conditioned: boolean;
  /** The compiled prompt, so the creator can read what the engine receives. */
  prompt_preview: string;
  /** What a press costs on each engine, stated before it runs. */
  ezy_credits: number;
  strong_credits: 0;
};

type SceneRefs = { scene_id: string; refs: SceneReferences | null };

/** Which generation accounts this request can actually reach. */
async function reachablePlatforms(): Promise<PlatformFlavor[]> {
  const { platformKeyFromRequest } = await import("./platform-key.server");
  const { availablePlatforms } = await import("@/generation/platform-config.server");
  return availablePlatforms(platformKeyFromRequest());
}

async function resolveAll(film_id: string, session_id: string): Promise<SceneRefs[]> {
  try {
    const { loadResolverCanon } = await import("@/lib/canon.functions");
    const canon = await loadResolverCanon(film_id, session_id);
    return canon.scenes.map((scene) => ({
      scene_id: scene.scene_id,
      refs: resolveSceneReferences(canon, scene.scene_number),
    }));
  } catch (err) {
    /* No canon yet is not a failure: the scene simply resolves text-only. */
    console.info("canon resolve skipped", err instanceof Error ? err.message : "unknown");
    return [];
  }
}

function platformFor(modelId: string): PlatformFlavor {
  const entry = getModel(modelId);
  return entry ? platformOf(entry) : "higgsfield";
}

function viewOf(
  scene: { id: string; scene_number: number },
  compiled: CompiledPlane,
  pick: { id: string; label: string; reason: string },
): ScenePlaneView {
  return {
    scene_id: scene.id,
    scene_number: scene.scene_number,
    model: {
      id: compiled.model.id,
      label: compiled.model.label,
      reason: pick.reason,
      platform: platformFor(compiled.model.id),
    },
    settings: compiled.plane.settings as Record<string, string | number | boolean>,
    references: compiled.references,
    omitted: compiled.omitted,
    format: compiled.format,
    gate: compiled.gate,
    image_conditioned: compiled.image_conditioned,
    prompt_preview: compiled.plane.prompt.text,
    ezy_credits: SHOT_COST,
    strong_credits: 0,
  };
}

/**
 * What every scene would be generated from, before any press: the Director's
 * model and its reasoning, the house settings, the references that will travel
 * with the prompt, the ones that did not fit and why, and whether the required
 * reference packs exist at all. Pure read — no credits, no provider call.
 */
export const getScenePlanes = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ref.parse(data))
  .handler(async ({ data }): Promise<ScenePlaneView[]> => {
    const film = await loadFilm(data.film_id, data.session_id);
    const platforms = await reachablePlatforms();
    const resolved = await resolveAll(data.film_id, data.session_id);
    const byScene = new Map(resolved.map((entry) => [entry.scene_id, entry.refs] as const));

    const views: ScenePlaneView[] = [];
    for (const scene of film.scenes) {
      const refs = byScene.get(scene.id) ?? null;
      const pick = pickModelForScene(refs, { platforms });
      if (!pick.id) continue;
      const { truth, ctx } = sceneGenerationInput(film, scene);
      const compiled = compileScenePlane({
        modelId: pick.id,
        truth,
        ctx,
        references: refs,
        filmStyle: film.style,
      });
      if (!compiled) continue;
      views.push(viewOf(scene, compiled, pick));
    }
    return views;
  });

const renderInput = ref.extend({
  scene_id: z.string().uuid(),
  /** The creator's override from the advanced rail, or the Director's pick. */
  model_id: z.string().min(1).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  count: z.number().int().min(1).max(4).default(1),
});

/**
 * Generate one scene on the creator's own platform account (STRONG): no credits
 * are charged and the creator's key never leaves the server. The plane is always
 * recompiled here from canon and Scene Truth — a client can override the model
 * and its settings, never the prompt or the references.
 */
export const renderScenePlane = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => renderInput.parse(data))
  .handler(async ({ data, context }): Promise<{ runs: RunRow[] }> => {
    const film = await loadFilm(data.film_id, data.session_id);
    const scene = film.scenes.find((s) => s.id === data.scene_id);
    if (!scene) throw new Error("That scene could not be found.");

    const resolved = await resolveAll(data.film_id, data.session_id);
    const refs = resolved.find((entry) => entry.scene_id === scene.id)?.refs ?? null;
    const pick = pickModelForScene(refs, { platforms: await reachablePlatforms() });
    const modelId = data.model_id ?? pick.id;

    const { truth, ctx } = sceneGenerationInput(film, scene);
    const compiled = compileScenePlane({
      modelId,
      truth,
      ctx,
      references: refs,
      filmStyle: film.style,
      ...(data.settings ? { overrides: data.settings } : {}),
    });

    if (!compiled) throw new Error("That model is not in the catalogue.");

    /* The gate decides: a scene whose required reference packs are missing does
     * not generate, and the missing items are named. */
    if (!compiled.gate.allowed) {
      throw new Error(`${compiled.gate.reason} Missing: ${compiled.gate.missing.join(", ")}.`);
    }

    return submitPlane(context, compiled.plane, data.count, {
      story_id: film.id,
      scene_id: scene.id,
    });
  });
