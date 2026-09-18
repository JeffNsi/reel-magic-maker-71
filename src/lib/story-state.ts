import { z } from "zod";

import type {
  Challenge,
  Evolution,
  FilmBible,
  FilmModel,
  Recommendation,
  Twist,
} from "@/lib/director.functions";
import type { FilmScene, FilmView } from "@/lib/film.functions";
import { readSceneTruth, type SceneTruth } from "@/lib/scene-truth";

/**
 * CANONICAL STORY STATE — one internal source of truth.
 *
 * This is a normalization layer, not a second story model. Every field is
 * derived from what the product already owns: the director's film model, the
 * approved Film Bible (including its accepted twist), the per-scene Scene Truth
 * contract, the reality-check/challenge pass and the generation records. Nothing
 * here writes creative data, invents defaults or duplicates twist logic — the
 * Plot Twist library and the Film Bible stay authoritative and are referenced.
 *
 * Structurally prepared, deliberately not solved here: knowledge reasoning,
 * timeline contradiction detection, continuity checking and payoff scoring. The
 * shapes exist so later phases have somewhere truthful to write.
 *
 * StoryState is internal. Public surfaces may only receive publicStoryState(),
 * which drops hidden truth, provenance, facts, threads and every internal id.
 */

/* ------------------------------------------------------------------ atoms */

const text = z.string().trim().default("");
const opt = z.string().trim().nullable().default(null);

export const factSourceSchema = z.enum([
  "user_decision",
  "ai_assumption",
  "ai_discovery",
  "ai_recommendation",
]);
export type StoryFactSource = z.infer<typeof factSourceSchema>;

/** Prepared for a later knowledge engine — no reasoning happens in this phase. */
export const knowledgeStateSchema = z.enum(["known", "unknown", "revealed", "inferred"]);
export type KnowledgeState = z.infer<typeof knowledgeStateSchema>;

export const threadStatusSchema = z.enum(["open", "resolved", "abandoned"]);
export type ThreadStatus = z.infer<typeof threadStatusSchema>;

export const payoffStatusSchema = z.enum(["planned", "set_up", "paid_off", "missing"]);
export type PayoffStatus = z.infer<typeof payoffStatusSchema>;

/* ------------------------------------------------------------- identity */

export const identitySchema = z.object({
  /** The film this state describes — the existing stories row. */
  story_id: opt,
  /** The director session it was approved from, when there is one. */
  director_session_id: opt,
  title: text,
  style: text,
  created_at: opt,
});

/* ------------------------------------------------------------- story DNA */

export const storyDnaSchema = z.object({
  premise: opt,
  logline: opt,
  theme: opt,
  central_question: opt,
  main_conflict: opt,
  stakes: opt,
  emotional_core: opt,
  tone: opt,
  genre: opt,
  /** Inviolable beats, collected from Scene Truth and the bible's decisions. */
  what_must_survive: z.array(text).default([]),
  ending_intention: opt,
  story_promise: opt,
});
export type StoryDNA = z.infer<typeof storyDnaSchema>;

/* ------------------------------------------------- film bible reference */

/**
 * A normalized *reference* to the approved Film Bible. The bible itself remains
 * the owner of this content; nothing is rewritten here.
 */
export const filmBibleRefSchema = z.object({
  present: z.boolean().default(false),
  /** Character names as the bible lists them; full records live in characters. */
  cast: z.array(text).default([]),
  setting: opt,
  mood: opt,
  look: opt,
  camera: opt,
  ending_intention: opt,
  /** True when the bible carries an accepted turn — details live in twist. */
  has_twist: z.boolean().default(false),
});

/* ------------------------------------------------------------ characters */

export const characterKnowledgeSchema = z.object({
  subject: text,
  state: knowledgeStateSchema,
  /** Scene number where the state changes, when known. */
  scene: z.number().int().nullable().default(null),
});

/**
 * PHASE 2.1 — CHARACTER STATE + CHARACTER KNOWLEDGE.
 *
 * Both are append-only event logs: a later scene never rewrites an earlier
 * event, so a transition (unknown -> revealed, apartment -> hospital) stays
 * historically visible for the deterministic engine to reason about later.
 * Nothing here infers, and nothing is written without evidence in StoryState.
 */

