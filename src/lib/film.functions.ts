import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { STYLES } from "@/lib/storyreel.functions";
import { readCreativeTruth } from "@/lib/director.functions";
import {
  buildGenerationRequest,
  checkFidelity,
  emptySceneTruth,
  mergeSceneTruth,
  readSceneTruth,
  sceneTruthSchema,
  type SceneTruth,
} from "@/lib/scene-truth";

/**
 * FILM PAGE — a finished director session becomes a shot list.
 *
 * The approved Film Bible is broken into 4-5 scenes, each one a single
 * continuous five-second vertical shot. Every scene carries its own credit
 * budget, a clarity verdict from the director, a render queue flag and the clip
 * it produced, so a creator can review the film scene by scene and spend
 * credits on the shots that matter most.
 *
 * Nothing here changes the generation pipeline: scenes are rendered with the
 * same server-side engine call the studio already uses.
 */

const AI_CHAT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.8-flash";

/** Credits one five-second take costs — the same price as every other shot. */
export const SHOT_COST = 70;

const styleValues = STYLES.map((s) => s.value) as unknown as [string, ...string[]];
const STYLE_PREFIX: Record<string, string> = Object.fromEntries(
  STYLES.map((s) => [s.value, s.prefix]),
);

export type ClarityVerdict = "clear" | "risky" | "unclear";

export type FilmScene = {
  id: string;
  scene_number: number;
  title: string;
  idea: string;
  narration: string;
  /** Credits to budget for this shot, including a likely second take. */
  credit_cost: number;
  /** Planning indicator 0-10 — how hard this shot is to render, not a prediction. */
  complexity: number | null;
  clarity_verdict: ClarityVerdict | null;
  clarity_note: string;
  queued: boolean;
  generation_id: string | null;
  status: "idle" | "queued" | "processing" | "completed" | "failed";
  video_url: string | null;
  voice_url: string | null;
  error_message: string | null;
  /** The authoritative structured version of this scene, read by generation. */
  truth: SceneTruth | null;
};

export type FilmView = {
  id: string;
  title: string;
  logline: string;
  setting: string;
  style: string;
  blueprint: string;
  created_at: string;
  characters: { name: string; look: string }[];
  director_session_id: string | null;
  saved: boolean;
  scenes: FilmScene[];
};

export type FilmSummary = {
  id: string;
  title: string;
  logline: string;
  style: string;
  created_at: string;
  scene_count: number;
  rendered_count: number;
  total_cost: number;
  saved: boolean;
};

const characterSchema = z.object({
  name: z.string().trim().max(80).default(""),
  look: z.string().trim().max(300).default(""),
});

const sceneSchema = z.object({
  title: z.string().trim().max(120).default(""),
  prompt: z.string().trim().max(500).default(""),
  narration: z.string().trim().max(300).default(""),
  complexity: z.coerce.number().min(0).max(10).optional(),
  clarity_verdict: z.string().trim().max(30).optional(),
  clarity_note: z.string().trim().max(300).optional(),
  truth: sceneTruthSchema.partial().optional(),
});

const breakdownSchema = z.object({
  title: z.string().trim().max(120).default("Untitled"),
  logline: z.string().trim().max(400).default(""),
  setting: z.string().trim().max(400).default(""),
  characters: z.array(characterSchema).max(4).default([]),
  scenes: z.array(sceneSchema).min(1).max(6).default([]),
});

function verdictOf(raw: string | undefined): ClarityVerdict | null {
  const value = (raw ?? "").toLowerCase();
  if (!value) return null;
  if (value.includes("unclear") || value.includes("red")) return "unclear";
  if (value.includes("risk") || value.includes("yellow")) return "risky";
  return "clear";
}

/** Complex shots usually need a second take, so the budget says so up front. */
function costFor(complexity: number | null) {
  return complexity !== null && complexity >= 7 ? SHOT_COST * 2 : SHOT_COST;
}

