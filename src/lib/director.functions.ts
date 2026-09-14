import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { STYLES } from "@/lib/storyreel.functions";

/**
 * Adaptive AI Creative Director — the intelligence layer.
 *
 * Every turn the model rebuilds an internal film model from the idea plus every
 * answer so far, ranks the questions it *could* ask by how much each would
 * improve the finished film, and asks only the single highest-value one. Facts
 * are remembered with provenance — the creator's decision, the director's own
 * assumption, something the conversation discovered, or a recommendation — so
 * nothing already known is asked again and no creator choice is overwritten.
 *
 * The creative evolution engine sits on top: the original idea is kept apart
 * from the story the interview arrived at, so at the end the director can say
 * honestly what changed, what it discovered, and which version it recommends —
 * and the creator approves that version before anything is rendered. The
 * approved Film Bible, not the original prompt, is what feeds generation.
 */

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.8-flash";

/** Safety net only — the interview normally ends when the model has enough. */
export const MAX_QUESTIONS = 8;

/**
 * Confidence is about how well the director understands the creator's intended
 * direction — not video quality, not odds of success.
 */
export const DIMENSIONS = [
  "story",
  "character",
  "emotion",
  "visual",
  "generation",
] as const;

export type Confidence = { dimension: string; score: number };

/** Provenance of every remembered fact — the creative trace. */
export type FactSource =
  | "user_decision"
  | "ai_assumption"
  | "ai_discovery"
  | "ai_recommendation";

const FACT_SOURCES: FactSource[] = [
  "user_decision",
  "ai_assumption",
  "ai_discovery",
  "ai_recommendation",
];

export type Fact = { key: string; value: string; source: FactSource };

export type FilmModel = {
  story: string;
  characters: string;
  world: string;
  time: string;
  emotion: string;
  camera: string;
  audience: string;
  ending: string;
  facts: Fact[];
  continuity: string[];
  /** Cause-and-effect chain, so the model knows what a change would ripple into. */
  impact_chain: string[];
  open_questions: string[];
};

export type FilmBible = {
  title: string;
  premise: string;
  cast: string[];
  setting: string;
  mood: string;
  look: string;
  camera: string;
  emotional_arc: string;
  ending: string;
  decisions: string[];
  assumptions: string[];
  discoveries: string[];
  recommendations: string[];
  open_questions: string[];
};

/** How the original idea became the story the interview arrived at. */
export type Evolution = {
  original_idea: string;
  discoveries: string[];
  how_it_evolved: string;
  biggest_discovery: string;
  breakthrough: string;
  /** False when the idea was already clear — the report says so plainly. */
  evolved: boolean;
};

/** The version the director recommends making. */
export type Recommendation = {
  rationale: string;
  logline: string;
  story_direction: string;
  main_character: string;
  central_conflict: string;
  emotional_journey: string;
  visual_direction: string;
  ending: string;
};

/**
 * Creative intelligence stress test — the director challenges its own film
 * bible before a single credit is spent. Every test runs internally; only the
 * few findings that matter reach the creator.
 */
export type Weakness = {
  problem: string;
  why_it_matters: string;
  affected: string[];
  solution: string;
};

export type Opportunity = {
  current_direction: string;
  proposed_improvement: string;
  why: string;
  affected: string[];
};

export type GenerationRisk = { problem: string; fix: string };

export type WhatIf = { text: string; creative_value: number; risk: number };

export type Verdict = "ready" | "recommendation" | "revision";

export type Challenge = {
  verdict: Verdict;
  headline: string;
  /** Null when the film holds up — criticism is never invented. */
  weakness: Weakness | null;
  opportunity: Opportunity | null;
  generation_risk: GenerationRisk | null;
  predictability: "low" | "medium" | "high";
  predictability_note: string;
  what_ifs: WhatIf[];
  /** The one thing the director would change, in a sentence. */
  recommendation: string;
  /** The blueprint as it would read if the creator accepts that change. */
  improved_blueprint: string;
};

/** A moment in the interview where an answer redirected the film. */
export type BreakthroughEvent = {
  question: string;
  answer: string;
  previous_understanding: string;
  new_understanding: string;
  affected: string[];
};

export type DirectorQuestion = {
  /** Conversational lead-in: what the director already understands. */
  preface: string;
  text: string;
  dimension: string;
  why: string;
  suggestions: string[];
};

