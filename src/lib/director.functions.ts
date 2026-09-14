import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { STYLES } from "@/lib/storyreel.functions";

/**
 * Adaptive AI Creative Director — the intelligence layer.
 *
 * Every turn the model rebuilds an internal film model from the idea plus every
 * answer so far, ranks the questions it *could* ask by how much each would
 * improve the finished film, and asks only the single highest-value one. Facts
 * are remembered and labelled as the creator's decision or the director's own
 * assumption, so nothing already known is ever asked again and no creator choice
 * is silently overwritten. It also follows the thread an answer opens, flags a
 * breakthrough that redirects the story, surfaces contradictions instead of
 * resolving them quietly, and stops as soon as the remaining unknowns no longer
 * matter — the question cap is only a safety net, never the plan.
 *
 * Output is a Film Bible (source of truth) plus a Creative Blueprint: the single
 * shot description handed to the unchanged generation pipeline.
 */

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.8-flash";

/** Safety net only — the interview normally ends when the model has enough. */
export const MAX_QUESTIONS = 8;

export const DIMENSIONS = [
  "story",
  "character",
  "emotion",
  "world",
  "camera",
  "audience",
  "turn",
  "ending",
] as const;

export type Confidence = { dimension: string; score: number };

/** Every remembered fact is either the creator's call or the director's. */
export type FactSource = "user_decision" | "ai_assumption";

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
  conflict: DirectorConflict | null;
  film_bible: FilmBible | null;
  blueprint: string | null;
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

MEMORY: the film model you return is your memory. Facts already in it are known — asking about them again is a failure. Record every fact with source "user_decision" (the creator said it) or "ai_assumption" (you chose it). You may revise your own assumptions freely; never silently overwrite a user_decision.

BREAKTHROUGH: when a new answer fundamentally changes the story direction, set "breakthrough" to one sentence naming the change, revisit your assumptions, and pick the next question from the NEW direction — not the old path.

CONTRADICTION: when two answers cannot both be true, fill "conflict" with a plain-language message quoting both and give 2-3 resolution options, and make your question the one that asks the creator to choose. Never resolve it yourself.

TERMINATION: set "done" true as soon as the story has a beginning, a development and a payoff, the important characters and their motivation are clear, the emotional and visual direction are clear, continuity holds and the shot can be described for a generator. Before finishing, check exactly that; if one critical thing is missing, ask that one question instead. Fewer, better questions beat more questions.

When done (or told to finish), fill every gap with strong choices of your own recorded as ai_assumption, then fill "film_bible" and "blueprint". The blueprint is ONE paragraph under 400 characters describing a single continuous shot: subject, setting, camera movement, lighting, mood and — when the story has one — the visible turn. No scene lists, no dialogue, no titles, no quotation marks, no markdown, no camera brand names.

Reply with JSON only, matching exactly:
{"understanding":"one or two sentences on what the film is right now","confidence":[{"dimension":"story","score":0}],"film_model":{"story":"","characters":"","world":"","time":"","emotion":"","camera":"","audience":"","ending":"","facts":[{"key":"","value":"","source":"user_decision"}],"continuity":[""],"open_questions":[""]},"breakthrough":null,"conflict":null,"done":false,"question":{"preface":"one short sentence on what you already understand","text":"the single question","dimension":"story","why":"why this matters for the film","suggestions":["","",""]},"film_bible":{"title":"","premise":"","cast":[""],"setting":"","mood":"","look":"","camera":"","emotional_arc":"","ending":"","decisions":[""],"assumptions":[""]},"blueprint":""}
Confidence dimensions are exactly: story, character, emotion, world, camera, audience, turn, ending. Use null for "question" when done, null for "film_bible"/"blueprint" when not done, and null for "breakthrough"/"conflict" when there is none. "suggestions" holds 2-3 short example answers, "decisions" the creator's choices and "assumptions" yours.`;

