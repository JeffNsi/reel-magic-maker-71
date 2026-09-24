import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { STYLES } from "@/lib/storyreel.functions";
import { searchTwists, twistShortlistBrief, wantsNoTwist } from "@/lib/twists";

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
export const DIMENSIONS = ["story", "character", "emotion", "visual", "generation"] as const;

export type Confidence = { dimension: string; score: number };

/** Provenance of every remembered fact — the creative trace. */
export type FactSource = "user_decision" | "ai_assumption" | "ai_discovery" | "ai_recommendation";

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

/**
 * A story turn the director found by searching the twist library against this
 * story. Only an accepted or recommended turn is written here, and it is always
 * expressed as filmable visual information — never as "plot twist: ...".
 */
export type Twist = {
  /** The library pattern it was adapted from, for traceability. */
  pattern: string;
  /** The turn in one plain sentence, in story terms. */
  statement: string;
  /** Why the story is emotionally stronger with it. */
  emotional_purpose: string;
  /** 2-4 things the audience could notice earlier without understanding them. */
  foreshadowing: string[];
  /** The moment the audience understands. */
  reveal: string;
  /** The single image that carries the reveal. */
  visual_clue: string;
  ending_implication: string;
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
  /** The accepted story turn, when this story has one. Null is a valid answer. */
  twist: Twist | null;
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

/**
 * The reality check: is the plan actually filmable as one short AI-generated
 * clip? Every scene test runs internally; only the parts a creator can act on
 * are surfaced. The creative intention is never traded away — only execution.
 */
export type FiveSecondRisk = {
  /** The moment that would not read in five seconds. */
  scene: string;
  problem: string;
  /** ONE simpler way to shoot the same intention. */
  alternative: string;
};

export type Execution = {
  /** What the film is trying to make the audience feel or understand. */
  intention: string;
  /**
   * The one thing the scene must communicate. Inviolable: an execution may be
   * restaged, re-framed or made metaphorical, but never chosen because it drops
   * this payoff.
   */
  emotional_core: string;
  /** The version that is hard to generate, when there is one. */
  risky_execution: string;
  /** The strongest execution that keeps the payoff and can still be rendered. */
  safer_execution: string;
};

export type RealityCheck = {
  five_second_risk: FiveSecondRisk | null;
  execution: Execution | null;
  /** Planning indicator 0-10, not a prediction of model success. */
  complexity: number;
  complexity_note: string;
  /** Concrete objects/wardrobe/architecture that make time and place readable. */
  anchors: string[];
  /** When one shot carries too much, the same idea as separate shots. */
  shot_split: string[];
  /** The recommendation in the creator's terms. */
  keep: string;
  change: string;
  why: string;
};

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
  /** Will this plan survive being turned into a five-second generated clip? */
  reality: RealityCheck | null;
  /** Present when the AI check was unavailable and a deterministic safe result was returned. */
  notice?: string | null;
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
  challenge: Challenge | null;
  /** Set when the AI was unavailable and a template package was produced instead. */
  notice?: string | null;
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

TWIST INTELLIGENCE: some turns of the brief include a TWIST SHORTLIST — story-turn patterns already filtered for this story from a large internal library. It is a creative resource, never an instruction and never a menu to pick from politely. Work it like a director: understand the story first, name the openings it actually has, check which shortlisted patterns genuinely belong to THIS story (genre, protagonist, relationships, emotional core, conflict, setting, period, existing clues, the creator's stated intention), adapt the ones that fit to these specific characters rather than restating the pattern, and consider combining two compatible patterns only when the combination truly deepens the story. Score candidates internally on story fit, emotional impact, narrative value, visual potential, foreshadowing potential, originality, cliché risk and whether a five-second vertical shot can show it — emotional and narrative value outweigh cleverness and spectacle. Prefer a turn the audience can discover through an image (a reflection, a scar, a watch with the wrong date, a photograph holding someone who cannot be there, a child recognising an adult) over one that needs explaining. When a turn is promising, work out 2-4 quiet things the audience could notice earlier without understanding them yet, subtle enough not to give it away. NEVER force a turn: if none of them makes this story stronger, add none and say nothing about it — "the story is stronger without a twist" is an intelligent result. Never introduce a turn when the creator asked for none, and never replace a direction the creator decided (a user_decision) with a turn of your own; you may offer one as an ai_recommendation and let them choose. A turn that makes the film cleverer but emotionally weaker is rejected — check it against what must survive in this story before recommending it. If a new answer opens a genuinely bigger story, that is a breakthrough: search again from the new direction and, when the answer has high creative value, your single question may follow the turn ("what one visible detail could prove that to the audience?"). Record an accepted or recommended turn in the film bible's "twist" as filmable information — foreshadowing, reveal, the one visual clue, what it means for the ending — never as a label like "plot twist: the detective is the corpse". If the film you recommend contains a turn or a reveal of any kind — including one the creator's own idea already carries, such as the woman meeting her younger self — record it in "twist" with its foreshadowing and its one visual clue, so the reveal travels with the film instead of living only in your head. Set "twist" to null only when the recommended film genuinely has no turn.

TERMINATION: set "done" true as soon as the story has a beginning, a development and a payoff, the important characters and their motivation are clear, the emotional and visual direction are clear, continuity holds and the shot can be described for a generator. Before finishing, ask yourself as the director whether anything in this film would still bother you; if one critical thing is missing, ask that one question instead. Fewer, better questions beat more questions.

When done (or told to finish), fill every gap with strong choices of your own recorded as ai_assumption, then fill "film_bible", "evolution", "recommendation" and "blueprint".

"evolution" compares the ORIGINAL idea with the story you arrived at: what changed, what became clearer, what appeared, which assumptions fell away, which contradictions were resolved, what shifted the emotion, the character motivation or the ending. Be honest: if the interview did not meaningfully change the direction, set "evolved" false, leave "biggest_discovery" and "breakthrough" empty and write in "how_it_evolved": "Your original concept was already clear, so I didn't need to significantly change the direction."

"recommendation" is the version you recommend making, derived from the original idea plus the answers, discoveries, decisions and the film bible.

The blueprint is ONE paragraph under 400 characters describing a single continuous shot drawn from the FINAL film bible and recommendation — never just the original idea or the last answer: subject, setting, camera movement, lighting, mood and, when the story has one, the visible turn. No scene lists, no dialogue, no titles, no quotation marks, no markdown, no camera brand names.

Reply with JSON only, matching exactly:
{"understanding":"one or two sentences on what the film is right now","confidence":[{"dimension":"story","score":0}],"film_model":{"story":"","characters":"","world":"","time":"","emotion":"","camera":"","audience":"","ending":"","facts":[{"key":"","value":"","source":"user_decision"}],"continuity":[""],"impact_chain":[""],"open_questions":[""]},"breakthrough":null,"breakthrough_event":null,"conflict":null,"done":false,"question":{"preface":"one short sentence on what you already understand","text":"the single question","dimension":"story","why":"why this matters for the film","suggestions":["","",""]},"film_bible":{"title":"","premise":"","cast":[""],"setting":"","mood":"","look":"","camera":"","emotional_arc":"","ending":"","decisions":[""],"assumptions":[""],"discoveries":[""],"recommendations":[""],"open_questions":[""]},"evolution":{"evolved":true,"discoveries":[""],"how_it_evolved":"","biggest_discovery":"","breakthrough":""},"recommendation":{"rationale":"","logline":"","story_direction":"","main_character":"","central_conflict":"","emotional_journey":"","visual_direction":"","ending":""},"blueprint":""}
Confidence dimensions are exactly: story, character, emotion, visual, generation. Each score answers "how confident am I that I understand the creator's intended direction here" — story understanding, character understanding, emotional understanding, visual understanding and generation readiness (can this be described as one renderable shot). Never score video quality, odds of success or factual accuracy. Use null for "question" when done, and null for "film_bible"/"evolution"/"recommendation"/"blueprint" when not done. Inside the film bible, "twist" is either a complete object with every field filled or null — never a partial object. "breakthrough_event" is {"question":"","answer":"","previous_understanding":"","new_understanding":"","affected":[""]}. "suggestions" holds 2-3 short example answers.`;

/**
 * The stress test prompt. A separate pass so the interview prompt stays about
 * questions: this one only challenges a finished film bible.
 */
export const CHALLENGE_SYSTEM = `You are a professional film director reviewing a finished film bible before production. One continuous 5-second vertical (9:16) shot is rendered from a single text prompt by an AI video generator.

Run these tests internally and silently: biggest weakness, biggest creative opportunity, predictability, emotional logic (believable motivation, evolving journey, an ending that pays off the setup, a reason for the audience to care), character logic (goal, motivation, fear, conflict, change, relationship — flag a character who only moves the plot), visual storytelling (can it be understood without explanation; replace exposition with images: not "he is lonely" but an empty flat, two untouched plates, a phone with no messages), AI generation feasibility (too many characters, complex physical interaction, unclear motion, rapid transformation, inconsistent environment, choreography, unclear camera movement, impossible continuity, dialogue, unclear subject focus), continuity (face, hair, clothing, age, location, time, weather, lighting, props, emotional state), story economy (what can be removed for more impact), scene purpose (establish, reveal, escalate, develop, tension, emotion, transition, payoff) and whether the ending feels earned.

Then rank everything and surface at most: ONE weakness, ONE opportunity, ONE generation risk, ONE recommendation. Never output a checklist. Never invent criticism: if the film genuinely holds up, set "weakness" to null. If there is no honest improvement, set "opportunity" to null. Do not propose a twist for the sake of a twist and do not make the film more complicated — aim for more intentional, more emotional, more visual, more coherent, more generatable. Do not remove something merely because it is complex.

REALITY CHECK — the part that matters most. Separate CREATIVELY INTERESTING from ACTUALLY GENERATABLE: a concept can be excellent and still fail to communicate inside one short AI clip. Test every important beat internally against story clarity (can the audience tell what is happening), visual clarity (can the action be read without words), temporal clarity (can a change in time be recognised), spatial clarity (is it clear where we are), character clarity (is it clear who does what), motion clarity (can a video model plausibly render that movement), continuity (can the person and the place stay consistent), duration (can this be told in the seconds available) and transition complexity.

THE FIVE-SECOND TEST: for each important beat ask "if this were only five seconds long, would the audience understand what happened?" If no, name that beat in "five_second_risk" with the problem and ONE simpler alternative. Example problem: a whip-pan asked to carry two historical eras — the change happens too fast to read. Example alternative: one room where the environment transforms around the character.

NEVER DESTROY THE IDEA. Do not say "this will not work". Ask "how do we keep the creative intention and simplify the execution?" Record the intention and the execution separately in "execution": keep the intention, change the execution. Example — intention: the character feels trapped; risky execution: running through five locations while the world changes; better execution: one room whose walls close in. Same intention, simpler generation.

CINEMATIC CANDIDATE SEARCH — do this before you propose any change. "Remove something" is not a solution. Whenever a beat is hard to render, first name its EMOTIONAL CORE in "emotional_core": the one thing the scene must communicate (two versions of the same person meeting, a betrayal being discovered, the corpse is himself, loneliness, grief, awe, transformation, fear, reconciliation). That payoff is inviolable. Camera, staging, blocking, environment, number of shots, props, framing, transitions and metaphor are all yours to change; the payoff is not.

Then generate exactly three candidate executions internally and silently — genuinely different cinematic strategies, not cosmetic variations:
A DIRECT — the original idea, kept as close as possible, made renderable.
B RE-STAGED — the same meaning through different staging, blocking, camera or shot structure.
C METAPHORICAL — the same meaning through an object, reflection, shadow, empty space, environmental change, repetition, sound, light, absence, distance, framing, contrast or transformation.

Score each candidate internally on emotional strength, narrative fidelity, cinematic clarity, feasibility, visual distinctiveness and complexity. Emotional strength and narrative fidelity outweigh everything else; feasibility never automatically wins. HARD RULE: reject any candidate that removes or weakens the emotional payoff, even when it is by far the easiest to render — a woman who meets her younger self must still meet her younger self; deleting the younger self is not an option, so search for another device (she emerges older from behind the pillar; the younger self appears only in a train-window reflection; two hands meet on either side of the pillar before the reveal). The simplest candidate does not win by default: put the strongest candidate that can realistically be generated in "safer_execution", and in "five_second_risk.alternative" when it answers that beat.

METAPHOR SEARCH: for an abstract idea (memory loss, grief, obsession, isolation) never stop at the first obvious image — an old face and a faded photograph is where the search starts, not where it ends. Search objects, reflections, shadows, empty spaces, environmental change, repetition, sound, light, movement, absence, distance, framing, contrast and transformation: a room where everything remains except the person who used to occupy it; a home where the labels on objects vanish; photographs whose faces stop being recognisable; a familiar song while the objects around it turn unfamiliar; a hand reaching for something it should know. Not every scene should be symbolic — but never let the first obvious picture be the only one considered.

ONE IMAGE TEST: for each candidate ask whether a single frame would still carry the emotional idea. If yes, it is stronger. If no, the scene is leaning on explanation, dialogue or complex action — fix that. ONE SOUND TEST: ask whether one sound could carry the meaning without explaining it — silence, a distant train, a heartbeat, a ringing phone, breath, footsteps, room tone, an object, the sudden absence of sound. Use it only when it genuinely adds; never force sound into every scene.

HIERARCHY when something fails: intention, then emotional payoff, then cinematic idea, then execution, then generation feasibility. Solve it at the execution layer and go no higher unless you must. "Make it generatable" never means "remove complexity" — it means keep the cinematic idea and make it renderable. If all three candidates are weak, say so honestly in "why", recommend the strongest one available and keep the original intention visible; never quietly delete the important beat.

Do not expose the search. Never mention candidates, options A/B/C or scoring in your output. Speak as a director who found a better way: name what was at risk, then the way you would keep it.

COMPLEXITY: score the plan 0-10 as a planning indicator, never a prediction of model success — 0-3 simple, 4-6 moderate, 7-8 high, 9-10 very high risk. Weigh number of characters, locations, character and object interaction, camera movement, environmental change, time change, transformation, crowds, fast motion, dialogue, lip sync, effects, physics and continuity demands. When it is high, offer a simpler execution that preserves story purpose, emotional purpose, visual idea and character motivation while simplifying locations, actions, transitions, moving elements and camera — and only recommend it if it materially improves generation reliability.

TRANSITIONS: analyse whip pans, match cuts, morphs, time jumps, location jumps, transformations, fast camera moves, perspective changes and character transformations. Ask whether the audience will read it AND whether the model will hold continuity through it; if either is weak, propose a simpler transition.

TIME AND VISUAL ANCHORS: for past/present/future, day/night, young/old or different periods, verify the change is recognisable, never relying on subtle cues or on-screen text. Put strong anchors in "anchors" — wardrobe, architecture, vehicles, props, a period television, lighting, production design.

CAMERA AND SHOT SPLITTING: if continuous camera movement, several characters, environmental transformation, dialogue and a time jump pile up at once, recommend separating them. When one shot carries too much information, keep the idea and split it into shots in "shot_split" (for example: character enters the room; camera reveals the object; character reacts; the object activates) rather than deleting the idea.

CREDIT AWARENESS: before rendering, ask internally whether this beat is worth a generation credit in its current form. If risk is high, recommend the safer execution BEFORE rendering. Never render speculative versions.

RECOMMENDATION SHAPE: express your one recommendation as "keep" (what stays), "change" (what changes) and "why" (why the film improves — clearer for the audience, fewer continuity variables). Never silently replace the creator's idea; their version always survives a refusal, and you never argue the same point twice.

Give three short "what if" possibilities — alternative directions, not whole films — each scored for creative_value and risk from 0 to 100. Never apply them; the creator decides.

Verdict, based on this actual film bible: "ready" when nothing meaningful is wrong; "recommendation" when it can be made as-is but one change would clearly strengthen it; "revision" only when a real creative problem or a real filming risk would damage the film or the render.

"improved_blueprint" is ONE paragraph under 400 characters: the blueprint as it would read if the creator accepts your recommendation, keeping the film's core identity, the creator's decisions and their intent. When the verdict is "ready", repeat the current blueprint unchanged.

Reply with JSON only, matching exactly:
{"verdict":"ready","headline":"one short sentence in your own voice","weakness":{"problem":"","why_it_matters":"","affected":[""],"solution":""},"opportunity":{"current_direction":"","proposed_improvement":"","why":"","affected":[""]},"generation_risk":{"problem":"","fix":""},"reality":{"five_second_risk":{"scene":"","problem":"","alternative":""},"execution":{"intention":"","emotional_core":"","risky_execution":"","safer_execution":""},"complexity":0,"complexity_note":"","anchors":[""],"shot_split":[""],"keep":"","change":"","why":""},"predictability":"low","predictability_note":"","what_ifs":[{"text":"","creative_value":0,"risk":0}],"recommendation":"","improved_blueprint":""}
Use null for "weakness", "opportunity", "generation_risk", "five_second_risk" and "execution" when there is nothing honest to report, and empty arrays when no anchors or split are needed. Plain language, no markdown, no headings, no quotation marks around fields.`;

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

  /**
   * Twist intelligence: a shortlist of story-turn patterns that plausibly
   * belong to THIS story, searched from the library by relevance. Never sent
   * when the creator asked for no twist, and never mandatory when it is sent.
   */
  const answers = turns.map((turn) => turn.answer).join(" ");
  if (!wantsNoTwist(idea, answers)) {
    const shortlist = twistShortlistBrief(
      searchTwists({
        idea,
        understanding,
        answers,
        model: model ? JSON.stringify(model) : "",
      }),
    );
    if (shortlist) lines.push(shortlist);
  }
  return lines.join("\n");
}

/**
 * Correct reasoning is not the same as reliable structured output: the model
 * occasionally truncates or wraps its JSON. Recovery happens here, before any
 * caller commits director state — so a malformed reply never becomes a visible
 * failure and never mutates the session.
 */
const FORMAT_REMINDER =
  "Your previous reply could not be parsed. Answer the exact same way creatively — same reasoning, same conclusions, nothing rethought — but return ONLY one complete, valid JSON object matching the required structure, with every required field present, no markdown fences, no commentary before or after it, and keep the text inside each field short so the JSON is never cut off.";

/** A usable reply is a real object with at least one field carrying content. */
function isUsableReply(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).some((entry) => {
    if (entry === null || entry === undefined) return false;
    if (typeof entry === "string") return entry.trim().length > 0;
    if (Array.isArray(entry)) return entry.length > 0;
    if (typeof entry === "object") return Object.keys(entry as object).length > 0;
    return true;
  });
}

export async function callGateway<T = AiReply>(user: string, system = SYSTEM): Promise<T> {
  try {
    return await callGatewayOnce<T>(user, system);
  } catch (error) {
    if (!(error instanceof MalformedReplyError)) throw error;
    /** One retry only, same creative brief, stronger output contract. */
    try {
      return await callGatewayOnce<T>(`${user}\n\n${FORMAT_REMINDER}`, system);
    } catch (retryError) {
      if (!(retryError instanceof MalformedReplyError)) throw retryError;
      throw new Error(
        "The director hit a temporary response error. Nothing was lost — try that again.",
      );
    }
  }
}

class MalformedReplyError extends Error {}

/** The AI could not be reached (no key, no credits, rate limited, outage). */
class GatewayUnavailableError extends Error {}

/**
 * Rescues the formatting slips the model actually makes, without touching what
 * it said: chain arrows written between separate strings ("a" -> "b"), and
 * trailing commas. Meaning is preserved exactly; only the syntax is repaired.
 */
function repairJson(input: string) {
  return input.replace(/"\s*(?:->|→|=>)\s*"/g, " -> ").replace(/,(\s*[}\]])/g, "$1");
}

async function callGatewayOnce<T = AiReply>(user: string, system = SYSTEM): Promise<T> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new GatewayUnavailableError("The creative director isn't available right now.");

  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    console.error("director gateway failed", res.status, await res.text().catch(() => ""));
    if (res.status === 402) {
      throw new GatewayUnavailableError(
        "This project is out of AI credits. Top them up to keep directing.",
      );
    }
    if (res.status === 429) {
      throw new GatewayUnavailableError("The creative director is busy. Try again in a moment.");
    }
    throw new GatewayUnavailableError("The creative director could not answer. Please try again.");
  }

  const body = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
  } | null;
  const raw = body?.choices?.[0]?.message?.content ?? "";
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new MalformedReplyError("unparsable director reply");

  const slice = raw.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    try {
      parsed = JSON.parse(repairJson(slice));
    } catch {
      throw new MalformedReplyError("invalid director JSON");
    }
  }
  /** Validate before any caller commits state to the session. */
  if (!isUsableReply(parsed)) throw new MalformedReplyError("empty director reply");
  return parsed as T;
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

function cleanEvent(input: AiReply["breakthrough_event"], turns: Turn[]): BreakthroughEvent | null {
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
    twist: cleanTwist(input?.twist),
  };
}

/**
 * A story turn only survives if the director actually described one, and only
 * as filmable information — no label, no bare "plot twist" line. No twist is a
 * valid, common answer.
 */
function cleanTwist(input: unknown): Twist | null {
  if (!input || typeof input !== "object") return null;
  const entry = input as Partial<Twist>;
  const statement = text(entry.statement, 300);
  const reveal = text(entry.reveal, 300);
  if (!statement || !reveal) return null;
  return {
    pattern: text(entry.pattern, 80),
    statement,
    emotional_purpose: text(entry.emotional_purpose, 300),
    foreshadowing: list(entry.foreshadowing, 4, 200),
    reveal,
    visual_clue: text(entry.visual_clue, 240),
    ending_implication: text(entry.ending_implication, 240),
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

function cleanRecommendation(input: AiReply["recommendation"], bible: FilmBible): Recommendation {
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
  challenge: unknown;
  simplify_rejections: number;
  question_count: number;
  creative_truth: unknown;
};

const SESSION_COLUMNS =
  "id, idea, style, status, understanding, confidence, film_model, film_bible, evolution, recommendation, breakthroughs, blueprint, challenge, simplify_rejections, question_count, creative_truth";

/**
 * The permanent home for the three decisions that used to live only inside a
 * temporary reality-check record: what the film must communicate, what may
 * never disappear, and the execution that won. Kept on the session so it
 * survives further questions, approval and blueprint edits, and read later by
 * the Scene Truth Contract.
 */
export type CreativeTruth = {
  emotional_core: string;
  what_must_survive: string;
  chosen_execution: string;
  source: "user_decision" | "ai_discovery" | "ai_recommendation" | "ai_assumption";
};

export function readCreativeTruth(value: unknown): CreativeTruth | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CreativeTruth>;
  const truth: CreativeTruth = {
    emotional_core: text(raw.emotional_core, 300),
    what_must_survive: text(raw.what_must_survive, 300),
    chosen_execution: text(raw.chosen_execution, 400),
    source: raw.source === "user_decision" ? "user_decision" : "ai_recommendation",
  };
  return truth.emotional_core || truth.what_must_survive || truth.chosen_execution ? truth : null;
}

/**
 * Remember creative truth without ever letting an AI pass overwrite a decision
 * the creator made: a creator-owned execution stands, and only empty fields are
 * filled in by the director.
 */
async function rememberCreativeTruth(
  row: SessionRow,
  patch: Partial<CreativeTruth> & { source: CreativeTruth["source"] },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const current = readCreativeTruth(row.creative_truth);
  const userOwned = current?.source === "user_decision" && patch.source !== "user_decision";

  const next: CreativeTruth = {
    emotional_core: text(patch.emotional_core, 300) || current?.emotional_core || "",
    what_must_survive: text(patch.what_must_survive, 300) || current?.what_must_survive || "",
    chosen_execution: userOwned
      ? current?.chosen_execution || text(patch.chosen_execution, 400)
      : text(patch.chosen_execution, 400) || current?.chosen_execution || "",
    source: userOwned ? "user_decision" : patch.source,
  };

  if (!next.emotional_core && !next.what_must_survive && !next.chosen_execution) return;

  await supabaseAdmin.from("director_sessions").update({ creative_truth: next }).eq("id", row.id);
}

function readModel(value: unknown): FilmModel | null {
  return value && typeof value === "object" ? (value as FilmModel) : null;
}

function readEvents(value: unknown): BreakthroughEvent[] {
  return Array.isArray(value) ? (value as BreakthroughEvent[]) : [];
}

/** Apply one model reply to the session row and hand the UI a complete state. */
async function advance(row: SessionRow, turns: Turn[], mode: Mode): Promise<DirectorState> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let reply: AiReply;
  let notice: string | null = null;
  try {
    reply = await think(row, turns, mode);
  } catch (error) {
    if (!(error instanceof GatewayUnavailableError)) throw error;
    /** Template mode: no AI, but the creator still gets a complete package. */
    notice = `${error.message} Template mode: a basic film package was built without AI. / Mallläge: ett enkelt filmpaket byggdes utan AI.`;
    reply = {} as AiReply;
    mode = "finish";
  }
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
  const done = mode === "finish" || (mode === "interview" && !question);

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
      /** A new bible invalidates any earlier challenge — it is re-run on the new one. */
      challenge: null,
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
    challenge: null,
    notice,
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

    /** An edited blueprint is the creator's own execution — it outranks the AI's. */
    await rememberCreativeTruth(row, {
      chosen_execution: data.blueprint,
      source: "user_decision",
    });

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
        'Treat the creator\'s rewrite as a user_decision. Using the impact chain, work out which parts of the film this change pulls with it (for example emotional arc, final beat, music, dialogue, pacing, visual tone). Set done to true. In "understanding" write one short sentence naming what changed. Put the affected parts in film_bible.open_questions, one short label each. Update the film bible, the recommendation and the evolution report so everything is consistent with the rewrite, and return the consistent version of the creator\'s blueprint in "blueprint" — keep their wording and intent, only reconcile what contradicts it.',
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

/* ------------------------------------------------------------------ *
 * Creative intelligence stress test
 * ------------------------------------------------------------------ */

type ChallengeReply = {
  verdict?: string;
  headline?: string;
  weakness?: Partial<Weakness> | null;
  opportunity?: Partial<Opportunity> | null;
  generation_risk?: Partial<GenerationRisk> | null;
  predictability?: string;
  predictability_note?: string;
  what_ifs?: unknown;
  recommendation?: string;
  improved_blueprint?: string | null;
  reality?: {
    five_second_risk?: Partial<FiveSecondRisk> | null;
    execution?: Partial<Execution> | null;
    complexity?: unknown;
    complexity_note?: string;
    anchors?: unknown;
    shot_split?: unknown;
    keep?: string;
    change?: string;
    why?: string;
  } | null;
};

const NO_WEAKNESS = "No major creative weakness detected.";

function score(value: unknown) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function cleanWhatIfs(input: unknown): WhatIf[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      const item = entry as { text?: unknown; creative_value?: unknown; risk?: unknown };
      return {
        text: text(item?.text, 240),
        creative_value: score(item?.creative_value),
        risk: score(item?.risk),
      };
    })
    .filter((item) => item.text)
    .sort((a, b) => b.creative_value - b.risk - (a.creative_value - a.risk))
    .slice(0, 3);
}

/** 0-10 planning indicator, not a prediction of the model's success. */
function complexityScore(value: unknown) {
  return Math.max(0, Math.min(10, Math.round(Number(value) || 0)));
}

/**
 * The reality check survives only where the model pointed at something real:
 * a beat that fails the five-second test, an execution that can be simplified
 * without touching the intention, anchors, or a shot split.
 */
function cleanReality(input: ChallengeReply["reality"]): RealityCheck | null {
  if (!input || typeof input !== "object") return null;

  const riskProblem = text(input.five_second_risk?.problem, 300);
  const five_second_risk: FiveSecondRisk | null = riskProblem
    ? {
        scene: text(input.five_second_risk?.scene, 200),
        problem: riskProblem,
        alternative: text(input.five_second_risk?.alternative, 300),
      }
    : null;

  const intention = text(input.execution?.intention, 240);
  const safer = text(input.execution?.safer_execution, 300);
  /** An execution note is only useful when there is an intention AND another way. */
  const execution: Execution | null =
    intention && safer
      ? {
          intention,
          emotional_core: text(input.execution?.emotional_core, 240),
          risky_execution: text(input.execution?.risky_execution, 300),
          safer_execution: safer,
        }
      : null;

  const reality: RealityCheck = {
    five_second_risk,
    execution,
    complexity: complexityScore(input.complexity),
    complexity_note: text(input.complexity_note, 240),
    anchors: list(input.anchors, 4, 80),
    shot_split: list(input.shot_split, 4, 120),
    keep: text(input.keep, 240),
    change: text(input.change, 240),
    why: text(input.why, 300),
  };

  const empty =
    !five_second_risk &&
    !execution &&
    !reality.complexity_note &&
    !reality.anchors.length &&
    !reality.shot_split.length &&
    !reality.change;
  return empty ? null : reality;
}

/** Only findings the model can actually point at survive — no invented criticism. */
function cleanChallenge(reply: ChallengeReply, currentBlueprint: string): Challenge {
  const problem = text(reply.weakness?.problem, 300);
  const weakness: Weakness | null =
    problem && problem.toLowerCase() !== NO_WEAKNESS.toLowerCase()
      ? {
          problem,
          why_it_matters: text(reply.weakness?.why_it_matters, 300),
          affected: list(reply.weakness?.affected, 6, 60),
          solution: text(reply.weakness?.solution, 300),
        }
      : null;

  const improvement = text(reply.opportunity?.proposed_improvement, 300);
  const opportunity: Opportunity | null = improvement
    ? {
        current_direction: text(reply.opportunity?.current_direction, 300),
        proposed_improvement: improvement,
        why: text(reply.opportunity?.why, 300),
        affected: list(reply.opportunity?.affected, 6, 60),
      }
    : null;

  const riskProblem = text(reply.generation_risk?.problem, 300);
  const generation_risk: GenerationRisk | null = riskProblem
    ? { problem: riskProblem, fix: text(reply.generation_risk?.fix, 300) }
    : null;

  const reality = cleanReality(reply.reality);

  const raw = String(reply.verdict ?? "").toLowerCase();
  let verdict: Verdict =
    raw.includes("revis") || raw.includes("red")
      ? "revision"
      : raw.includes("recommend") || raw.includes("yellow")
        ? "recommendation"
        : "ready";

  /** The verdict has to match the findings, not just the label the model chose. */
  if (
    verdict === "ready" &&
    (weakness || opportunity || generation_risk || reality?.five_second_risk)
  ) {
    verdict = "recommendation";
  }
  if (verdict === "revision" && !weakness && !generation_risk && !reality?.five_second_risk) {
    verdict = "recommendation";
  }

  const predictabilityRaw = String(reply.predictability ?? "").toLowerCase();
  const predictability =
    predictabilityRaw === "high" ? "high" : predictabilityRaw === "medium" ? "medium" : "low";

  const recommendation =
    text(reply.recommendation, 400) ||
    reality?.five_second_risk?.alternative ||
    reality?.execution?.safer_execution ||
    opportunity?.proposed_improvement ||
    weakness?.solution ||
    "";

  return {
    verdict,
    headline:
      text(reply.headline, 300) ||
      (verdict === "ready"
        ? "This holds up. I'd shoot it as it stands."
        : verdict === "revision"
          ? "I found a creative problem worth fixing first."
          : "I have one recommendation before we shoot."),
    weakness,
    opportunity,
    generation_risk,
    predictability,
    predictability_note: text(reply.predictability_note, 300),
    what_ifs: cleanWhatIfs(reply.what_ifs),
    recommendation: verdict === "ready" ? "" : recommendation,
    improved_blueprint: text(reply.improved_blueprint, 500) || currentBlueprint,
    reality,
  };
}

/**
 * Keep the finished film usable when the optional AI stress test is unavailable.
 * This is deliberately neutral: without an AI response it invents no criticism,
 * changes no creative truth and leaves the creator's approved blueprint intact.
 */
export function buildTemplateChallenge(currentBlueprint: string, reason: string): Challenge {
  return {
    ...cleanChallenge({}, currentBlueprint),
    notice: `${reason} The film remains ready and the optional review was skipped. / Filmen är fortfarande klar och den valfria granskningen hoppades över.`,
  };
}

function challengeBrief(row: SessionRow) {
  const lines = [
    `ORIGINAL IDEA: ${row.idea}`,
    `Visual style: ${styleLabel(row.style)}`,
    `Film bible (the authoritative version): ${JSON.stringify(row.film_bible)}`,
    `Your recommendation: ${JSON.stringify(row.recommendation)}`,
    `Your film model, including the impact chain: ${JSON.stringify(readModel(row.film_model))}`,
    `The blueprint that would be sent to the generator: ${row.blueprint ?? ""}`,
    "Clip reality: one continuous take of about five seconds, vertical, no cuts, no subtitles.",
  ];

  /**
   * Learned from this session: a creator who keeps choosing their own execution
   * gets a less pushy director — the reality check stays honest but stops
   * arguing for simplification it has already lost.
   */
  if (row.simplify_rejections >= 2) {
    lines.push(
      `The creator has kept their own version ${row.simplify_rejections} times in this session. Do not argue simplification again unless the render would genuinely fail: raise only a real filming risk, keep any recommendation short, and prefer "ready" when the plan is merely ambitious.`,
    );
  }

  lines.push(
    "",
    "Challenge this film as its director would before production, and run the reality check on it. Surface at most one weakness, one opportunity, one generation risk and one recommendation, and be honest when there is nothing wrong.",
  );
  return lines.join("\n");
}

/**
 * Run the stress test on the approved bible. Separate from the interview so it
 * costs nothing until a film is actually designed, and never blocks a question.
 */
export const challengeFilm = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => refInput.parse(data))
  .handler(async ({ data }): Promise<Challenge> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { row } = await loadSession(data.director_session_id, data.session_id);

    if (!row.film_bible) throw new Error("There is no finished film to challenge yet.");
    if (row.challenge && typeof row.challenge === "object") return row.challenge as Challenge;

    let reply: ChallengeReply;
    try {
      reply = await callGateway<ChallengeReply>(challengeBrief(row), CHALLENGE_SYSTEM);
    } catch (error) {
      if (!(error instanceof GatewayUnavailableError)) throw error;
      return buildTemplateChallenge(row.blueprint ?? "", error.message);
    }
    const challenge = cleanChallenge(reply, row.blueprint ?? "");

    await supabaseAdmin.from("director_sessions").update({ challenge }).eq("id", row.id);

    /**
     * The emotional core and the winning execution get a permanent home here,
     * so a later question can never wipe them with the challenge record.
     */
    await rememberCreativeTruth(row, {
      emotional_core: challenge.reality?.execution?.emotional_core ?? "",
      what_must_survive: challenge.reality?.execution?.intention ?? "",
      chosen_execution: row.blueprint ?? "",
      source: "ai_discovery" as CreativeTruth["source"],
    });

    return challenge;
  });

/**
 * "Accept recommendation" / "Fix with AI": the director's own fix becomes the
 * blueprint, recorded as its recommendation, and the challenge is cleared so
 * the fixed version can be challenged again.
 */
export const applyChallenge = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => refInput.parse(data))
  .handler(async ({ data }): Promise<{ blueprint: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { row } = await loadSession(data.director_session_id, data.session_id);

    const challenge = (row.challenge ?? null) as Challenge | null;
    if (!challenge) throw new Error("There is nothing to apply yet.");

    const blueprint = (challenge.improved_blueprint || row.blueprint || "").slice(0, 500);
    if (!blueprint) throw new Error("There is nothing to apply yet.");

    const model = readModel(row.film_model);
    const bible = (row.film_bible ?? null) as FilmBible | null;
    const applied: FilmBible | null = bible
      ? {
          ...bible,
          recommendations: [
            ...bible.recommendations,
            challenge.recommendation || challenge.weakness?.solution || "",
          ]
            .filter(Boolean)
            .slice(-10),
        }
      : null;

    await supabaseAdmin
      .from("director_sessions")
      .update({
        blueprint,
        film_bible: applied,
        film_model: model,
        challenge: { ...challenge, verdict: "ready", recommendation: "", weakness: null },
      })
      .eq("id", row.id);

    /** The director's version was accepted: its execution becomes the winner. */
    await rememberCreativeTruth(row, {
      emotional_core: challenge.reality?.execution?.emotional_core ?? "",
      what_must_survive: challenge.reality?.execution?.intention ?? "",
      chosen_execution: challenge.reality?.execution?.safer_execution || blueprint,
      source: "ai_recommendation",
    });

    return { blueprint };
  });

/**
 * "Keep my version": the creator's execution stands untouched, and the session
 * remembers the refusal so the reality check stops pushing simplifications it
 * has already lost. The blueprint is never modified here.
 */
export const keepMyVersion = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => refInput.parse(data))
  .handler(async ({ data }): Promise<{ kept: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { row } = await loadSession(data.director_session_id, data.session_id);

    const challenge = (row.challenge ?? null) as Challenge | null;
    const kept = (row.simplify_rejections ?? 0) + 1;

    await supabaseAdmin
      .from("director_sessions")
      .update({
        simplify_rejections: kept,
        challenge: challenge
          ? { ...challenge, verdict: "ready", recommendation: "", weakness: null }
          : challenge,
      })
      .eq("id", row.id);

    /** Keep my version: the creator's execution is authoritative from now on. */
    await rememberCreativeTruth(row, {
      emotional_core: challenge?.reality?.execution?.emotional_core ?? "",
      what_must_survive: challenge?.reality?.execution?.intention ?? "",
      chosen_execution: challenge?.reality?.execution?.risky_execution || row.blueprint || "",
      source: "user_decision",
    });

    return { kept };
  });