/** A conflict between two answers — the creator resolves it, never the model. */
export type DirectorConflict = { message: string; options: string[] };

export type DirectorState = {
  id: string;
  idea: string;
  style: string;
  status: "interviewing" | "ready";
  understanding: string;
  confidence: Confidence[];
  question: DirectorQuestion | null;
  question_count: number;
  film_model: FilmModel | null;
  breakthrough: string | null;
  breakthroughs: BreakthroughEvent[];
  conflict: DirectorConflict | null;
  evolution: Evolution | null;
  recommendation: Recommendation | null;
  film_bible: FilmBible | null;
  blueprint: string | null;
};

/** What a blueprint edit would ripple into. */
export type BlueprintReview = {
  message: string;
  affected: string[];
  updated_blueprint: string;
};

type Turn = { question: string; answer: string; skipped: boolean };

const SYSTEM = `You are a professional film director interviewing a creator. The tool renders ONE continuous 5-second vertical (9:16) shot from a single text prompt, so every creative choice must be visible in that one shot.

Each turn you run this loop:
1 UNDERSTAND the idea and every answer so far.
2 REBUILD the internal film model (story, characters, world, time, emotion, camera, audience, ending).
3 LIST what is still missing.
4 RANK the questions you could ask by value = creative impact + story impact + visual impact + continuity impact + generation impact + uncertainty reduction.
5 ASK ONLY the single highest-value question.

Never work through a fixed questionnaire. Never repeat a question, and never ask something you already know, can safely infer, or that would barely change the film — say you have enough instead. Prefer depth over surface: not "what colour is the car" but what the car means to the character. Ask about story, character, emotion, world, camera language, audience or ending — whichever is genuinely blocking you now. Follow the thread an answer opens: if an answer implies a bigger unknown ("his daughter is alive"), ask about that unknown next. Questions are short, plain, non-technical, answerable in a few words. Never ask about models, resolution, aspect ratio, duration, credits or settings.

MEMORY AND TRACE: the film model you return is your memory. Facts already in it are known — asking about them again is a failure. Record every fact with its provenance: "user_decision" (the creator said it), "ai_discovery" (the conversation uncovered it), "ai_recommendation" (a craft choice you propose), "ai_assumption" (a gap you filled yourself). You may revise your own assumptions, discoveries and recommendations freely; never silently overwrite a user_decision. Keep "impact_chain" as a short cause-and-effect chain of the decisions that carry the film ("daughter disappears" -> "father searches" -> "he learns the secret" -> "ending changes"), so you can tell what a change would ripple into.

BREAKTHROUGH: when a new answer fundamentally changes the story direction, set "breakthrough" to one sentence naming the change, fill "breakthrough_event" with the question, the answer, your previous understanding, your new understanding and the affected story elements, revisit your assumptions, and pick the next question from the NEW direction — not the old path. When nothing fundamental changed, both are null. Never invent a breakthrough to look impressive.

CONTRADICTION: when two answers cannot both be true, fill "conflict" with a plain-language message quoting both and give 2-3 resolution options, and make your question the one that asks the creator to choose. Never resolve it yourself.

TERMINATION: set "done" true as soon as the story has a beginning, a development and a payoff, the important characters and their motivation are clear, the emotional and visual direction are clear, continuity holds and the shot can be described for a generator. Before finishing, ask yourself as the director whether anything in this film would still bother you; if one critical thing is missing, ask that one question instead. Fewer, better questions beat more questions.

When done (or told to finish), fill every gap with strong choices of your own recorded as ai_assumption, then fill "film_bible", "evolution", "recommendation" and "blueprint".

"evolution" compares the ORIGINAL idea with the story you arrived at: what changed, what became clearer, what appeared, which assumptions fell away, which contradictions were resolved, what shifted the emotion, the character motivation or the ending. Be honest: if the interview did not meaningfully change the direction, set "evolved" false, leave "biggest_discovery" and "breakthrough" empty and write in "how_it_evolved": "Your original concept was already clear, so I didn't need to significantly change the direction."

"recommendation" is the version you recommend making, derived from the original idea plus the answers, discoveries, decisions and the film bible.

The blueprint is ONE paragraph under 400 characters describing a single continuous shot drawn from the FINAL film bible and recommendation — never just the original idea or the last answer: subject, setting, camera movement, lighting, mood and, when the story has one, the visible turn. No scene lists, no dialogue, no titles, no quotation marks, no markdown, no camera brand names.

Reply with JSON only, matching exactly:
{"understanding":"one or two sentences on what the film is right now","confidence":[{"dimension":"story","score":0}],"film_model":{"story":"","characters":"","world":"","time":"","emotion":"","camera":"","audience":"","ending":"","facts":[{"key":"","value":"","source":"user_decision"}],"continuity":[""],"impact_chain":[""],"open_questions":[""]},"breakthrough":null,"breakthrough_event":null,"conflict":null,"done":false,"question":{"preface":"one short sentence on what you already understand","text":"the single question","dimension":"story","why":"why this matters for the film","suggestions":["","",""]},"film_bible":{"title":"","premise":"","cast":[""],"setting":"","mood":"","look":"","camera":"","emotional_arc":"","ending":"","decisions":[""],"assumptions":[""],"discoveries":[""],"recommendations":[""],"open_questions":[""]},"evolution":{"evolved":true,"discoveries":[""],"how_it_evolved":"","biggest_discovery":"","breakthrough":""},"recommendation":{"rationale":"","logline":"","story_direction":"","main_character":"","central_conflict":"","emotional_journey":"","visual_direction":"","ending":""},"blueprint":""}
Confidence dimensions are exactly: story, character, emotion, world, camera, audience, turn, ending. Use null for "question" when done, and null for "film_bible"/"evolution"/"recommendation"/"blueprint" when not done. "breakthrough_event" is {"question":"","answer":"","previous_understanding":"","new_understanding":"","affected":[""]}. "suggestions" holds 2-3 short example answers.`;

