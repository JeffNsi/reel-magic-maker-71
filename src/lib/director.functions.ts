import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { STYLES } from "@/lib/storyreel.functions";

/**
 * Adaptive AI Creative Director.
 *
 * The model receives the idea plus every answer so far and decides — on each turn —
 * which single question would most improve the finished film. There is no fixed
 * questionnaire: the next question is always re-derived from the whole conversation.
 * When it has enough signal (or the creator asks for the film now) it returns a
 * Film Bible and a Creative Blueprint — the shot description that is generated.
 */

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.8-flash";

/** Hard cap so an interview can never run away from the creator. */
export const MAX_QUESTIONS = 6;

export const DIMENSIONS = [
  "subject",
  "setting",
  "time",
  "mood",
  "look",
  "camera",
  "turn",
  "ending",
] as const;

export type Confidence = { dimension: string; score: number };

export type FilmBible = {
  title: string;
  premise: string;
  cast: string[];
  setting: string;
  mood: string;
  look: string;
};

export type DirectorQuestion = {
  text: string;
  dimension: string;
  why: string;
  suggestions: string[];
};

export type DirectorState = {
  id: string;
  idea: string;
  style: string;
  status: "interviewing" | "ready";
  understanding: string;
  confidence: Confidence[];
  question: DirectorQuestion | null;
  question_count: number;
  film_bible: FilmBible | null;
  blueprint: string | null;
};

type Turn = { question: string; answer: string; skipped: boolean };

const SYSTEM = `You are an adaptive creative director for a tool that renders ONE continuous 5-second vertical (9:16) shot from a text prompt.

Your job each turn: read the creator's idea and every answer so far, then decide the SINGLE question that would most improve the finished film. Never use a fixed questionnaire, never repeat a question already asked, never ask more than one thing at a time. Prefer the creative dimension you are least confident about AND that would visibly change the shot. Questions must be short, plain, non-technical and answerable in a few words. Never ask about models, resolutions, aspect ratio, duration, credits or settings.

Score your confidence 0-100 for each dimension: subject, setting, time, mood, look, camera, turn, ending.

Set "done" to true only when the remaining unknowns would no longer meaningfully change the film, or when told to finish.

When done (or told to finish), fill "film_bible" and "blueprint". The blueprint is ONE paragraph under 400 characters describing a single continuous shot: clear subject, setting, camera movement, lighting, mood and — when the story has one — the visible turn. No scene lists, no dialogue, no titles, no quotation marks, no markdown, no camera brand names.

Reply with JSON only, matching exactly:
{"understanding":"one or two sentences on what the film is right now","confidence":[{"dimension":"subject","score":0}],"done":false,"question":{"text":"","dimension":"","why":"","suggestions":["","",""]},"film_bible":{"title":"","premise":"","cast":[""],"setting":"","mood":"","look":""},"blueprint":""}
Use null for "question" when done, and null for "film_bible"/"blueprint" when not done. "suggestions" holds 2-3 short example answers.`;

type AiReply = {
  understanding?: string;
  confidence?: { dimension?: string; score?: number }[];
  done?: boolean;
  question?: { text?: string; dimension?: string; why?: string; suggestions?: unknown } | null;
  film_bible?: Partial<FilmBible> | null;
  blueprint?: string | null;
};

function styleLabel(style: string) {
  return STYLES.find((s) => s.value === style)?.label ?? "Cinematic";
}

function transcript(idea: string, style: string, turns: Turn[]) {
  const lines = [`Idea: ${idea}`, `Visual style: ${styleLabel(style)}`];
  turns.forEach((turn, index) => {
    lines.push(`Q${index + 1}: ${turn.question}`);
    lines.push(`A${index + 1}: ${turn.skipped ? "(skipped — decide this yourself)" : turn.answer}`);
  });
  return lines.join("\n");
}

/** Ask the model for the next question, or for the finished bible + blueprint. */
async function think(
  idea: string,
  style: string,
  turns: Turn[],
  finish: boolean,
): Promise<AiReply> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("The creative director isn't available right now.");

  const instruction = finish
    ? "The creator wants the film now. Set done to true and deliver the film bible and blueprint, filling any gaps with strong choices of your own."
    : turns.length >= MAX_QUESTIONS
      ? "You have asked enough questions. Set done to true and deliver the film bible and blueprint."
      : "Decide the single most valuable next question, or set done to true if you have enough.";

  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `${transcript(idea, style, turns)}\n\n${instruction}` },
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

function cleanConfidence(input: AiReply["confidence"]): Confidence[] {
  const scores = new Map<string, number>();
  for (const entry of input ?? []) {
    const dimension = String(entry?.dimension ?? "").toLowerCase();
    if (!DIMENSIONS.includes(dimension as (typeof DIMENSIONS)[number])) continue;
    scores.set(dimension, Math.max(0, Math.min(100, Math.round(Number(entry?.score) || 0))));
  }
  return DIMENSIONS.map((dimension) => ({ dimension, score: scores.get(dimension) ?? 0 }));
}

function cleanQuestion(input: AiReply["question"]): DirectorQuestion | null {
  const text = String(input?.text ?? "").trim();
  if (!text) return null;
  const suggestions = Array.isArray(input?.suggestions)
    ? input.suggestions
        .map((s) => String(s ?? "").trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];
  return {
    text: text.slice(0, 240),
    dimension: String(input?.dimension ?? "").toLowerCase().slice(0, 40),
    why: String(input?.why ?? "").trim().slice(0, 200),
    suggestions,
  };
}

function cleanBible(input: AiReply["film_bible"], idea: string): FilmBible {
  return {
    title: String(input?.title ?? "").trim().slice(0, 90) || idea.slice(0, 60),
    premise: String(input?.premise ?? "").trim().slice(0, 400),
    cast: Array.isArray(input?.cast)
      ? input.cast.map((c) => String(c ?? "").trim()).filter(Boolean).slice(0, 6)
      : [],
    setting: String(input?.setting ?? "").trim().slice(0, 200),
    mood: String(input?.mood ?? "").trim().slice(0, 200),
    look: String(input?.look ?? "").trim().slice(0, 200),
  };
}

type SessionRow = {
  id: string;
  idea: string;
  style: string;
  status: string;
  understanding: string;
  confidence: unknown;
  film_bible: unknown;
  blueprint: string | null;
  question_count: number;
};

const SESSION_COLUMNS =
  "id, idea, style, status, understanding, confidence, film_bible, blueprint, question_count";

/** Apply one model reply to the session row and hand the UI a complete state. */
async function advance(
  row: SessionRow,
  turns: Turn[],
  finish: boolean,
): Promise<DirectorState> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const reply = await think(row.idea, row.style, turns, finish);
  const confidence = cleanConfidence(reply.confidence);
  const understanding = String(reply.understanding ?? "").trim().slice(0, 500);
  const forced = finish || turns.length >= MAX_QUESTIONS;
  const question = forced ? null : cleanQuestion(reply.question);
  const done = reply.done === true || forced || !question;

  const bible = done ? cleanBible(reply.film_bible, row.idea) : null;
  const blueprint = done
    ? String(reply.blueprint ?? "").trim().slice(0, 500) ||
      `${bible?.premise ?? row.idea} ${bible?.look ?? ""}`.trim().slice(0, 500)
    : null;

  await supabaseAdmin
    .from("director_sessions")
    .update({
      status: done ? "ready" : "interviewing",
      understanding,
      confidence,
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
    question,
    question_count: turns.length + (question ? 1 : 0),
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
