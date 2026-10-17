import { z } from "zod";

import type { FilmView } from "@/lib/film.functions";
import type { StoryState } from "@/lib/story-state";

/**
 * CANONICAL FILM STATE — Continuity Film Engine, Phase 1.
 *
 * One canonical production truth for a whole film, so a film behaves like ONE
 * CONTINUOUS PRODUCTION instead of a bag of independent clips. This is a
 * derivation layer on top of the existing canonical StoryState and the existing
 * FilmView — NOT a second story model, NOT a database, NOT a prompt.
 *
 * Every entity that must survive from scene to scene receives a permanent,
 * deterministic identity (AMARA_01, AMARA_APARTMENT_01, PHONE_01) so later
 * phases (asset registry, reference resolver, prompt compiler, validator,
 * repair) can address the same thing across fifty scenes.
 *
 * HARD SEPARATION, enforced by this shape:
 *   canonical truth  — locked, only a creator decision may change it
 *   scene variables  — pose, emotion, action, camera, lighting: free per scene
 *   generated output — recorded in generationHistory, NEVER promoted to truth
 *
 * PURE: no AI, no provider, no credits, no fetch, no Supabase, no UI, no
 * mutation of its inputs. Absent information stays absent — nothing is invented,
 * no appearance, wardrobe or prop state is guessed.
 *
 * DELIBERATELY NOT SOLVED HERE (later phases): reference packs and asset
 * production, ReferenceResolver, PromptCompiler, provider adapter, scene-chain
 * generation, ContinuityValidator, RepairEngine, Continuity Center UI.
 */

/* ------------------------------------------------------------------ atoms */

const text = z.string().trim().default("");
const opt = z.string().trim().nullable().default(null);

/** Permanent entity identity, e.g. AMARA_01. Never a display name alone. */
export const canonicalIdSchema = z.string().trim().min(1);

export const entityKindSchema = z.enum(["character", "environment", "prop", "wardrobe", "style"]);
export type EntityKind = z.infer<typeof entityKindSchema>;