async function askAi(system: string, user: string): Promise<unknown> {
  const { readAiKey } = await import("@/lib/storyreel-core.server");

  const res = await fetch(AI_CHAT, {
    method: "POST",
    headers: { Authorization: `Bearer ${readAiKey()}`, "Content-Type": "application/json" },
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
    console.error("ai gateway failed", res.status, await res.text().catch(() => ""));
    throw new Error(
      res.status === 429
        ? "The director is busy right now. Try again in a moment."
        : res.status === 402
          ? "The AI credits for this workspace are used up. Top them up to keep working."
          : "The director could not finish this pass. Please try again.",
    );
  }

  const body = (await res.json().catch(() => null)) as
    | { choices?: { message?: { content?: string } }[] }
    | null;
  const text = body?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("The director came back empty. Please try again.");
  try {
    return JSON.parse(text.replace(/^```json\s*|```$/g, "")) as unknown;
  } catch {
    throw new Error("The director returned something unreadable. Please try again.");
  }
}

const BREAKDOWN_SYSTEM = `You are a film director turning an approved film bible into a shot list.

Each scene is rendered separately as ONE continuous five-second vertical (9:16) shot from a single text prompt. There are no cuts inside a scene, no subtitles and no dialogue you can rely on.

Break the film into 4 or 5 scenes that tell the approved story in order — no more, no less. Each scene is one readable moment: subject, action, camera move, lighting, mood. Keep the film bible's intention exactly; you are choosing execution, not rewriting the story. Name the recurring characters by name in every prompt they appear in, and repeat the shared setting language so the scenes look like one film.

For every scene also judge, honestly:
- "complexity": 0-10, how hard this exact shot is for a text-to-video model (crowds, transformations, time jumps, multiple actions, readable text and impossible camera moves are hard).
- "clarity_verdict": "clear" when the moment reads in five seconds without explanation, "risky" when it probably reads but is fragile, "unclear" when an audience would not follow it.
- "clarity_note": one short sentence naming what a viewer sees, or what would confuse them.

SCENE TRUTH CONTRACT: every scene also carries a structured "truth" object — the executable form of the approved film bible for THAT scene, not a summary of the whole film. Fill only what this scene genuinely has, leave the rest as empty strings, and never invent creative decisions the bible did not make. "emotional_core" is the one thing this scene must communicate. "what_must_survive" is the beat that may never disappear, whatever the execution becomes. "chosen_execution" is how this exact shot is staged — the winning execution, never a rejected alternative. Give each scene its own emotional purpose and execution; do not repeat one global paragraph across scenes. When a character, wardrobe item, object, location or planted clue must persist across scenes, say so in "continuity". Fill "twist", "reveal" and "foreshadowing" only in the scenes those elements actually touch, using the bible's turn as written. Leave "sound" and "dialogue" empty unless the bible asked for them.

Reply with JSON only, no markdown, in this exact shape:
{"title":string,"logline":string,"setting":string,"characters":[{"name":string,"look":string}],"scenes":[{"title":string,"prompt":string,"narration":string,"complexity":number,"clarity_verdict":string,"clarity_note":string,"truth":{"emotional_core":string,"what_must_survive":string,"chosen_execution":string,"characters":string,"action":string,"setting":string,"time_period":string,"wardrobe":string,"camera":string,"framing":string,"movement":string,"visual_direction":string,"lighting":string,"sound":string,"dialogue":string,"continuity":string,"twist":string,"reveal":string,"foreshadowing":string}}]}

Each prompt is under 400 characters. Each narration is one spoken voice-over sentence under 200 characters, or an empty string when the shot is stronger silent. No quotation marks, no camera brand names, no scene numbers inside the prompts.`;

const CLARITY_SYSTEM = `You are a film director reviewing a shot list for clarity before spending credits.

Every scene renders as ONE continuous five-second vertical shot: no cuts, no subtitles, no dialogue an audience can rely on. For each scene, judge only whether an audience understands what they are seeing in those five seconds — never rewrite the story, never invent problems, and say plainly when a scene is fine.

Reply with JSON only, no markdown:
{"scenes":[{"scene_number":number,"clarity_verdict":"clear"|"risky"|"unclear","clarity_note":string,"complexity":number,"fix":string}]}

"clarity_note" is one short sentence in the creator's language. "complexity" is 0-10 for how hard this shot is to render. "fix" is ONE simpler way to shoot the same intention, and an empty string when the scene needs no change.`;

const ref = z.object({
  film_id: z.string().uuid(),
  session_id: z.string().uuid(),
});

type SceneRow = {
  id: string;
  scene_number: number;
  title: string | null;
  idea: string | null;
  narration: string | null;
  credit_cost: number | null;
  complexity: number | null;
  clarity_verdict: string | null;
  clarity_note: string | null;
  queued: boolean | null;
  generation_id: string | null;
  truth: unknown;
};

async function loadFilm(film_id: string, session_id: string): Promise<FilmView> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { signedUrl } = await import("@/lib/storyreel-core.server");

  const { data: story } = await supabaseAdmin
    .from("stories")
    .select(
      "id, title, logline, setting, style, characters, blueprint, created_at, director_session_id",
    )
    .eq("id", film_id)
    .eq("session_id", session_id)
    .maybeSingle();

  if (!story) throw new Error("That film could not be found.");

  const { data: sceneRows } = await supabaseAdmin
    .from("story_scenes")
    .select(
      "id, scene_number, title, idea, narration, credit_cost, complexity, clarity_verdict, clarity_note, queued, generation_id, truth",
    )
    .eq("story_id", film_id)
    .order("scene_number", { ascending: true });

  const rows = (sceneRows ?? []) as SceneRow[];
  const generationIds = rows.map((s) => s.generation_id).filter((v): v is string => !!v);

  const generations = generationIds.length
    ? ((
        await supabaseAdmin
          .from("generations")
          .select("id, status, video_url, voiceover_url, error_message")
          .in("id", generationIds)
      ).data ?? [])
    : [];

  const byId = new Map(generations.map((g) => [g.id as string, g]));

  const scenes: FilmScene[] = await Promise.all(
    rows.map(async (scene) => {
      const generation = scene.generation_id ? byId.get(scene.generation_id) : undefined;
      return {
        id: scene.id,
        scene_number: scene.scene_number,
        title: scene.title ?? "",
        idea: scene.idea ?? "",
        narration: scene.narration ?? "",
        credit_cost: scene.credit_cost ?? SHOT_COST,
        complexity: scene.complexity ?? null,
        clarity_verdict: verdictOf(scene.clarity_verdict ?? undefined),
        clarity_note: scene.clarity_note ?? "",
        queued: scene.queued === true,
        generation_id: scene.generation_id,
        status: (generation?.status as FilmScene["status"]) ?? "idle",
        video_url:
          generation?.status === "completed"
            ? await signedUrl(generation.video_url as string)
            : null,
        voice_url: await signedUrl((generation?.voiceover_url as string | null) ?? null),
        error_message: (generation?.error_message as string | null) ?? null,
        truth: readSceneTruth(scene.truth),
      };
    }),
  );

  const { data: saved } = await supabaseAdmin
    .from("film_watchlist")
    .select("id")
    .eq("session_id", session_id)
    .eq("story_id", film_id)
    .maybeSingle();

  const characters = z.array(characterSchema).safeParse(story.characters);

  return {
    id: story.id as string,
    title: (story.title as string) ?? "Untitled film",
    logline: (story.logline as string) ?? "",
    setting: (story.setting as string) ?? "",
    style: (story.style as string) ?? "cinematic",
    blueprint: (story.blueprint as string | null) ?? "",
    created_at: story.created_at as string,
    characters: characters.success ? characters.data : [],
    director_session_id: (story.director_session_id as string | null) ?? null,
    saved: !!saved,
    scenes,
  };
}

