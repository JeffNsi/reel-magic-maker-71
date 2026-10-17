import { z } from "zod";
import { sceneCostFor } from "@/lib/pricing";
import { buildGenerationRequest, emptySceneTruth, mergeSceneTruth } from "@/lib/scene-truth";
import type { LibraryCharacter } from "@/lib/character-library";

export const FILM_LENGTHS = [1, 3, 5, 10] as const;
export const SCENE_COUNTS: Record<number, number> = { 1: 5, 3: 12, 5: 20, 10: 40 };
export const startSceneSchema = z.object({ title: z.string().trim().min(1).max(120), idea: z.string().trim().min(1).max(400), narration: z.string().trim().max(300).default("") });
export const filmStartInput = z.object({
  session_id: z.string().uuid(), key: z.string().uuid(), character_id: z.string().uuid(),
  title: z.string().trim().min(1).max(120), idea: z.string().trim().min(1).max(400),
  setting: z.string().trim().min(1).max(300), genre: z.string().trim().min(1).max(80),
  style: z.enum(["cinematic", "anime", "realistic", "claymation"]),
  audience: z.enum(["general", "adult"]), length: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(10)]),
  approved: z.literal(true), scenes: z.array(startSceneSchema).min(5).max(40),
}).superRefine((v, ctx) => {
  if (v.scenes.length !== SCENE_COUNTS[v.length]) ctx.addIssue({ code: "custom", path: ["scenes"], message: "Scene count does not match the chosen length. / Scenantalet stämmer inte med längden." });
});
export type FilmStartInput = z.infer<typeof filmStartInput>;
export type StartScene = z.infer<typeof startSceneSchema>;
export function filmEstimate(length: number, engine: "lovable" | "fal" | "live") {
  const scenes = SCENE_COUNTS[length] ?? 5;
  return { scenes, seconds: scenes * 5, perScene: sceneCostFor(engine), total: scenes * sceneCostFor(engine) };
}
export function templateScenes(length: number, idea: string, name: string): StartScene[] {
  const beats = ["Arrival / Ankomst", "Discovery / Upptäckt", "Choice / Val", "Consequence / Följd", "Ending / Slut"];
  return Array.from({ length: SCENE_COUNTS[length] ?? 5 }, (_, i) => ({
    title: `${String(i + 1).padStart(2, "0")} · ${beats[Math.min(4, Math.floor(i * 5 / (SCENE_COUNTS[length] ?? 5)))]}`,
    idea: `${name} — ${idea}`.slice(0, 400), narration: "",
  }));
}
export function approvedSceneTruth(scene: StartScene, input: Pick<FilmStartInput, "idea" | "setting" | "style">, character: LibraryCharacter) {
  return mergeSceneTruth(emptySceneTruth(), {
    emotional_core: input.idea.slice(0, 300), what_must_survive: scene.idea.slice(0, 300),
    chosen_execution: scene.idea, action: scene.idea, setting: input.setting,
    characters: `${character.name}: ${character.description}`.slice(0, 300), visual_direction: input.style,
    continuity: "Keep the approved character identity, face, hair, skin, body, height and build unchanged.",
    provenance: { action: "user_decision", chosen_execution: "user_decision", characters: "user_decision", setting: "user_decision", visual_direction: "user_decision" },
  });
}
export function startScenePrompt(scene: StartScene, position: number, input: Pick<FilmStartInput, "idea" | "setting" | "style">, character: LibraryCharacter) {
  return buildGenerationRequest(approvedSceneTruth(scene, input, character), {
    style_prefix: input.style, original_idea: input.idea, scene_number: position,
    scene_title: scene.title, cast: `${character.name}: ${character.description}`, film_setting: input.setting,
  });
}