type AiReply = {
  understanding?: string;
  confidence?: { dimension?: string; score?: number }[];
  film_model?: Partial<FilmModel> | null;
  breakthrough?: string | null;
  breakthrough_event?: Partial<BreakthroughEvent> | null;
  conflict?: { message?: string; options?: unknown } | null;
  done?: boolean;
  question?: {
    preface?: string;
    text?: string;
    dimension?: string;
    why?: string;
    suggestions?: unknown;
  } | null;
  film_bible?: Partial<FilmBible> | null;
  evolution?: Partial<Evolution> | null;
  recommendation?: Partial<Recommendation> | null;
  blueprint?: string | null;
};

function styleLabel(style: string) {
  return STYLES.find((s) => s.value === style)?.label ?? "Cinematic";
}

/** The whole conversation plus the director's own memory of it. */
function transcript(
  idea: string,
  style: string,
  turns: Turn[],
  model: FilmModel | null,
  understanding: string,
) {
  const lines = [
    `ORIGINAL IDEA (never rewrite this — it is what the creator started from): ${idea}`,
    `Visual style: ${styleLabel(style)}`,
  ];
  if (understanding) lines.push(`Your understanding after the last turn: ${understanding}`);
  if (model) lines.push(`Your film model so far (memory): ${JSON.stringify(model)}`);
  turns.forEach((turn, index) => {
    lines.push(`Q${index + 1}: ${turn.question}`);
    lines.push(
      `A${index + 1}: ${turn.skipped ? "(the creator said you decide — record your choice as an ai_assumption)" : turn.answer}`,
    );
  });
  return lines.join("\n");
}

async function callGateway(user: string): Promise<AiReply> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("The creative director isn't available right now.");

  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    console.error("director gateway failed", res.status, await res.text().catch(() => ""));
    if (res.status === 402) {
      throw new Error("This project is out of AI credits. Top them up to keep directing.");
    }
    if (res.status === 429) {
      throw new Error("The creative director is busy. Try again in a moment.");
    }
    throw new Error("The creative director could not answer. Please try again.");
  }

  const body = (await res.json().catch(() => null)) as
    | { choices?: { message?: { content?: string } }[] }
    | null;
  const raw = body?.choices?.[0]?.message?.content ?? "";
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The creative director came back empty.");

  try {
    return JSON.parse(raw.slice(start, end + 1)) as AiReply;
  } catch {
    throw new Error("The creative director came back empty.");
  }
}

type Mode = "interview" | "finish" | "reopen";