/** Where a value came from inside the existing state. Never fabricated. */
export const sourceRefSchema = z.object({
  field: text,
  scene_id: opt,
  scene_number: z.number().int().nullable().default(null),
  value: text,
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

/* -------------------------------------------------------------- character */

/**
 * Which aspects of a character are canonical truth. A locked aspect may only
 * change through an explicit creator decision on canonical state — never as a
 * side effect of a generation.
 */
export const characterLocksSchema = z.object({
  identity: z.boolean().default(true),
  face: z.boolean().default(true),
  hair: z.boolean().default(true),
  skin: z.boolean().default(true),
  body: z.boolean().default(true),
  wardrobe: z.boolean().default(false),
  accessories: z.boolean().default(false),
});
export type CharacterLocks = z.infer<typeof characterLocksSchema>;

/** Scene-level freedom. Explicitly NOT canonical truth. */
export const SCENE_VARIABLES = [
  "pose",
  "emotion",
  "movement",
  "camera",
  "lighting",
  "action",
  "dialogue",
] as const;

export const filmCharacterSchema = z.object({
  /** Permanent identity, e.g. AMARA_01. */
  canonical_id: canonicalIdSchema,
  /** The StoryState character id this was derived from, when there is one. */
  story_character_id: opt,
  name: text,
  age: opt,
  role: opt,
  /** Only what the story actually established. */
  appearance: opt,
  face: opt,
  hair: opt,
  skin: opt,
  body: opt,
  locks: characterLocksSchema,
  /** Reference pack assets. Empty until Phase 2 produces them. */
  reference_assets: z.array(text).default([]),
  /** True only when a usable reference pack exists. */
  reference_pack_ready: z.boolean().default(false),
  appears_in: z.array(z.number().int()).default([]),
  evidence: z.array(sourceRefSchema).default([]),
  version: z.number().int().default(1),
});
export type FilmCharacter = z.infer<typeof filmCharacterSchema>;

/* ------------------------------------------------------------ environment */

export const filmEnvironmentSchema = z.object({
  canonical_id: canonicalIdSchema,
  name: text,
  description: opt,
  lighting: opt,
  time_of_day: opt,
  weather: opt,
  reference_assets: z.array(text).default([]),
  reference_pack_ready: z.boolean().default(false),
  used_by: z.array(z.number().int()).default([]),
  evidence: z.array(sourceRefSchema).default([]),
  version: z.number().int().default(1),
});
export type FilmEnvironment = z.infer<typeof filmEnvironmentSchema>;

/* ---------------------------------------------------------------- wardrobe */

/**
 * Wardrobe is stateful and append-only: a change is an explicit story event
 * belonging to a scene. Nothing changes between scenes without an event.
 */
export const wardrobeEventSchema = z.object({
  id: canonicalIdSchema,
  character_id: canonicalIdSchema,
  value: text,
  scene_id: opt,
  scene_number: z.number().int().default(0),
  evidence: z.array(sourceRefSchema).default([]),
});
export type WardrobeEvent = z.infer<typeof wardrobeEventSchema>;

/* -------------------------------------------------------------------- prop */

export const propEventSchema = z.object({
  id: canonicalIdSchema,
  prop_id: canonicalIdSchema,
  /** Where the prop is, as the story states it. Never guessed. */
  placement: text,
  scene_id: opt,
  scene_number: z.number().int().default(0),
  evidence: z.array(sourceRefSchema).default([]),
});
export type PropEvent = z.infer<typeof propEventSchema>;

export const filmPropSchema = z.object({
  canonical_id: canonicalIdSchema,
  name: text,
  significance: opt,
  reference_assets: z.array(text).default([]),
  events: z.array(propEventSchema).default([]),
  appears_in: z.array(z.number().int()).default([]),
  version: z.number().int().default(1),
});
export type FilmProp = z.infer<typeof filmPropSchema>;

/* ------------------------------------------------------------------- style */

export const visualStyleSchema = z.object({
  style: text,
  visual_direction: opt,
  lighting_logic: opt,
  reference_assets: z.array(text).default([]),
  version: z.number().int().default(1),
});
export type VisualStyle = z.infer<typeof visualStyleSchema>;

/* -------------------------------------------------------------- scene state */

export const filmSceneStateSchema = z.object({
  scene_id: text,
  scene_number: z.number().int().default(0),
  /** The scene chain. Nothing is generated in isolation. */
  previous_scene_id: opt,
  next_scene_id: opt,
  title: text,
  characters: z.array(canonicalIdSchema).default([]),
  environment_id: opt,
  wardrobe: z.array(wardrobeEventSchema).default([]),
  props: z.array(canonicalIdSchema).default([]),
  time_of_day: opt,
  weather: opt,
  lighting: opt,
  camera: opt,
  action: opt,
  dialogue: opt,
  emotion: opt,
  narrative_purpose: opt,
  continuity_requirements: z.array(text).default([]),
  /** Reference manifest input. Resolved by a later phase, empty here. */
  input_references: z.array(text).default([]),
  output_assets: z.array(text).default([]),
  generation_status: z
    .enum(["idle", "queued", "preparing", "generating", "processing", "validating", "completed", "failed"])
    .default("idle"),
  /** Honest marker: nothing has been semantically validated in this phase. */
  validation_status: z.enum(["unknown", "pass", "warning", "fail"]).default("unknown"),
  committed_version: z.number().int().default(0),
});
export type FilmSceneState = z.infer<typeof filmSceneStateSchema>;

/* --------------------------------------------------------- generation record */

/** Observability record of a generation. Never a source of canonical truth. */
export const generationRecordSchema = z.object({
  generation_id: text,
  scene_id: text,
  scene_number: z.number().int().default(0),
  provider: opt,
  output_asset: opt,
  status: text,
  validation: z.enum(["unknown", "pass", "warning", "fail"]).default("unknown"),
  repair_attempts: z.number().int().default(0),
  error: opt,
});
export type GenerationRecord = z.infer<typeof generationRecordSchema>;

/* ------------------------------------------------------------- asset registry */

export const assetEntrySchema = z.object({
  id: canonicalIdSchema,
  kind: entityKindSchema,
  entity_id: canonicalIdSchema,
  url: text,
  role: text,
});
export type AssetEntry = z.infer<typeof assetEntrySchema>;

/* ------------------------------------------------------------ continuity graph */

export const graphEdgeSchema = z.object({
  from: canonicalIdSchema,
  relation: z.enum(["appears_in", "used_by", "placed_in", "worn_in"]),
  to: text,
});
export type GraphEdge = z.infer<typeof graphEdgeSchema>;

/* ------------------------------------------------------------------ FilmState */

export const filmStateSchema = z.object({
  film_id: text,
  film_version: z.number().int().default(1),
  title: text,
  characters: z.array(filmCharacterSchema).default([]),
  environments: z.array(filmEnvironmentSchema).default([]),
  props: z.array(filmPropSchema).default([]),
  wardrobe: z.array(wardrobeEventSchema).default([]),
  visual_style: visualStyleSchema,
  scenes: z.array(filmSceneStateSchema).default([]),
  continuity_graph: z.array(graphEdgeSchema).default([]),
  generation_history: z.array(generationRecordSchema).default([]),
  asset_registry: z.array(assetEntrySchema).default([]),
  /** The StoryState version this film state was derived from. */
  derived_from_story_version: opt,
});
export type FilmState = z.infer<typeof filmStateSchema>;

/* ------------------------------------------------------------------ helpers */

/** Deterministic permanent id from a display name, e.g. "Amara" → AMARA_01. */
export function canonicalId(name: string, taken: Set<string>): string {
  const base =
    name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "ENTITY";
  let n = 1;
  let id = `${base}_${String(n).padStart(2, "0")}`;
  while (taken.has(id)) {
    n += 1;
    id = `${base}_${String(n).padStart(2, "0")}`;
  }
  taken.add(id);
  return id;
}

const clean = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
};

function evidence(field: string, value: string | null, scene?: { id: string; n: number }) {
  if (value === null) return [];
  return [
    sourceRefSchema.parse({
      field,
      value,
      scene_id: scene?.id ?? null,
      scene_number: scene?.n ?? null,
    }),
  ];
}

/* ---------------------------------------------------------------- normalize */

export type NormalizeFilmInput = {
  story: StoryState;
  film: FilmView | null;
};

/**
 * Derive the canonical FilmState. Pure and deterministic: the same inputs always
 * produce the same ids, ordering and evidence, and the inputs are never mutated.
 */
export function normalizeFilmState(input: NormalizeFilmInput): FilmState {
  const { story, film } = input;
  const takenChar = new Set<string>();
  const takenEnv = new Set<string>();
  const takenProp = new Set<string>();

  /* characters — canonical identity from StoryState, names never used as ids */
  const byName = new Map<string, string>();
  const characters: FilmCharacter[] = story.characters
    .filter((c) => clean(c.name) !== null || clean(c.id) !== null)
    .map((c) => {
      const name = clean(c.name) ?? clean(c.id) ?? "";
      const id = canonicalId(name, takenChar);
      if (name) byName.set(name.toLowerCase(), id);
      return filmCharacterSchema.parse({
        canonical_id: id,
        story_character_id: clean(c.id),
        name,
        age: clean(c.age),
        role: clean(c.role),
        appearance: clean(c.appearance),
        face: null,
        hair: null,
        skin: null,
        body: null,
        locks: {},
        evidence: [
          ...evidence("characters.name", clean(c.name)),
          ...evidence("characters.appearance", clean(c.appearance)),
        ],
      });
    });

  /* also honour looks the film view already carries, without inventing any */
  for (const fc of film?.characters ?? []) {
    const key = clean(fc.name)?.toLowerCase();
    if (!key) continue;
    const id = byName.get(key);
    const look = clean(fc.look);
    if (!id || look === null) continue;
    const target = characters.find((c) => c.canonical_id === id);
    if (target && target.appearance === null) {
      target.appearance = look;
      target.evidence = [...target.evidence, ...evidence("film.characters.look", look)];
    }
  }

  /* environments — declared locations first, then locations scenes establish */
  const environments: FilmEnvironment[] = [];
  const envByName = new Map<string, string>();
  const ensureEnv = (
    rawName: string | null,
    description: string | null,
    field: string,
    scene?: { id: string; n: number },
  ): string | null => {
    const name = clean(rawName);
    if (name === null) return null;
    const key = name.toLowerCase();
    const existing = envByName.get(key);
    if (existing) return existing;
    const id = canonicalId(name, takenEnv);
    envByName.set(key, id);
    environments.push(
      filmEnvironmentSchema.parse({
        canonical_id: id,
        name,
        description,
        evidence: evidence(field, name, scene),
      }),
    );
    return id;
  };

  for (const loc of story.world.locations) {
    ensureEnv(clean(loc.name) ?? clean(loc.id), clean(loc.description), "world.locations");
  }

  /* props — only objects the story marked as mattering */
  const props: FilmProp[] = story.world.objects
    .filter((o) => clean(o.name) !== null)
    .map((o) => {
      const name = clean(o.name) as string;
      return filmPropSchema.parse({
        canonical_id: canonicalId(name, takenProp),
        name,
        significance: clean(o.significance),
      });
    });

  /* scenes — ordered, chained, derived from Scene Truth where it exists */
  const ordered = [...story.scenes].sort((a, b) =>
    a.scene_number === b.scene_number ? a.id.localeCompare(b.id) : a.scene_number - b.scene_number,
  );

  const wardrobe: WardrobeEvent[] = [];
  const scenes: FilmSceneState[] = ordered.map((s, i) => {
    const truth = s.truth;
    const where = { id: s.id, n: s.scene_number };
    const envId = ensureEnv(
      clean(truth?.setting) ?? clean(s.location),
      null,
      truth?.setting ? "scene.truth.setting" : "scene.location",
      where,
    );

    /* character presence: resolve names to canonical ids, skip unknown names */
    const named = [
      ...s.characters,
      ...(truth?.characters ? truth.characters.split(/[,&]|\band\b/i) : []),
    ]
      .map((n) => clean(n)?.toLowerCase())
      .filter((n): n is string => n !== null);
    const presentIds = [
      ...new Set(named.map((n) => byName.get(n)).filter((v): v is string => !!v)),
    ];

    /* wardrobe events are explicit, append-only and scene-owned */
    const wardrobeValue = clean(truth?.wardrobe);
    const sceneWardrobe: WardrobeEvent[] = [];
    if (wardrobeValue !== null) {
      for (const charId of presentIds) {
        const ev = wardrobeEventSchema.parse({
          id: `WARDROBE_${charId}_SCENE_${String(s.scene_number).padStart(2, "0")}`,
          character_id: charId,
          value: wardrobeValue,
          scene_id: s.id,
          scene_number: s.scene_number,
          evidence: evidence("scene.truth.wardrobe", wardrobeValue, where),
        });
        sceneWardrobe.push(ev);
        wardrobe.push(ev);
      }
    }

    /* prop presence — only props the scene text actually names */
    const haystack = [s.action, s.title, truth?.action, truth?.chosen_execution]
      .map((v) => (v ?? "").toLowerCase())
      .join(" ");
    const scenePropIds = props
      .filter((p) => p.name.length > 2 && haystack.includes(p.name.toLowerCase()))
      .map((p) => p.canonical_id);
    for (const pid of scenePropIds) {
      const prop = props.find((p) => p.canonical_id === pid);
      if (!prop) continue;
      prop.appears_in = [...new Set([...prop.appears_in, s.scene_number])];
    }

    return filmSceneStateSchema.parse({
      scene_id: s.id,
      scene_number: s.scene_number,
      previous_scene_id: i > 0 ? (ordered[i - 1]?.id ?? null) : null,
      next_scene_id: i < ordered.length - 1 ? (ordered[i + 1]?.id ?? null) : null,
      title: s.title,
      characters: presentIds,
      environment_id: envId,
      wardrobe: sceneWardrobe,
      props: scenePropIds,
      time_of_day: clean(truth?.time_period) ?? clean(s.time),
      weather: null,
      lighting: clean(truth?.lighting),
      camera: clean(truth?.camera),
      action: clean(truth?.action) ?? clean(s.action),
      dialogue: clean(truth?.dialogue),
      emotion: clean(truth?.emotional_core) ?? clean(s.emotion),
      narrative_purpose: clean(s.purpose),
      continuity_requirements: [clean(truth?.continuity)].filter((v): v is string => v !== null),
      generation_status: s.generation?.status ?? "idle",
      validation_status: "unknown",
      committed_version: s.generation?.has_clip ? 1 : 0,
    });
  });

  /* back-references */
  for (const scene of scenes) {
    for (const id of scene.characters) {
      const c = characters.find((x) => x.canonical_id === id);
      if (c) c.appears_in = [...new Set([...c.appears_in, scene.scene_number])];
    }
    if (scene.environment_id) {
      const e = environments.find((x) => x.canonical_id === scene.environment_id);
      if (e) e.used_by = [...new Set([...e.used_by, scene.scene_number])];
    }
  }

  /* continuity graph — global, not just adjacent scenes */
  const continuity_graph: GraphEdge[] = [];
  for (const c of characters)
    for (const n of c.appears_in)
      continuity_graph.push({ from: c.canonical_id, relation: "appears_in", to: String(n) });
  for (const e of environments)
    for (const n of e.used_by)
      continuity_graph.push({ from: e.canonical_id, relation: "used_by", to: String(n) });
  for (const p of props)
    for (const n of p.appears_in)
      continuity_graph.push({ from: p.canonical_id, relation: "placed_in", to: String(n) });
  for (const w of wardrobe)
    continuity_graph.push({
      from: w.character_id,
      relation: "worn_in",
      to: String(w.scene_number),
    });

  /* generation history — observability only, never promoted to truth */
  const generation_history: GenerationRecord[] = (film?.scenes ?? [])
    .filter((s) => s.generation_id !== null)
    .map((s) =>
      generationRecordSchema.parse({
        generation_id: s.generation_id ?? "",
        scene_id: s.id,
        scene_number: s.scene_number,
        provider: null,
        output_asset: clean(s.video_url),
        status: s.status,
        validation: "unknown",
        repair_attempts: s.recovery ? 1 : 0,
        error: clean(s.error_message),
      }),
    );

  return filmStateSchema.parse({
    film_id: clean(story.identity.story_id) ?? clean(film?.id) ?? "",
    film_version: 1,
    title: clean(film?.title) ?? "",
    characters,
    environments,
    props,
    wardrobe,
    visual_style: {
      style: clean(film?.style) ?? "",
      visual_direction: clean(ordered[0]?.truth?.visual_direction),
      lighting_logic: clean(ordered[0]?.truth?.lighting),
    },
    scenes,
    continuity_graph,
    generation_history,
    asset_registry: [],
    derived_from_story_version: clean(story.version.id),
  });
}

/* ------------------------------------------------------------------- reads */

/** Which canonical references a scene needs before it may be generated. */
export function requiredReferences(state: FilmState, sceneId: string) {
  const scene = state.scenes.find((s) => s.scene_id === sceneId) ?? null;
  if (!scene) return { characters: [], environments: [], props: [], missing: [] };
  const missing: string[] = [];
  for (const id of scene.characters) {
    const c = state.characters.find((x) => x.canonical_id === id);
    if (c && !c.reference_pack_ready) missing.push(`${id} reference pack`);
  }
  if (scene.environment_id) {
    const e = state.environments.find((x) => x.canonical_id === scene.environment_id);
    if (e && !e.reference_pack_ready) missing.push(`${e.canonical_id} reference pack`);
  }
  return {
    characters: scene.characters,
    environments: scene.environment_id ? [scene.environment_id] : [],
    props: scene.props,
    missing,
  };
}

/** Scenes affected if a canonical entity changes. Never regenerates anything. */
export function affectedScenes(state: FilmState, canonicalEntityId: string): number[] {
  return [
    ...new Set(
      state.continuity_graph
        .filter((e) => e.from === canonicalEntityId)
        .map((e) => Number(e.to))
        .filter((n) => Number.isFinite(n)),
    ),
  ].sort((a, b) => a - b);
}

/** Current wardrobe for a character at a scene number — last explicit event. */
export function wardrobeAt(
  state: FilmState,
  characterId: string,
  sceneNumber: number,
): WardrobeEvent | null {
  const events = state.wardrobe
    .filter((w) => w.character_id === characterId && w.scene_number <= sceneNumber)
    .sort((a, b) => a.scene_number - b.scene_number);
  return events.length > 0 ? (events[events.length - 1] ?? null) : null;
}