/** A pointer back into real StoryState content — never fabricated. */
export const evidenceRefSchema = z.object({
  scene_id: opt,
  scene_number: z.number().int().nullable().default(null),
  /** Which source field established this — e.g. "setting", "reveal". */
  field: opt,
  fact_id: opt,
  value: opt,
});
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;

/** Which mind the knowledge belongs to — character or audience. */
export const knowledgeHolderSchema = z.enum(["character", "reader"]);
export type KnowledgeHolder = z.infer<typeof knowledgeHolderSchema>;

export const knowledgeEventSchema = z.object({
  id: text,
  holder: knowledgeHolderSchema.default("character"),
  /** Canonical character id; null only when holder is "reader". */
  character_id: opt,
  /** What is known — free text subject, kept verbatim from the source. */
  subject: text,
  /** Canonical fact id when the subject is a recorded fact. */
  fact_id: opt,
  state: knowledgeStateSchema,
  scene_id: opt,
  scene_number: z.number().int().nullable().default(null),
  evidence: z.array(evidenceRefSchema).default([]),
});
export type KnowledgeEvent = z.infer<typeof knowledgeEventSchema>;

export const stateAspectSchema = z.enum([
  "location",
  "physical",
  "emotional",
  "social",
  "relationship",
]);
export type StateAspect = z.infer<typeof stateAspectSchema>;

export const characterStateEventSchema = z.object({
  id: text,
  character_id: text,
  aspect: stateAspectSchema,
  value: text,
  scene_id: opt,
  scene_number: z.number().int().nullable().default(null),
  evidence: z.array(evidenceRefSchema).default([]),
});
export type CharacterStateEvent = z.infer<typeof characterStateEventSchema>;

/** Per-character append-only history. Events are ordered by scene, then id. */
export const characterStateSchema = z.object({
  character_id: text,
  events: z.array(characterStateEventSchema).default([]),
  knowledge: z.array(knowledgeEventSchema).default([]),
});
export type CharacterState = z.infer<typeof characterStateSchema>;

export const characterSchema = z.object({
  id: text,
  name: text,
  role: opt,
  age: opt,
  appearance: opt,
  goal: opt,
  want: opt,
  need: opt,
  fear: opt,
  flaw: opt,
  secret: opt,
  motivation: opt,
  /** Relationship ids; the edges themselves live in relationships. */
  relationships: z.array(text).default([]),
  knowledge: z.array(characterKnowledgeSchema).default([]),
  emotional_state: opt,
  character_arc: opt,
});
export type StoryCharacter = z.infer<typeof characterSchema>;

/* ----------------------------------------------------------------- world */

export const worldSchema = z.object({
  locations: z.array(z.object({ id: text, name: text, description: opt })).default([]),
  environment: opt,
  /** Story rules the film may not contradict. */
  rules: z.array(text).default([]),
  objects: z.array(z.object({ id: text, name: text, significance: opt })).default([]),
  visual_details: z.array(text).default([]),
});

/* -------------------------------------------------------------- timeline */

export const timelineEventSchema = z.object({
  id: text,
  /** Story time as the film states it — never normalized into a real date. */
  story_time: opt,
  sequence: z.number().int().default(0),
  scene_number: z.number().int().nullable().default(null),
  characters: z.array(text).default([]),
  description: text,
});
export type TimelineEvent = z.infer<typeof timelineEventSchema>;

/* ----------------------------------------------------------------- facts */

export const storyFactSchema = z.object({
  id: text,
  statement: text,
  category: opt,
  source: factSourceSchema.default("ai_assumption"),
  created_at_scene: z.number().int().nullable().default(null),
  status: z.enum(["true", "changed", "retracted"]).default("true"),
  characters: z.array(text).default([]),
  locations: z.array(text).default([]),
  objects: z.array(text).default([]),
});
export type StoryFact = z.infer<typeof storyFactSchema>;

/* --------------------------------------------------------- relationships */