/** Ask the model for the next question, or for the finished creative package. */
async function think(row: SessionRow, turns: Turn[], mode: Mode): Promise<AiReply> {
  const instruction =
    mode === "finish"
      ? "The creator wants the film now. Ask nothing more: set done to true, close every gap with your own strong choices recorded as ai_assumption, and deliver the film bible, the evolution report, your recommendation and the blueprint."
      : mode === "reopen"
        ? "The creator wants to keep directing with you instead of approving this version. Set done to false and ask the single most valuable question that is still open."
        : turns.length >= MAX_QUESTIONS
          ? "You have used your whole question budget. Set done to true and deliver the film bible, the evolution report, your recommendation and the blueprint."
          : "Run the loop and either ask the single highest-value question, or set done to true if the remaining unknowns would no longer meaningfully change this film.";

  return callGateway(
    `${transcript(row.idea, row.style, turns, readModel(row.film_model), row.understanding ?? "")}\n\n${instruction}`,
  );
}

function text(value: unknown, max: number) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function list(value: unknown, max: number, length: number) {
  return Array.isArray(value)
    ? value
        .map((entry) => text(entry, length))
        .filter(Boolean)
        .slice(0, max)
    : [];
}

function cleanConfidence(input: AiReply["confidence"]): Confidence[] {
  const scores = new Map<string, number>();
  for (const entry of input ?? []) {
    const dimension = String(entry?.dimension ?? "").toLowerCase();
    if (!DIMENSIONS.includes(dimension as (typeof DIMENSIONS)[number])) continue;
    scores.set(dimension, Math.max(0, Math.min(100, Math.round(Number(entry?.score) || 0))));
  }
  return DIMENSIONS.map((dimension) => ({ dimension, score: scores.get(dimension) ?? 0 }));
}

