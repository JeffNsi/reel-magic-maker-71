import { z } from "zod";

import type { SceneReferences } from "@/lib/reference-resolver";

/**
 * SCENE TRUTH CONTRACT
 *
 * One authoritative, structured representation of a scene as it was approved —
 * the executable form of the accepted Film Bible. Everything the director
 * decided (emotional core, what must survive, the chosen execution, camera,
 * continuity, the turn and its foreshadowing) lives here, so nothing can be
 * lost when the scene is reduced to a sentence of prose.
 *
 * This is not a second source of creative truth: the approved Film Bible stays
 * authoritative and Scene Truth is derived from it, stored per scene, and read
 * by the generator instead of the prose being reconstructed.
 */

const s = (max: number) => z.string().trim().max(max).default("");

export const sceneTruthSchema = z.object({
  /** The one thing this scene must communicate. Inviolable. */
  emotional_core: s(300),
  /** The beat that cannot disappear, whatever the execution becomes. */
  what_must_survive: s(300),
  /** The winning execution — never a rejected candidate. */
  chosen_execution: s(400),
  characters: s(300),
  action: s(400),
  setting: s(300),
  time_period: s(120),
  wardrobe: s(200),
  camera: s(200),
  framing: s(200),
  movement: s(200),
  visual_direction: s(300),
  lighting: s(200),
  sound: s(200),
  dialogue: s(200),
  continuity: s(300),
  twist: s(300),
  reveal: s(300),
  foreshadowing: s(300),
  /** Where each populated value came from, when known. */
  provenance: z
    .record(
      z.string(),
      z.enum(["user_decision", "ai_discovery", "ai_recommendation", "ai_assumption"]),
    )
    .default({}),
  /** Creator decisions that outrank any AI assumption in this scene. */
  user_decisions: z.array(z.string().trim().max(200)).max(8).default([]),
});

export type SceneTruth = z.infer<typeof sceneTruthSchema>;

export type SceneTruthPatch = { [K in keyof SceneTruth]?: SceneTruth[K] | undefined };

export type SceneTruthField = Exclude<keyof SceneTruth, "provenance" | "user_decisions">;

/** The three fields the generation request may never lose. */
export const REQUIRED_TRUTH_FIELDS = [
  "emotional_core",
  "what_must_survive",
  "chosen_execution",
] as const satisfies readonly SceneTruthField[];

const LABELS: Record<SceneTruthField, string> = {
  emotional_core: "Emotional core",
  what_must_survive: "What must survive",
  chosen_execution: "Chosen execution",
  characters: "Characters",
  action: "Action",
  setting: "Setting",
  time_period: "Time / period",
  wardrobe: "Wardrobe",
  camera: "Camera",
  framing: "Framing",
  movement: "Movement",
  visual_direction: "Visual direction",
  lighting: "Lighting",
  sound: "Sound",
  dialogue: "Dialogue",
  continuity: "Continuity",
  twist: "Twist",
  reveal: "Reveal",
  foreshadowing: "Foreshadowing",
};

/** Required first, then the fields that most change what is on screen. */
const ORDER: SceneTruthField[] = [
  "emotional_core",
  "what_must_survive",
  "chosen_execution",
  "characters",
  "action",
  "setting",
  "time_period",
  "camera",
  "framing",
  "movement",
  "reveal",
  "twist",
  "visual_direction",
  "lighting",
  "wardrobe",
  "continuity",
  "foreshadowing",
  "sound",
  "dialogue",
];

export function readSceneTruth(value: unknown): SceneTruth | null {
  if (!value || typeof value !== "object") return null;
  const parsed = sceneTruthSchema.safeParse(value);
  if (!parsed.success) return null;
  const truth = parsed.data;
  const populated = ORDER.some((field) => truth[field]);
  return populated ? truth : null;
}

export function emptySceneTruth(): SceneTruth {
  return sceneTruthSchema.parse({});
}

/**
 * An AI assumption never overwrites a creator decision: a field the creator
 * decided keeps its value, whatever a later pass suggests.
 */
export function mergeSceneTruth(base: SceneTruth, incoming: SceneTruthPatch): SceneTruth {
  const next: SceneTruth = { ...base, provenance: { ...base.provenance } };

  for (const field of ORDER) {
    const value = (incoming[field] as string | undefined)?.trim();
    if (!value) continue;
    const source = incoming.provenance?.[field] ?? "ai_assumption";
    const owned = base.provenance[field] === "user_decision";
    if (owned && source !== "user_decision" && base[field]) continue;
    next[field] = value;
    next.provenance[field] = source;
  }

  const decisions = [...base.user_decisions, ...(incoming.user_decisions ?? [])]
    .map((d) => d.trim())
    .filter(Boolean);
  next.user_decisions = Array.from(new Set(decisions)).slice(0, 8);
  return next;
}