export const relationshipSchema = z.object({
  id: text,
  character_a: text,
  character_b: text,
  type: opt,
  state: opt,
  established_in_scene: z.number().int().nullable().default(null),
  changed_in_scene: z.number().int().nullable().default(null),
});

/* --------------------------------------------------------- open threads */

export const openThreadSchema = z.object({
  id: text,
  question: text,
  created_in_scene: z.number().int().nullable().default(null),
  status: threadStatusSchema.default("open"),
  priority: z.number().int().min(0).max(10).default(5),
  characters: z.array(text).default([]),
  facts: z.array(text).default([]),
  planned_payoff: opt,
});

/* --------------------------------------------------------------- payoffs */

export const payoffSchema = z.object({
  id: text,
  requirement: text,
  /** Setup references — scene numbers or planted clues. */
  setups: z.array(text).default([]),
  payoff_scene: z.number().int().nullable().default(null),
  status: payoffStatusSchema.default("planned"),
  thread_id: opt,
});

/* ---------------------------------------------------------------- scenes */

export const sceneStateSchema = z.object({
  id: text,
  scene_number: z.number().int().default(0),
  title: text,
  purpose: opt,
  conflict: opt,
  location: opt,
  time: opt,
  characters: z.array(text).default([]),
  objective: opt,
  action: opt,
  emotion: opt,
  revealed: opt,
  /** Internal only — never projected publicly. */
  hidden: opt,
  consequence: opt,
  facts_created: z.array(text).default([]),
  facts_changed: z.array(text).default([]),
  threads_created: z.array(text).default([]),
  threads_resolved: z.array(text).default([]),
  payoffs: z.array(text).default([]),
  /** The existing Scene Truth contract, untouched and still read by generation. */
  truth: z.custom<SceneTruth | null>().default(null),
  generation: z
    .object({
      status: z.enum(["idle", "queued", "processing", "completed", "failed"]),
      has_clip: z.boolean(),
      credit_cost: z.number().int(),
      clarity_verdict: z.enum(["clear", "risky", "unclear"]).nullable(),
      recovered: z.boolean(),
    })
    .nullable()
    .default(null),
});
export type SceneState = z.infer<typeof sceneStateSchema>;

/* ----------------------------------------------------------------- twist */

/**
 * A reference into the existing Plot Twist implementation. The library stays the
 * only twist engine; hidden truth is stored here for internal modules and is
 * stripped by the public projection.
 */
export const twistRefSchema = z.object({
  present: z.boolean().default(false),
  /** Library pattern id, for traceability back to the search layer. */
  pattern: opt,
  audience_assumption: opt,
  /** INTERNAL ONLY — never public before the reveal. */
  hidden_truth: opt,
  reveal_scene: z.number().int().nullable().default(null),
  reveal_type: opt,
  foreshadowing: z.array(text).default([]),
  red_herrings: z.array(text).default([]),
  payoff_requirements: z.array(text).default([]),
});

/* ------------------------------------------------------------ continuity */

export const continuitySchema = z.object({
  /** Written by a later Continuity Engine; empty here by design. */
  known_issues: z
    .array(z.object({ id: text, note: text, scenes: z.array(z.number()).default([]) }))
    .default([]),
  resolved_issues: z.array(text).default([]),
  last_validation: opt,
  affected_scenes: z.array(z.number().int()).default([]),
  /** Honest marker: nothing semantic has been validated in this phase. */
  validated: z.boolean().default(false),
});

/* ------------------------------------------------------------ generation */

export const generationStateSchema = z.object({
  /** Which StoryState version the rendered clips were based on. */
  based_on_version: opt,
  scenes_total: z.number().int().default(0),
  scenes_rendered: z.number().int().default(0),
  budget_credits: z.number().int().default(0),
});

/* -------------------------------------------------------------- version */

export const versionSchema = z.object({
  /** Contract version of this shape, bumped when the canonical shape changes. */
  schema: z.literal(1).default(1),
  /** Deterministic content identity — same content, same id. */
  id: text,
  derived_from: z.array(text).default([]),
  created_at: opt,
});

/* ------------------------------------------------------------ StoryState */