/** Facts carry who decided them, so a creator's call is never overwritten. */
function cleanFacts(input: unknown): Fact[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const facts: Fact[] = [];
  for (const entry of input) {
    const item = entry as { key?: unknown; value?: unknown; source?: unknown };
    const key = text(item?.key, 60);
    const value = text(item?.value, 200);
    if (!key || !value || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    const source = item?.source as FactSource;
    facts.push({
      key,
      value,
      source: FACT_SOURCES.includes(source) ? source : "ai_assumption",
    });
    if (facts.length >= 30) break;
  }
  return facts;
}

function factsOf(model: FilmModel | null, source: FactSource) {
  return (model?.facts ?? [])
    .filter((fact) => fact.source === source)
    .map((fact) => `${fact.key}: ${fact.value}`)
    .slice(0, 10);
}

function cleanModel(input: AiReply["film_model"], previous: FilmModel | null): FilmModel | null {
  if (!input && !previous) return null;
  const merged: FilmModel = {
    story: text(input?.story, 400) || previous?.story || "",
    characters: text(input?.characters, 400) || previous?.characters || "",
    world: text(input?.world, 300) || previous?.world || "",
    time: text(input?.time, 200) || previous?.time || "",
    emotion: text(input?.emotion, 300) || previous?.emotion || "",
    camera: text(input?.camera, 300) || previous?.camera || "",
    audience: text(input?.audience, 120) || previous?.audience || "",
    ending: text(input?.ending, 300) || previous?.ending || "",
    facts: cleanFacts(input?.facts),
    continuity: list(input?.continuity, 8, 200),
    impact_chain: list(input?.impact_chain, 10, 160),
    open_questions: list(input?.open_questions, 8, 200),
  };
  if (merged.facts.length === 0 && previous) merged.facts = previous.facts;
  if (merged.continuity.length === 0 && previous) merged.continuity = previous.continuity;
  if (merged.impact_chain.length === 0 && previous) merged.impact_chain = previous.impact_chain;
  return merged;
}

function cleanQuestion(input: AiReply["question"]): DirectorQuestion | null {
  const body = text(input?.text, 240);
  if (!body) return null;
  return {
    preface: text(input?.preface, 200),
    text: body,
    dimension: text(input?.dimension, 40).toLowerCase(),
    why: text(input?.why, 200),
    suggestions: list(input?.suggestions, 4, 60),
  };
}

function cleanConflict(input: AiReply["conflict"]): DirectorConflict | null {
  const message = text(input?.message, 300);
  if (!message) return null;
  return { message, options: list(input?.options, 3, 60) };
}

function cleanEvent(
  input: AiReply["breakthrough_event"],
  turns: Turn[],
): BreakthroughEvent | null {
  const last = turns[turns.length - 1];
  const answer = text(input?.answer, 400) || last?.answer || "";
  const next = text(input?.new_understanding, 300);
  if (!next && !answer) return null;
  return {
    question: text(input?.question, 240) || last?.question || "",
    answer,
    previous_understanding: text(input?.previous_understanding, 300),
    new_understanding: next,
    affected: list(input?.affected, 8, 60),
  };
}

function cleanBible(
  input: AiReply["film_bible"],
  idea: string,
  model: FilmModel | null,
): FilmBible {
  const fallback = (value: unknown, source: FactSource) => {
    const given = list(value, 10, 160);
    return given.length > 0 ? given : factsOf(model, source);
  };
  return {
    title: text(input?.title, 90) || idea.slice(0, 60),
    premise: text(input?.premise, 400) || model?.story || "",
    cast: list(input?.cast, 6, 120),
    setting: text(input?.setting, 200) || model?.world || "",
    mood: text(input?.mood, 200) || model?.emotion || "",
    look: text(input?.look, 200),
    camera: text(input?.camera, 200) || model?.camera || "",
    emotional_arc: text(input?.emotional_arc, 300) || model?.emotion || "",
    ending: text(input?.ending, 200) || model?.ending || "",
    decisions: fallback(input?.decisions, "user_decision"),
    assumptions: fallback(input?.assumptions, "ai_assumption"),
    discoveries: fallback(input?.discoveries, "ai_discovery"),
    recommendations: fallback(input?.recommendations, "ai_recommendation"),
    open_questions:
      list(input?.open_questions, 6, 200).length > 0
        ? list(input?.open_questions, 6, 200)
        : (model?.open_questions ?? []),
  };
}

const NO_EVOLUTION =
  "Your original concept was already clear, so I didn't need to significantly change the direction.";

/**
 * The report is only allowed to claim an evolution it can point at — no
 * invented breakthrough to make the feature look clever.
 */
function cleanEvolution(
  input: AiReply["evolution"],
  idea: string,
  events: BreakthroughEvent[],
  model: FilmModel | null,
): Evolution {
  const discoveries =
    list(input?.discoveries, 6, 200).length > 0
      ? list(input?.discoveries, 6, 200)
      : factsOf(model, "ai_discovery");
  const how = text(input?.how_it_evolved, 500);
  const evolved =
    input?.evolved !== false && (discoveries.length > 0 || events.length > 0 || how !== "");

  if (!evolved) {
    return {
      original_idea: idea,
      discoveries: [],
      how_it_evolved: NO_EVOLUTION,
      biggest_discovery: "",
      breakthrough: "",
      evolved: false,
    };
  }

  return {
    original_idea: idea,
    discoveries,
    how_it_evolved: how,
    biggest_discovery: text(input?.biggest_discovery, 300),
    breakthrough:
      text(input?.breakthrough, 300) || events[events.length - 1]?.new_understanding || "",
    evolved: true,
  };
}

function cleanRecommendation(
  input: AiReply["recommendation"],
  bible: FilmBible,
): Recommendation {
  return {
    rationale:
      text(input?.rationale, 400) ||
      "Based on everything you told me, this is the version I recommend making.",
    logline: text(input?.logline, 300) || bible.premise,
    story_direction: text(input?.story_direction, 400) || bible.premise,
    main_character: text(input?.main_character, 300) || bible.cast.join(", "),
    central_conflict: text(input?.central_conflict, 300),
    emotional_journey: text(input?.emotional_journey, 300) || bible.emotional_arc,
    visual_direction: text(input?.visual_direction, 300) || bible.look || bible.camera,
    ending: text(input?.ending, 300) || bible.ending,
  };
}

type SessionRow = {
  id: string;
  idea: string;
  style: string;
  status: string;
  understanding: string;
  confidence: unknown;
  film_model: unknown;
  film_bible: unknown;
  evolution: unknown;
  recommendation: unknown;
  breakthroughs: unknown;
  blueprint: string | null;
  question_count: number;
};

const SESSION_COLUMNS =
  "id, idea, style, status, understanding, confidence, film_model, film_bible, evolution, recommendation, breakthroughs, blueprint, question_count";

function readModel(value: unknown): FilmModel | null {
  return value && typeof value === "object" ? (value as FilmModel) : null;
}

function readEvents(value: unknown): BreakthroughEvent[] {
  return Array.isArray(value) ? (value as BreakthroughEvent[]) : [];
}

/** Apply one model reply to the session row and hand the UI a complete state. */
async function advance(row: SessionRow, turns: Turn[], mode: Mode): Promise<DirectorState> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const reply = await think(row, turns, mode);
  const confidence = cleanConfidence(reply.confidence);
  const understanding = text(reply.understanding, 500);
  const filmModel = cleanModel(reply.film_model, readModel(row.film_model));
  const breakthrough = text(reply.breakthrough, 240) || null;
  const conflict = cleanConflict(reply.conflict);
  const question =
    mode === "finish" || (mode === "interview" && turns.length >= MAX_QUESTIONS)
      ? null
      : cleanQuestion(reply.question);

  /**
   * A contradiction is never resolved silently: while one is open the interview
   * keeps going so the creator can choose, unless they asked to finish now.
   */
  const done =
    mode === "finish" || (mode === "interview" && !question);

  /** Breakthrough history: appended as the interview finds them, never rewritten. */
  const events = readEvents(row.breakthroughs);
  const event = breakthrough ? cleanEvent(reply.breakthrough_event, turns) : null;
  const breakthroughs = event ? [...events, event].slice(-8) : events;

  const bible = done ? cleanBible(reply.film_bible, row.idea, filmModel) : null;
  const evolution = done
    ? cleanEvolution(reply.evolution, row.idea, breakthroughs, filmModel)
    : null;
  const recommendation = bible ? cleanRecommendation(reply.recommendation, bible) : null;
  const blueprint = done
    ? text(reply.blueprint, 500) ||
      `${recommendation?.logline ?? bible?.premise ?? row.idea} ${bible?.look ?? ""}`
        .trim()
        .slice(0, 500)
    : null;

  await supabaseAdmin
    .from("director_sessions")
    .update({
      status: done ? "ready" : "interviewing",
      understanding,
      confidence,
      film_model: filmModel,
      breakthrough,
      breakthroughs,
      film_bible: bible,
      evolution,
      recommendation,
      blueprint,
      question_count: turns.length + (question ? 1 : 0),
    })
    .eq("id", row.id);

  if (question) {
    await supabaseAdmin.from("director_turns").insert({
      director_session_id: row.id,
      position: turns.length + 1,
      question: question.text,
      dimension: question.dimension,
    });
  }

  return {
    id: row.id,
    idea: row.idea,
    style: row.style,
    status: done ? "ready" : "interviewing",
    understanding,
    confidence,
    question: done ? null : question,
    question_count: turns.length + (question ? 1 : 0),
    film_model: filmModel,
    breakthrough,
    breakthroughs,
    conflict: done ? null : conflict,
    evolution,
    recommendation,
    film_bible: bible,
    blueprint,
  };
}