const buildInput = z.object({
  director_session_id: z.string().uuid(),
  session_id: z.string().uuid(),
  style: z.enum(styleValues).optional(),
});

/**
 * Break an approved film bible into a 4-5 scene shot list and store it as a
 * film. Re-running for the same director session returns the film that exists.
 */
export const buildFilm = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => buildInput.parse(data))
  .handler(({ data }) => buildFilmCore(data));

export async function buildFilmCore(
  data: z.infer<typeof buildInput>,
): Promise<FilmView> {
  {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("stories")
      .select("id")
      .eq("director_session_id", data.director_session_id)
      .eq("session_id", data.session_id)
      .maybeSingle();

    if (existing) return loadFilm(existing.id as string, data.session_id);

    const { data: session } = await supabaseAdmin
      .from("director_sessions")
      .select("id, idea, style, status, film_bible, recommendation, blueprint, challenge")
      .eq("id", data.director_session_id)
      .maybeSingle();

    if (!session) throw new Error("That director conversation could not be found.");
    if (!session.film_bible) throw new Error("Finish the director first — there is no film yet.");

    const style = (data.style ?? (session.style as string) ?? "cinematic") as string;
    const styleLabel = STYLES.find((s) => s.value === style)?.label ?? "Cinematic";

    const parsed = await askAi(
      BREAKDOWN_SYSTEM,
      [
        `ORIGINAL IDEA: ${session.idea as string}`,
        `Visual style: ${styleLabel}`,
        `Film bible (the authoritative version): ${JSON.stringify(session.film_bible)}`,
        `Director's recommendation: ${JSON.stringify(session.recommendation)}`,
        `Reality check already run on the single-shot version: ${JSON.stringify(session.challenge)}`,
        `Approved blueprint: ${(session.blueprint as string | null) ?? ""}`,
        "",
        "Break this approved film into 4 or 5 scenes as instructed.",
      ].join("\n"),
    );

    const breakdown = breakdownSchema.parse(parsed);
    const sceneList = breakdown.scenes.filter((scene) => scene.prompt.trim()).slice(0, 5);
    if (!sceneList.length) throw new Error("The director could not break this film into scenes.");

    const { data: story, error } = await supabaseAdmin
      .from("stories")
      .insert({
        session_id: data.session_id,
        theme: (session.idea as string).slice(0, 200),
        style,
        title: breakdown.title || "Untitled film",
        logline: breakdown.logline,
        setting: breakdown.setting,
        characters: breakdown.characters,
        blueprint: (session.blueprint as string | null) ?? "",
        director_session_id: data.director_session_id,
      })
      .select("id")
      .single();

    if (error || !story) throw new Error("Could not save this film. Please try again.");

    const rows = sceneList.map((scene, index) => {
      const complexity =
        scene.complexity === undefined ? null : Math.round(Math.min(10, Math.max(0, scene.complexity)));
      return {
        story_id: story.id as string,
        scene_number: index + 1,
        title: scene.title || `Scene ${index + 1}`,
        idea: scene.prompt,
        narration: scene.narration ?? "",
        complexity,
        credit_cost: costFor(complexity),
        clarity_verdict: verdictOf(scene.clarity_verdict),
        clarity_note: scene.clarity_note ?? "",
      };
    });

    const { error: sceneError } = await supabaseAdmin.from("story_scenes").insert(rows);
    if (sceneError) throw new Error("Could not save the scenes. Please try again.");

    return loadFilm(story.id as string, data.session_id);
  }
}