export const storyStateSchema = z.object({
  identity: identitySchema,
  story_dna: storyDnaSchema,
  film_bible: filmBibleRefSchema,
  characters: z.array(characterSchema).default([]),
  /** Phase 2.1 — append-only per-character state/knowledge history. */
  character_states: z.array(characterStateSchema).default([]),
  /** Phase 2.1 — flat append-only knowledge log (characters and reader). */
  knowledge_events: z.array(knowledgeEventSchema).default([]),
  world: worldSchema,
  timeline: z.array(timelineEventSchema).default([]),
  facts: z.array(storyFactSchema).default([]),
  relationships: z.array(relationshipSchema).default([]),
  open_threads: z.array(openThreadSchema).default([]),
  payoffs: z.array(payoffSchema).default([]),
  scenes: z.array(sceneStateSchema).default([]),
  twist: twistRefSchema,
  continuity: continuitySchema,
  generation: generationStateSchema,
  version: versionSchema,
});

export type StoryState = z.infer<typeof storyStateSchema>;

export function emptyStoryState(): StoryState {
  const state = storyStateSchema.parse({
    identity: {},
    story_dna: {},
    film_bible: {},
    world: {},
    twist: {},
    continuity: {},
    generation: {},
    version: { id: "" },
  });
  return { ...state, version: { ...state.version, id: versionId(state) } };
}

/* -------------------------------------------------------------- helpers */

const clean = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
};

const list = (values: (string | null | undefined)[] | null | undefined): string[] =>
  (values ?? []).map((v) => (v ?? "").trim()).filter(Boolean);

const slug = (value: string, fallback: string) => {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || fallback;
};

/** Stable 32-bit content hash — identity, never security. */
function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Version identity is content-only: the version block and the back-reference to
 * it are excluded, so recomputing the id of a finished state is stable.
 */
export function versionId(state: Omit<StoryState, "version"> | StoryState): string {
  const { version: _version, generation, ...rest } = state as StoryState;
  const content = { ...rest, generation: { ...generation, based_on_version: null } };
  return `v1.${hash(JSON.stringify(content))}`;
}

/* --------------------------------------------------------- normalization */

export type NormalizeInput = {
  film?: Partial<FilmView> | null;
  scenes?: FilmScene[] | null;
  film_model?: FilmModel | null;
  film_bible?: FilmBible | null;
  evolution?: Evolution | null;
  recommendation?: Recommendation | null;
  challenge?: Challenge | null;
};

function dna(input: NormalizeInput): StoryDNA {
  const bible = input.film_bible ?? null;
  const model = input.film_model ?? null;
  const rec = input.recommendation ?? null;
  const reality = input.challenge?.reality ?? null;

  const survive = list([
    reality?.execution?.emotional_core,
    ...(input.scenes ?? []).map((scene) => scene.truth?.what_must_survive ?? null),
    ...(bible?.decisions ?? []),
  ]);

  return storyDnaSchema.parse({
    premise: clean(bible?.premise ?? model?.story),
    logline: clean(rec?.logline ?? input.film?.logline),
    theme: clean(model?.audience),
    central_question: clean(model?.open_questions?.[0]),
    main_conflict: clean(rec?.central_conflict),
    stakes: clean(rec?.emotional_journey),
    emotional_core: clean(
      reality?.execution?.emotional_core ?? bible?.emotional_arc ?? model?.emotion,
    ),
    tone: clean(bible?.mood),
    genre: clean(input.film?.style ?? null),
    what_must_survive: Array.from(new Set(survive)),
    ending_intention: clean(bible?.ending ?? rec?.ending ?? model?.ending),
    story_promise: clean(input.evolution?.biggest_discovery),
  });
}

function characters(input: NormalizeInput): StoryCharacter[] {
  const fromFilm = (input.film?.characters ?? []).map((c) => ({
    name: (c.name ?? "").trim(),
    appearance: clean(c.look),
  }));
  const names = new Map<string, { name: string; appearance: string | null }>();
  for (const entry of fromFilm) if (entry.name) names.set(entry.name.toLowerCase(), entry);
  for (const raw of list(input.film_bible?.cast)) {
    const name = (raw.split(/[—-]/)[0] ?? "").trim() || raw;
    const key = name.toLowerCase();
    if (!names.has(key)) names.set(key, { name, appearance: clean(raw.slice(name.length)) });
  }

  return Array.from(names.values()).map((entry, index) =>
    characterSchema.parse({
      id: slug(entry.name, `character-${index + 1}`),
      name: entry.name,
      appearance: entry.appearance,
    }),
  );
}