type AiReply = {
  understanding?: string;
  confidence?: { dimension?: string; score?: number }[];
  film_model?: Partial<FilmModel> | null;
  breakthrough?: string | null;
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
  const lines = [`Idea: ${idea}`, `Visual style: ${styleLabel(style)}`];
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

/** Ask the model for the next question, or for the finished bible + blueprint. */
async function think(
  row: SessionRow,
  turns: Turn[],
  finish: boolean,
): Promise<AiReply> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("The creative director isn't available right now.");

  const instruction = finish
    ? "The creator wants the film now. Ask nothing more: set done to true, close every gap with your own strong choices recorded as ai_assumption, and deliver the film bible and blueprint."
    : turns.length >= MAX_QUESTIONS
      ? "You have used your whole question budget. Set done to true and deliver the film bible and blueprint."
      : "Run the loop and either ask the single highest-value question, or set done to true if the remaining unknowns would no longer meaningfully change this film.";

  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `${transcript(row.idea, row.style, turns, readModel(row.film_model), row.understanding ?? "")}\n\n${instruction}`,
        },
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
    facts.push({
      key,
      value,
      source: item?.source === "user_decision" ? "user_decision" : "ai_assumption",
    });
    if (facts.length >= 30) break;
  }
  return facts;
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
    open_questions: list(input?.open_questions, 8, 200),
  };
  if (merged.facts.length === 0 && previous) merged.facts = previous.facts;
  if (merged.continuity.length === 0 && previous) merged.continuity = previous.continuity;
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
  const options = list(input?.options, 3, 60);
  return { message, options };
}

function cleanBible(
  input: AiReply["film_bible"],
  idea: string,
  model: FilmModel | null,
): FilmBible {
  const facts = model?.facts ?? [];
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
    decisions:
      list(input?.decisions, 10, 160).length > 0
        ? list(input?.decisions, 10, 160)
        : facts
            .filter((fact) => fact.source === "user_decision")
            .map((fact) => `${fact.key}: ${fact.value}`)
            .slice(0, 10),
    assumptions:
      list(input?.assumptions, 10, 160).length > 0
        ? list(input?.assumptions, 10, 160)
        : facts
            .filter((fact) => fact.source === "ai_assumption")
            .map((fact) => `${fact.key}: ${fact.value}`)
            .slice(0, 10),
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
  blueprint: string | null;
  question_count: number;
};

const SESSION_COLUMNS =
  "id, idea, style, status, understanding, confidence, film_model, film_bible, blueprint, question_count";

function readModel(value: unknown): FilmModel | null {
  return value && typeof value === "object" ? (value as FilmModel) : null;
}

/** Apply one model reply to the session row and hand the UI a complete state. */
async function advance(row: SessionRow, turns: Turn[], finish: boolean): Promise<DirectorState> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const reply = await think(row, turns, finish);
  const confidence = cleanConfidence(reply.confidence);
  const understanding = text(reply.understanding, 500);
  const filmModel = cleanModel(reply.film_model, readModel(row.film_model));
  const breakthrough = text(reply.breakthrough, 240) || null;
  const conflict = cleanConflict(reply.conflict);
  const question = finish || turns.length >= MAX_QUESTIONS ? null : cleanQuestion(reply.question);

  /**
   * A contradiction is never resolved silently: while one is open the interview
   * keeps going so the creator can choose, unless they asked to finish now.
   */
  const done = !question || (reply.done === true && !conflict);

  const bible = done ? cleanBible(reply.film_bible, row.idea, filmModel) : null;
  const blueprint = done
    ? text(reply.blueprint, 500) ||
      `${bible?.premise ?? row.idea} ${bible?.look ?? ""}`.trim().slice(0, 500)
    : null;

  await supabaseAdmin
    .from("director_sessions")
    .update({
      status: done ? "ready" : "interviewing",
      understanding,
      confidence,
      film_model: filmModel,
      breakthrough,
      film_bible: bible,
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
    conflict: done ? null : conflict,
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

    return advance(row as SessionRow, [], false);
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

    return advance(row, answered, false);
  });

const refInput = z.object({
  director_session_id: z.string().uuid(),
  session_id: z.string().uuid(),
});

/** "Make my film now" — stop asking and deliver the bible and blueprint. */
export const finishDirector = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => refInput.parse(data))
  .handler(async ({ data }): Promise<DirectorState> => {
    const { row, turns } = await loadSession(data.director_session_id, data.session_id);
    const answeredOnly = turns.filter((turn) => turn.answer || turn.skipped);
    return advance(row, answeredOnly, true);
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