/** The film with its scenes, budgets, clarity notes and playable clips. */
export const getFilm = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ref.parse(data))
  .handler(({ data }) => loadFilm(data.film_id, data.session_id));

/** Review every scene for clarity and re-cost the shot list from what it finds. */
export const reviewScenes = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ref.parse(data))
  .handler(({ data }) => reviewScenesCore(data));

export async function reviewScenesCore(data: z.infer<typeof ref>): Promise<FilmView> {
  {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const film = await loadFilm(data.film_id, data.session_id);

    const parsed = await askAi(
      CLARITY_SYSTEM,
      [
        `Film: ${film.title}`,
        `Logline: ${film.logline}`,
        `Shared setting: ${film.setting}`,
        `Recurring characters: ${film.characters.map((c) => `${c.name}: ${c.look}`).join(". ")}`,
        `Visual style: ${STYLES.find((s) => s.value === film.style)?.label ?? "Cinematic"}`,
        "",
        "Scenes:",
        ...film.scenes.map((scene) => `${scene.scene_number}. ${scene.title} — ${scene.idea}`),
      ].join("\n"),
    );

    const reviewed = z
      .object({
        scenes: z
          .array(
            z.object({
              scene_number: z.coerce.number().min(1).max(20),
              clarity_verdict: z.string().trim().max(30).optional(),
              clarity_note: z.string().trim().max(300).optional(),
              complexity: z.coerce.number().min(0).max(10).optional(),
              fix: z.string().trim().max(300).optional(),
            }),
          )
          .default([]),
      })
      .parse(parsed).scenes;

    for (const item of reviewed) {
      const scene = film.scenes.find((s) => s.scene_number === item.scene_number);
      if (!scene) continue;
      const complexity =
        item.complexity === undefined
          ? scene.complexity
          : Math.round(Math.min(10, Math.max(0, item.complexity)));
      const note = [item.clarity_note ?? "", item.fix ? `Simpler take: ${item.fix}` : ""]
        .filter(Boolean)
        .join(" ")
        .slice(0, 300);

      await supabaseAdmin
        .from("story_scenes")
        .update({
          clarity_verdict: verdictOf(item.clarity_verdict) ?? scene.clarity_verdict,
          clarity_note: note || scene.clarity_note,
          complexity,
          credit_cost: costFor(complexity),
        })
        .eq("id", scene.id);
    }

    return loadFilm(data.film_id, data.session_id);
  }
}

const sceneRef = ref.extend({ scene_id: z.string().uuid() });

/** Star or unstar one scene in the render queue. */
export const queueScene = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sceneRef.extend({ queued: z.boolean() }).parse(data))
  .handler(async ({ data }): Promise<FilmView> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const film = await loadFilm(data.film_id, data.session_id);
    const scene = film.scenes.find((s) => s.id === data.scene_id);
    if (!scene) throw new Error("That scene could not be found.");

    await supabaseAdmin
      .from("story_scenes")
      .update({ queued: data.queued, queue_position: data.queued ? scene.scene_number : null })
      .eq("id", scene.id)
      .eq("story_id", film.id);

    return loadFilm(data.film_id, data.session_id);
  });