function world(input: NormalizeInput) {
  const setting = clean(input.film_bible?.setting ?? input.film?.setting);
  return worldSchema.parse({
    locations: setting
      ? [{ id: slug(setting, "location-1"), name: setting, description: null }]
      : [],
    environment: clean(input.film_model?.world),
    rules: list(input.film_model?.continuity),
    objects: list(input.challenge?.reality?.anchors).map((name, i) => ({
      id: slug(name, `object-${i + 1}`),
      name,
      significance: null,
    })),
    visual_details: list([input.film_bible?.look, input.recommendation?.visual_direction]),
  });
}

function timeline(scenes: FilmScene[]): TimelineEvent[] {
  return scenes.map((scene) =>
    timelineEventSchema.parse({
      id: `scene-${scene.scene_number}`,
      story_time: clean(scene.truth?.time_period),
      sequence: scene.scene_number,
      scene_number: scene.scene_number,
      characters: list((scene.truth?.characters ?? "").split(/[,;]/)),
      description: clean(scene.truth?.action ?? scene.idea) ?? scene.title,
    }),
  );
}

function facts(input: NormalizeInput): StoryFact[] {
  return (input.film_model?.facts ?? [])
    .filter((fact) => (fact?.key ?? "").trim() && (fact?.value ?? "").trim())
    .map((fact, index) =>
      storyFactSchema.parse({
        id: slug(fact.key, `fact-${index + 1}`),
        statement: `${fact.key.trim()}: ${fact.value.trim()}`,
        category: clean(fact.key),
        source: fact.source,
      }),
    );
}

function threads(input: NormalizeInput) {
  const questions = list([
    ...(input.film_bible?.open_questions ?? []),
    ...(input.film_model?.open_questions ?? []),
  ]);
  return Array.from(new Set(questions)).map((question, index) =>
    openThreadSchema.parse({
      id: `thread-${index + 1}`,
      question,
      status: "open",
      priority: 5,
    }),
  );
}

function payoffs(input: NormalizeInput, scenes: FilmScene[]) {
  const twist = input.film_bible?.twist ?? null;
  if (!twist) return [];
  const revealScene =
    scenes.find((scene) => (scene.truth?.reveal ?? "").trim())?.scene_number ?? null;
  return [
    payoffSchema.parse({
      id: "payoff-twist",
      requirement: clean(twist.reveal) ?? "The audience understands the turn.",
      setups: list(twist.foreshadowing),
      payoff_scene: revealScene,
      status: revealScene ? "set_up" : "planned",
      thread_id: null,
    }),
  ];
}

function sceneStates(scenes: FilmScene[]): SceneState[] {
  return scenes.map((scene) => {
    const truth = scene.truth ?? null;
    return sceneStateSchema.parse({
      id: scene.id,
      scene_number: scene.scene_number,
      title: scene.title,
      purpose: clean(truth?.emotional_core),
      conflict: clean(truth?.what_must_survive),
      location: clean(truth?.setting),
      time: clean(truth?.time_period),
      characters: list((truth?.characters ?? "").split(/[,;]/)),
      objective: clean(truth?.chosen_execution),
      action: clean(truth?.action ?? scene.idea),
      emotion: clean(truth?.emotional_core),
      revealed: clean(truth?.reveal),
      hidden: clean(truth?.twist),
      consequence: clean(truth?.continuity),
      facts_created: [],
      facts_changed: [],
      threads_created: [],
      threads_resolved: [],
      payoffs: truth?.reveal ? ["payoff-twist"] : [],
      truth,
      generation: {
        status: scene.status,
        has_clip: Boolean(scene.video_url),
        credit_cost: scene.credit_cost,
        clarity_verdict: scene.clarity_verdict,
        recovered: scene.recovery?.outcome === "generated",
      },
    });
  });
}