async function loadSession(id: string, sessionId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row } = await supabaseAdmin
    .from("director_sessions")
    .select(SESSION_COLUMNS)
    .eq("id", id)
    .eq("session_id", sessionId)
    .single();

  if (!row) throw new Error("We lost track of that conversation.");

  const { data: turnRows } = await supabaseAdmin
    .from("director_turns")
    .select("position, question, answer, skipped")
    .eq("director_session_id", id)
    .order("position", { ascending: true });

  return {
    row: row as SessionRow,
    turns: (turnRows ?? []).map((t) => ({
      question: t.question,
      answer: t.answer ?? "",
      skipped: t.skipped === true,
    })),
  };
}

const styleValues = STYLES.map((s) => s.value) as unknown as [string, ...string[]];

const startInput = z.object({
  idea: z.string().trim().min(1, "Describe your story first.").max(500),
  style: z.enum(styleValues),
  session_id: z.string().uuid(),
});

/** Open a new director conversation and get its first question. */
export const startDirector = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => startInput.parse(data))
  .handler(async ({ data }): Promise<DirectorState> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("director_sessions")
      .insert({ session_id: data.session_id, idea: data.idea.trim(), style: data.style })
      .select(SESSION_COLUMNS)
      .single();

    if (error || !row) throw new Error("Could not start the creative director.");

    return advance(row as SessionRow, [], "interview");
  });