const renderInput = sceneRef.extend({
  engine: z.enum(["lovable", "fal", "live"]).optional().default("lovable"),
  audio: z.boolean().optional().default(false),
});

/** Render one scene into a real clip, with the film's look and cast locked in. */
export const renderScene = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => renderInput.parse(data))
  .handler(async ({ data }): Promise<{ generation_id: string; film: FilmView }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { startGeneration } = await import("@/lib/storyreel-core.server");

    const film = await loadFilm(data.film_id, data.session_id);
    const scene = film.scenes.find((s) => s.id === data.scene_id);
    if (!scene) throw new Error("That scene could not be found.");
    if (!scene.idea.trim()) throw new Error("Write this scene before rendering it.");

    const cast = film.characters
      .filter((c) => c.name || c.look)
      .map((c) => `${c.name}: ${c.look}`)
      .join(". ");

    const prompt = [
      STYLE_PREFIX[film.style] ?? STYLE_PREFIX["cinematic"],
      cast ? `Recurring characters — ${cast}. ` : "",
      film.setting ? `Same setting throughout — ${film.setting}. ` : "",
      `Scene ${scene.scene_number}: ${scene.idea.trim()}`,
    ]
      .join("")
      .slice(0, 1800);

    const generationId = await startGeneration({
      session_id: data.session_id,
      idea: scene.idea.trim(),
      style: film.style,
      prompt,
      audio: data.audio,
      provider: data.engine,
      story_id: film.id,
      scene_number: scene.scene_number,
      narration: scene.narration,
    });

    await supabaseAdmin
      .from("story_scenes")
      .update({ generation_id: generationId })
      .eq("id", scene.id);

    return { generation_id: generationId, film: await loadFilm(data.film_id, data.session_id) };
  });

/** Save this film to the watchlist, or take it off again. */
export const toggleWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ref.extend({ saved: z.boolean() }).parse(data))
  .handler(async ({ data }): Promise<{ saved: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const film = await loadFilm(data.film_id, data.session_id);

    if (data.saved) {
      await supabaseAdmin
        .from("film_watchlist")
        .upsert(
          { session_id: data.session_id, story_id: film.id },
          { onConflict: "session_id,story_id" },
        );
    } else {
      await supabaseAdmin
        .from("film_watchlist")
        .delete()
        .eq("session_id", data.session_id)
        .eq("story_id", film.id);
    }

    return { saved: data.saved };
  });

const listInput = z.object({
  session_id: z.string().uuid(),
  saved_only: z.boolean().optional().default(false),
});

/** Every film made in this browser, with its budget and how much is rendered. */
export const listFilms = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => listInput.parse(data))
  .handler(async ({ data }): Promise<FilmSummary[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: saved } = await supabaseAdmin
      .from("film_watchlist")
      .select("story_id")
      .eq("session_id", data.session_id);

    const savedIds = new Set((saved ?? []).map((row) => row.story_id as string));

    const { data: rows } = await supabaseAdmin
      .from("stories")
      .select("id, title, logline, style, created_at")
      .eq("session_id", data.session_id)
      .order("created_at", { ascending: false })
      .limit(50);

    const films = (rows ?? []).filter((row) =>
      data.saved_only ? savedIds.has(row.id as string) : true,
    );
    if (!films.length) return [];

    const { data: sceneRows } = await supabaseAdmin
      .from("story_scenes")
      .select("story_id, credit_cost, generation_id")
      .in(
        "story_id",
        films.map((row) => row.id as string),
      );

    const generationIds = (sceneRows ?? [])
      .map((row) => row.generation_id as string | null)
      .filter((v): v is string => !!v);

    const done = new Set(
      generationIds.length
        ? (
            (
              await supabaseAdmin
                .from("generations")
                .select("id, status")
                .in("id", generationIds)
                .eq("status", "completed")
            ).data ?? []
          ).map((row) => row.id as string)
        : [],
    );

    return films.map((row) => {
      const scenes = (sceneRows ?? []).filter((scene) => scene.story_id === row.id);
      return {
        id: row.id as string,
        title: (row.title as string) ?? "Untitled film",
        logline: (row.logline as string) ?? "",
        style: (row.style as string) ?? "cinematic",
        created_at: row.created_at as string,
        scene_count: scenes.length,
        rendered_count: scenes.filter(
          (scene) => scene.generation_id && done.has(scene.generation_id as string),
        ).length,
        total_cost: scenes.reduce((sum, scene) => sum + ((scene.credit_cost as number) ?? SHOT_COST), 0),
        saved: savedIds.has(row.id as string),
      };
    });
  });