/**
 * PHASE 2.1 normalization — derive character state and knowledge events from
 * what scenes explicitly establish. Rules:
 *  - a scene's Scene Truth `setting` places the characters that scene names,
 *  - a scene's Scene Truth `reveal` makes that subject "revealed" for those
 *    characters and for the reader,
 *  - names are resolved to canonical character ids; an unresolved name produces
 *    nothing (the continuity engine already reports unknown cast members),
 *  - nothing else is inferred, and no event is written without evidence.
 * Output is append-only and deterministically ordered by scene, then by id.
 */
function characterHistory(
  scenes: FilmScene[],
  cast: StoryCharacter[],
): { character_states: CharacterState[]; knowledge_events: KnowledgeEvent[] } {
  const byName = new Map(cast.map((c) => [c.name.toLowerCase(), c.id] as const));
  const resolve = (raw: string): string | null => byName.get(raw.trim().toLowerCase()) ?? null;

  const stateEvents: CharacterStateEvent[] = [];
  const knowledge: KnowledgeEvent[] = [];

  for (const scene of scenes) {
    const truth = scene.truth ?? null;
    if (!truth) continue;
    const present = list((truth.characters ?? "").split(/[,;]/))
      .map(resolve)
      .filter((id): id is string => Boolean(id));
    const setting = clean(truth.setting);
    const reveal = clean(truth.reveal);

    if (setting) {
      for (const id of present) {
        stateEvents.push(
          characterStateEventSchema.parse({
            id: `state-${id}-location-${scene.scene_number}`,
            character_id: id,
            aspect: "location",
            value: setting,
            scene_id: scene.id,
            scene_number: scene.scene_number,
            evidence: [
              {
                scene_id: scene.id,
                scene_number: scene.scene_number,
                field: "setting",
                value: setting,
              },
            ],
          }),
        );
      }
    }

    if (reveal) {
      const evidence = [
        {
          scene_id: scene.id,
          scene_number: scene.scene_number,
          field: "reveal",
          value: reveal,
        },
      ];
      for (const id of present) {
        knowledge.push(
          knowledgeEventSchema.parse({
            id: `knowledge-character-${id}-${scene.scene_number}-${hash(reveal)}`,
            holder: "character",
            character_id: id,
            subject: reveal,
            state: "revealed",
            scene_id: scene.id,
            scene_number: scene.scene_number,
            evidence,
          }),
        );
      }
      knowledge.push(
        knowledgeEventSchema.parse({
          id: `knowledge-reader-${scene.scene_number}-${hash(reveal)}`,
          holder: "reader",
          character_id: null,
          subject: reveal,
          state: "revealed",
          scene_id: scene.id,
          scene_number: scene.scene_number,
          evidence,
        }),
      );
    }
  }

  const order = <T extends { id: string; scene_number: number | null }>(events: T[]) =>
    events
      .slice()
      .sort((a, b) => (a.scene_number ?? 0) - (b.scene_number ?? 0) || a.id.localeCompare(b.id));

  const orderedStates = order(stateEvents);
  const orderedKnowledge = order(knowledge);

  const ids = Array.from(
    new Set([
      ...orderedStates.map((e) => e.character_id),
      ...orderedKnowledge.map((e) => e.character_id ?? ""),
    ]),
  )
    .filter(Boolean)
    .sort();

  return {
    character_states: ids.map((id) =>
      characterStateSchema.parse({
        character_id: id,
        events: orderedStates.filter((e) => e.character_id === id),
        knowledge: orderedKnowledge.filter((e) => e.character_id === id),
      }),
    ),
    knowledge_events: orderedKnowledge,
  };
}

function twistRef(input: NormalizeInput, scenes: FilmScene[]) {
  const twist: Twist | null = input.film_bible?.twist ?? null;
  if (!twist) return twistRefSchema.parse({});
  return twistRefSchema.parse({
    present: true,
    pattern: clean(twist.pattern),
    audience_assumption: clean(twist.visual_clue),
    hidden_truth: clean(twist.statement),
    reveal_scene: scenes.find((s) => (s.truth?.reveal ?? "").trim())?.scene_number ?? null,
    reveal_type: clean(twist.pattern?.split(".")[0] ?? null),
    foreshadowing: list(twist.foreshadowing),
    red_herrings: [],
    payoff_requirements: list([twist.reveal, twist.ending_implication]),
  });
}