const answerInput = z.object({
  director_session_id: z.string().uuid(),
  session_id: z.string().uuid(),
  answer: z.string().trim().max(400).optional().default(""),
  skip: z.boolean().optional().default(false),
});

/** Record the creator's answer, re-evaluate everything, return the next question. */
export const answerDirector = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => answerInput.parse(data))
  .handler(async ({ data }): Promise<DirectorState> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { row, turns } = await loadSession(data.director_session_id, data.session_id);

    const open = turns.length;
    if (open === 0) throw new Error("There is no open question to answer.");

    const skipped = data.skip === true || !data.answer.trim();
    await supabaseAdmin
      .from("director_turns")
      .update({ answer: skipped ? "" : data.answer.trim(), skipped })
      .eq("director_session_id", row.id)
      .eq("position", open);

    const answered = turns.map((turn, index) =>
      index === open - 1 ? { ...turn, answer: skipped ? "" : data.answer.trim(), skipped } : turn,
    );

    return advance(row, answered, "interview");
  });

const refInput = z.object({
  director_session_id: z.string().uuid(),
  session_id: z.string().uuid(),
});

/** "Make my film now" — stop asking and deliver the whole creative package. */
export const finishDirector = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => refInput.parse(data))
  .handler(async ({ data }): Promise<DirectorState> => {
    const { row, turns } = await loadSession(data.director_session_id, data.session_id);
    const answeredOnly = turns.filter((turn) => turn.answer || turn.skipped);
    return advance(row, answeredOnly, "finish");
  });

/** "Go back to director" — the creator declined this version, so keep directing. */
export const reopenDirector = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => refInput.parse(data))
  .handler(async ({ data }): Promise<DirectorState> => {
    const { row, turns } = await loadSession(data.director_session_id, data.session_id);
    const answeredOnly = turns.filter((turn) => turn.answer || turn.skipped);
    return advance(row, answeredOnly, "reopen");
  });

const blueprintInput = z.object({
  director_session_id: z.string().uuid(),
  session_id: z.string().uuid(),
  blueprint: z.string().trim().min(1).max(500),
});

/** Save a creator's edit of the blueprint before generating. */
export const saveBlueprint = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => blueprintInput.parse(data))
  .handler(async ({ data }): Promise<{ blueprint: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { row } = await loadSession(data.director_session_id, data.session_id);

    await supabaseAdmin
      .from("director_sessions")
      .update({ blueprint: data.blueprint })
      .eq("id", row.id);

    return { blueprint: data.blueprint };
  });

/**
 * Change propagation: when the creator rewrites the blueprint, work out which
 * parts of the film that change pulls with it, and offer one consistent rewrite.
 */
export const reviewBlueprint = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => blueprintInput.parse(data))
  .handler(async ({ data }): Promise<BlueprintReview> => {
    const { row } = await loadSession(data.director_session_id, data.session_id);
    const model = readModel(row.film_model);
    const bible = (row.film_bible ?? null) as FilmBible | null;

    const reply = await callGateway(
      [
        `ORIGINAL IDEA: ${row.idea}`,
        `Film bible: ${JSON.stringify(bible)}`,
        `Your film model (memory, including impact_chain): ${JSON.stringify(model)}`,
        `The blueprint you delivered: ${row.blueprint ?? ""}`,
        `The creator has rewritten the blueprint to: ${data.blueprint}`,
        "",
        "Treat the creator's rewrite as a user_decision. Using the impact chain, work out which parts of the film this change pulls with it (for example emotional arc, final beat, music, dialogue, pacing, visual tone). Set done to true. In \"understanding\" write one short sentence naming what changed. Put the affected parts in film_bible.open_questions, one short label each. Update the film bible, the recommendation and the evolution report so everything is consistent with the rewrite, and return the consistent version of the creator's blueprint in \"blueprint\" — keep their wording and intent, only reconcile what contradicts it.",
      ].join("\n"),
    );

    const bibleNext = cleanBible(reply.film_bible, row.idea, model);
    return {
      message:
        text(reply.understanding, 300) ||
        "Your edit changes parts of the film I had already planned around.",
      affected: bibleNext.open_questions,
      updated_blueprint: text(reply.blueprint, 500) || data.blueprint,
    };
  });