export type GenerationContext = {
  /** Look prefix for the chosen visual style. */
  style_prefix: string;
  /** The creator's untouched idea — context only, never an override. */
  original_idea: string;
  scene_number: number;
  scene_title: string;
  cast: string;
  film_setting: string;
  /** Character rules and clues that must hold across the whole film. */
  film_continuity: string;
};

/**
 * Turn Scene Truth into the request the video model receives. Only populated
 * fields appear; the required creative fields are written first so a length
 * budget can never cut them.
 *
 * Phase 3: when resolved references are supplied AND they are image-conditioned,
 * the identity block (locked canonical truth only) and the previous-scene status
 * block are appended. With no references, or in text-only mode, the output is
 * byte-identical to what it has always been.
 */
export function buildGenerationRequest(
  truth: SceneTruth,
  ctx: GenerationContext,
  options: {
    limit?: number;
    minimal?: boolean;
    references?: SceneReferences | null;
  } = {},
): string {
  const limit = options.limit ?? 1800;
  const head = [
    ctx.style_prefix,
    ctx.cast ? `Recurring characters — ${ctx.cast}.` : "",
    ctx.film_setting ? `Same setting throughout — ${ctx.film_setting}.` : "",
    ctx.film_continuity ? `Film continuity — ${ctx.film_continuity}.` : "",
    `Approved scene ${ctx.scene_number}${ctx.scene_title ? ` — ${ctx.scene_title}` : ""}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const fields = (
    options.minimal ? [...REQUIRED_TRUTH_FIELDS, "action", "setting"] : ORDER
  ) as SceneTruthField[];

  const lines: string[] = [];
  for (const field of fields) {
    const value = truth[field];
    if (!value) continue;
    lines.push(`${LABELS[field]}: ${value}`);
  }

  if (truth.user_decisions.length) {
    lines.push(`Creator's decisions (authoritative): ${truth.user_decisions.join("; ")}`);
  }

  const context = ctx.original_idea
    ? `Project context — the creator's original idea (background only, the approved scene above wins): ${ctx.original_idea}`
    : "";

  /* Continuity tail — only ever present for an image-conditioned scene. */
  const tail: string[] = [];
  const refs = options.references ?? null;
  if (refs && refs.mode === "image-conditioned") {
    for (const character of refs.characters) {
      if (!character.locked.length) continue;
      tail.push(
        `IDENTITY LOCK ${character.characterId}${character.name ? ` (${character.name})` : ""} — ${character.locked.join("; ")}. Match the supplied reference images exactly.`,
      );
    }
    if (refs.previousSceneStatus) {
      tail.push(`PREVIOUS SCENE STATUS: ${refs.previousSceneStatus}`);
    }
  }

  /** Trim from the least essential end so the required fields always survive. */
  const assemble = (body: string[]) =>
    [head, ...body, ...tail, context].filter(Boolean).join("\n").trim();

  let body = lines;
  let request = assemble(body);
  while (request.length > limit && body.length > REQUIRED_TRUTH_FIELDS.length) {
    body = body.slice(0, -1);
    request = assemble(body);
  }
  return request.slice(0, limit);
}

const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "at",
  "by",
  "for",
  "with",
  "from",
  "that",
  "this",
  "her",
  "his",
  "their",
  "its",
  "she",
  "he",
  "they",
  "it",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "into",
  "over",
  "must",
  "should",
  "one",
  "own",
  "two",
  "between",
  "while",
  "without",
  "not",
  "no",
  "shot",
  "scene",
  "film",
  "camera",
]);

function keyWords(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((word) => word.length > 3 && !STOP.has(word)),
    ),
  );
}

export type FidelityResult = {
  ok: boolean;
  /** Required fields present in Scene Truth but missing from the request. */
  missing: SceneTruthField[];
  /** Required fields whose meaning did not survive into the request. */
  semantic: SceneTruthField[];
};

/**
 * Preparation validation — never a generation retry. Checks that every required
 * creative field present in Scene Truth is also present in the request, and
 * that its meaning survived rather than just its label.
 */
export function checkFidelity(truth: SceneTruth, request: string): FidelityResult {
  const haystack = request.toLowerCase();
  const missing: SceneTruthField[] = [];
  const semantic: SceneTruthField[] = [];

  for (const field of REQUIRED_TRUTH_FIELDS) {
    const value = truth[field];
    if (!value) continue;
    if (!haystack.includes(LABELS[field].toLowerCase())) {
      missing.push(field);
      continue;
    }
    const words = keyWords(value);
    if (!words.length) continue;
    const kept = words.filter((word) => haystack.includes(word)).length;
    if (kept / words.length < 0.6) semantic.push(field);
  }

  return { ok: !missing.length && !semantic.length, missing, semantic };
}