/**
 * Build the canonical StoryState from what already exists. Missing or legacy
 * records produce empty structures — never invented content.
 */
export function normalizeStoryState(input: NormalizeInput): StoryState {
  const scenes = (input.scenes ?? []).slice().sort((a, b) => a.scene_number - b.scene_number);
  const bible = input.film_bible ?? null;

  const derived = [
    input.film ? "film" : "",
    scenes.length ? "scenes" : "",
    input.film_model ? "film_model" : "",
    bible ? "film_bible" : "",
    input.challenge ? "challenge" : "",
    input.evolution ? "evolution" : "",
    input.recommendation ? "recommendation" : "",
  ].filter(Boolean);

  const cast = characters(input);
  const history = characterHistory(scenes, cast);

  const content = {
    identity: identitySchema.parse({
      story_id: clean(input.film?.id),
      director_session_id: clean(input.film?.director_session_id),
      title: clean(bible?.title ?? input.film?.title) ?? "",
      style: clean(input.film?.style) ?? "",
      created_at: clean(input.film?.created_at),
    }),
    story_dna: dna(input),
    film_bible: filmBibleRefSchema.parse({
      present: Boolean(bible),
      cast: list(bible?.cast),
      setting: clean(bible?.setting ?? input.film?.setting),
      mood: clean(bible?.mood),
      look: clean(bible?.look),
      camera: clean(bible?.camera),
      ending_intention: clean(bible?.ending),
      has_twist: Boolean(bible?.twist),
    }),
    characters: cast,
    ...history,
    world: world(input),
    timeline: timeline(scenes),
    facts: facts(input),
    relationships: [],
    open_threads: threads(input),
    payoffs: payoffs(input, scenes),
    scenes: sceneStates(scenes),
    twist: twistRef(input, scenes),
    continuity: continuitySchema.parse({
      affected_scenes: scenes
        .filter((scene) => scene.clarity_verdict && scene.clarity_verdict !== "clear")
        .map((scene) => scene.scene_number),
      validated: false,
    }),
    generation: generationStateSchema.parse({
      based_on_version: null,
      scenes_total: scenes.length,
      scenes_rendered: scenes.filter((scene) => scene.video_url).length,
      budget_credits: scenes.reduce((sum, scene) => sum + (scene.credit_cost || 0), 0),
    }),
  };

  const id = versionId(content as unknown as StoryState);
  return storyStateSchema.parse({
    ...content,
    generation: { ...content.generation, based_on_version: id },
    version: versionSchema.parse({ schema: 1, id, derived_from: derived, created_at: null }),
  });
}

/** Read a persisted StoryState safely; unknown or legacy shapes become null. */
export function readStoryState(value: unknown): StoryState | null {
  if (!value || typeof value !== "object") return null;
  const parsed = storyStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/* ------------------------------------------------------ public projection */

export type PublicStoryState = {
  title: string;
  logline: string | null;
  style: string;
  scene_count: number;
  scenes_rendered: number;
  scenes: { scene_number: number; title: string; has_clip: boolean }[];
};

/**
 * The ONLY shape allowed to reach a browser. Hidden truth, facts, provenance,
 * threads, internal ids, provider/job data and credit information never cross
 * this boundary.
 */
export function publicStoryState(state: StoryState): PublicStoryState {
  return {
    title: state.identity.title,
    logline: state.story_dna.logline,
    style: state.identity.style,
    scene_count: state.scenes.length,
    scenes_rendered: state.generation.scenes_rendered,
    scenes: state.scenes.map((scene) => ({
      scene_number: scene.scene_number,
      title: scene.title,
      has_clip: Boolean(scene.generation?.has_clip),
    })),
  };
}

/** Re-export so callers normalize Scene Truth through one place. */
export { readSceneTruth };
