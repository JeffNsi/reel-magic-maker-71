import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { STYLES } from "@/lib/storyreel.functions";

/**
 * STORYREEL story studio: theme -> multiple film concepts, a story bible
 * (characters + setting) and scene-by-scene generation with voice-over.
 */

const styleValues = STYLES.map((s) => s.value) as unknown as [string, ...string[]];
const STYLE_PREFIX: Record<string, string> = Object.fromEntries(
  STYLES.map((s) => [s.value, s.prefix]),
);

const AI_CHAT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_SPEECH = "https://ai.gateway.lovable.dev/v1/audio/speech";

export type StoryCharacter = { name: string; look: string };

export type StoryConcept = {
  title: string;
  logline: string;
  setting: string;
  characters: StoryCharacter[];
  scenes: { title: string; prompt: string; narration: string }[];
};

export type SceneView = {
  id: string;
  scene_number: number;
  title: string;
  idea: string;
  narration: string;
  generation_id: string | null;
  status: "idle" | "queued" | "processing" | "completed" | "failed";
  video_url: string | null;
  voice_url: string | null;
  error_message: string | null;
};

export type StoryView = {
  id: string;
  theme: string;
  style: string;
  title: string;
  logline: string;
  setting: string;
  characters: StoryCharacter[];
  created_at: string;
  scenes: SceneView[];
};

const characterSchema = z.object({
  name: z.string().trim().max(80).default(""),
  look: z.string().trim().max(300).default(""),
});

const conceptSchema = z.object({
  title: z.string().trim().max(120).default("Untitled"),
  logline: z.string().trim().max(400).default(""),
  setting: z.string().trim().max(400).default(""),
  characters: z.array(characterSchema).max(4).default([]),
  scenes: z
    .array(
      z.object({
        title: z.string().trim().max(120).default(""),
        prompt: z.string().trim().max(500).default(""),
        narration: z.string().trim().max(300).default(""),
      }),
    )
    .max(6)
    .default([]),
});

async function askAi(key: string, system: string, user: string) {
  const res = await fetch(AI_CHAT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.8-flash",
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
        ? "The story writer is busy. Try again in a moment."
        : res.status === 402
          ? "The AI credits for this workspace are used up. Top them up to keep writing."
          : "The story writer could not finish. Please try again.",
    );
  }

  const body = (await res.json().catch(() => null)) as
    | { choices?: { message?: { content?: string } }[] }
    | null;
  const text = body?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("The story writer came back empty. Please try again.");
  try {
    return JSON.parse(text.replace(/^```json\s*|```$/g, "")) as unknown;
  } catch {
    throw new Error("The story writer returned something unreadable. Please try again.");
  }
}

const packInput = z.object({
  theme: z.string().trim().min(1, "Give me a theme first.").max(200),
  style: z.enum(styleValues),
  scene_count: z.number().int().min(1).max(6).optional().default(3),
});

/** Turn one theme into several complete short-film concepts with characters and scenes. */
export const writeStoryPack = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => packInput.parse(data))
  .handler(async ({ data }): Promise<{ concepts: StoryConcept[] }> => {
    const { readAiKey } = await import("@/lib/storyreel-core.server");
    const key = readAiKey();
    const styleLabel = STYLES.find((s) => s.value === data.style)?.label ?? "Cinematic";

    const parsed = await askAi(
      key,
      "You are a short-film director writing prompts for a text-to-video model. Each scene renders as " +
        "ONE continuous 5-second vertical shot, so each scene prompt is a single moment: subject, action, " +
        "camera move, lighting, mood. Reply with JSON only, no markdown, in this shape: " +
        '{"concepts":[{"title":string,"logline":string,"setting":string,' +
        '"characters":[{"name":string,"look":string}],' +
        '"scenes":[{"title":string,"prompt":string,"narration":string}]}]}. ' +
        "Give exactly 3 different concepts. Each concept has 1-4 characters with vivid, repeatable physical " +
        `descriptions, one shared setting, and exactly ${data.scene_count} scenes that tell one story in order. ` +
        "Each scene prompt is under 400 characters and names the characters by name so they stay consistent. " +
        "Each narration is one spoken sentence of voice-over under 200 characters. No dialogue, no quotation marks.",
      `Theme: ${data.theme}\nVisual style: ${styleLabel}`,
    );

    const concepts = z
      .object({ concepts: z.array(conceptSchema).min(1).max(4) })
      .parse(parsed).concepts;

    return { concepts };
  });

const saveInput = z.object({
  session_id: z.string().uuid(),
  theme: z.string().trim().max(200).default(""),
  style: z.enum(styleValues),
  concept: conceptSchema,
});

/** Persist a chosen concept as an editable story with its scenes. */
export const saveStory = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data }): Promise<{ story_id: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: story, error } = await supabaseAdmin
      .from("stories")
      .insert({
        session_id: data.session_id,
        theme: data.theme,
        style: data.style,
        title: data.concept.title,
        logline: data.concept.logline,
        setting: data.concept.setting,
        characters: data.concept.characters,
      })
      .select("id")
      .single();

    if (error || !story) throw new Error("Could not save this story. Please try again.");

    const scenes = (data.concept.scenes.length ? data.concept.scenes : [{ title: "Scene 1", prompt: "", narration: "" }]).map(
      (scene, index) => ({
        story_id: story.id,
        scene_number: index + 1,
        title: scene.title || `Scene ${index + 1}`,
        idea: scene.prompt,
        narration: scene.narration,
      }),
    );

    const { error: sceneError } = await supabaseAdmin.from("story_scenes").insert(scenes);
    if (sceneError) throw new Error("Could not save the scenes. Please try again.");

    return { story_id: story.id as string };
  });

const sessionOnly = z.object({ session_id: z.string().uuid() });

/** Every story made in this browser, newest first. */
export const listStories = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sessionOnly.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("stories")
      .select("id, title, logline, style, created_at")
      .eq("session_id", data.session_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("Could not load your stories.");
    return (rows ?? []) as {
      id: string;
      title: string;
      logline: string;
      style: string;
      created_at: string;
    }[];
  });

const storyRef = z.object({
  story_id: z.string().uuid(),
  session_id: z.string().uuid(),
});

async function loadStory(story_id: string, session_id: string): Promise<StoryView> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { signedUrl } = await import("@/lib/storyreel-core.server");

  const { data: story, error } = await supabaseAdmin
    .from("stories")
    .select("id, theme, style, title, logline, setting, characters, created_at")
    .eq("id", story_id)
    .eq("session_id", session_id)
    .maybeSingle();

  if (error || !story) throw new Error("That story could not be found.");

  const { data: sceneRows } = await supabaseAdmin
    .from("story_scenes")
    .select("id, scene_number, title, idea, narration, generation_id")
    .eq("story_id", story_id)
    .order("scene_number", { ascending: true });

  const generationIds = (sceneRows ?? [])
    .map((s) => s.generation_id)
    .filter((v): v is string => !!v);

  const generations = generationIds.length
    ? (
        await supabaseAdmin
          .from("generations")
          .select("id, status, video_url, voiceover_url, error_message")
          .in("id", generationIds)
      ).data ?? []
    : [];

  const byId = new Map(generations.map((g) => [g.id as string, g]));

  const scenes: SceneView[] = await Promise.all(
    (sceneRows ?? []).map(async (scene) => {
      const generation = scene.generation_id ? byId.get(scene.generation_id) : undefined;
      return {
        id: scene.id as string,
        scene_number: scene.scene_number as number,
        title: (scene.title as string) ?? "",
        idea: (scene.idea as string) ?? "",
        narration: (scene.narration as string) ?? "",
        generation_id: (scene.generation_id as string | null) ?? null,
        status: (generation?.status as SceneView["status"]) ?? "idle",
        video_url:
          generation?.status === "completed" ? await signedUrl(generation.video_url as string) : null,
        voice_url: await signedUrl((generation?.voiceover_url as string | null) ?? null),
        error_message: (generation?.error_message as string | null) ?? null,
      };
    }),
  );

  const characters = characterListFrom(story.characters);

  return {
    id: story.id as string,
    theme: (story.theme as string) ?? "",
    style: (story.style as string) ?? "cinematic",
    title: (story.title as string) ?? "",
    logline: (story.logline as string) ?? "",
    setting: (story.setting as string) ?? "",
    characters,
    created_at: story.created_at as string,
    scenes,
  };
}

function characterListFrom(value: unknown): StoryCharacter[] {
  const result = z.array(characterSchema).safeParse(value);
  return result.success ? result.data : [];
}

/** Full story with its scenes and playable links. */
export const getStory = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => storyRef.parse(data))
  .handler(({ data }) => loadStory(data.story_id, data.session_id));

const bibleInput = storyRef.extend({
  title: z.string().trim().max(120),
  setting: z.string().trim().max(400),
  characters: z.array(characterSchema).max(6),
});

/** Save the story bible: title, shared setting and the recurring characters. */
export const saveBible = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => bibleInput.parse(data))
  .handler(async ({ data }): Promise<StoryView> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("stories")
      .update({ title: data.title, setting: data.setting, characters: data.characters })
      .eq("id", data.story_id)
      .eq("session_id", data.session_id);
    if (error) throw new Error("Could not save your changes.");
    return loadStory(data.story_id, data.session_id);
  });

const sceneInput = storyRef.extend({
  scene_number: z.number().int().min(1).max(20),
  title: z.string().trim().max(120),
  idea: z.string().trim().max(500),
  narration: z.string().trim().max(300),
});

/** Create or update one scene of the story. */
export const saveScene = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sceneInput.parse(data))
  .handler(async ({ data }): Promise<StoryView> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: story } = await supabaseAdmin
      .from("stories")
      .select("id")
      .eq("id", data.story_id)
      .eq("session_id", data.session_id)
      .maybeSingle();
    if (!story) throw new Error("That story could not be found.");

    const { error } = await supabaseAdmin.from("story_scenes").upsert(
      {
        story_id: data.story_id,
        scene_number: data.scene_number,
        title: data.title || `Scene ${data.scene_number}`,
        idea: data.idea,
        narration: data.narration,
      },
      { onConflict: "story_id,scene_number" },
    );
    if (error) throw new Error("Could not save this scene.");

    return loadStory(data.story_id, data.session_id);
  });

const deleteSceneInput = storyRef.extend({ scene_id: z.string().uuid() });

/** Remove one scene from the story. */
export const deleteScene = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => deleteSceneInput.parse(data))
  .handler(async ({ data }): Promise<StoryView> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: story } = await supabaseAdmin
      .from("stories")
      .select("id")
      .eq("id", data.story_id)
      .eq("session_id", data.session_id)
      .maybeSingle();
    if (!story) throw new Error("That story could not be found.");

    await supabaseAdmin.from("story_scenes").delete().eq("id", data.scene_id).eq("story_id", data.story_id);
    return loadStory(data.story_id, data.session_id);
  });

const generateSceneInput = storyRef.extend({
  scene_id: z.string().uuid(),
  audio: z.boolean().optional().default(false),
  engine: z.enum(["lovable", "fal", "live"]).optional().default("lovable"),
});

/** Build a consistency-locked prompt for one scene and send it to the video model. */
export const generateScene = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => generateSceneInput.parse(data))
  .handler(async ({ data }): Promise<{ generation_id: string; story: StoryView }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { startGeneration } = await import("@/lib/storyreel-core.server");

    const story = await loadStory(data.story_id, data.session_id);
    const scene = story.scenes.find((s) => s.id === data.scene_id);
    if (!scene) throw new Error("That scene could not be found.");
    if (!scene.idea.trim()) throw new Error("Write this scene before generating it.");

    const cast = story.characters
      .filter((c) => c.name || c.look)
      .map((c) => `${c.name}: ${c.look}`)
      .join(". ");

    const prompt = [
      STYLE_PREFIX[story.style] ?? STYLE_PREFIX["cinematic"],
      cast ? `Recurring characters — ${cast}. ` : "",
      story.setting ? `Same setting throughout — ${story.setting}. ` : "",
      `Scene ${scene.scene_number}: ${scene.idea.trim()}`,
    ]
      .join("")
      .slice(0, 1800);

    const generationId = await startGeneration({
      session_id: data.session_id,
      idea: scene.idea.trim(),
      style: story.style,
      prompt,
      audio: data.audio,
      provider: data.engine,
      story_id: story.id,
      scene_number: scene.scene_number,
      narration: scene.narration,
    });

    await supabaseAdmin
      .from("story_scenes")
      .update({ generation_id: generationId })
      .eq("id", scene.id);

    return { generation_id: generationId, story: await loadStory(data.story_id, data.session_id) };
  });

const narrateInput = z.object({
  session_id: z.string().uuid(),
  generation_id: z.string().uuid(),
  text: z.string().trim().min(1, "Write the voice-over line first.").max(600),
  voice: z.string().trim().max(40).optional().default("alloy"),
  music: z.string().trim().max(40).optional().default("none"),
});

/** Record the voice-over for a finished clip and store it next to the video. */
export const narrateGeneration = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => narrateInput.parse(data))
  .handler(async ({ data }): Promise<{ voice_url: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readAiKey, signedUrl, BUCKET } = await import("@/lib/storyreel-core.server");

    const { data: row } = await supabaseAdmin
      .from("generations")
      .select("id")
      .eq("id", data.generation_id)
      .eq("session_id", data.session_id)
      .maybeSingle();
    if (!row) throw new Error("That clip could not be found.");

    const res = await fetch(AI_SPEECH, {
      method: "POST",
      headers: { Authorization: `Bearer ${readAiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: data.text,
        voice: data.voice || "alloy",
        response_format: "mp3",
        instructions:
          "Read as a cinematic film-trailer narrator: calm, warm, unhurried, with weight on the last words.",
      }),
    });

    if (!res.ok) {
      console.error("tts failed", res.status, await res.text().catch(() => ""));
      throw new Error(
        res.status === 429
          ? "The voice service is busy. Try again in a moment."
          : res.status === 402
            ? "The AI credits for this workspace are used up. Top them up to record voice-over."
            : "The voice-over could not be recorded. Please try again.",
      );
    }

    const bytes = await res.arrayBuffer();
    const path = `${data.generation_id}-voice.mp3`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
    if (uploadError) {
      console.error("voice upload failed", uploadError);
      throw new Error("The voice-over could not be saved. Please try again.");
    }

    await supabaseAdmin
      .from("generations")
      .update({ voiceover_url: path, narration: data.text, music_track: data.music })
      .eq("id", data.generation_id);

    const url = await signedUrl(path);
    if (!url) throw new Error("The voice-over could not be loaded. Please try again.");
    return { voice_url: url };
  });

export const VOICES = [
  { value: "alloy", label: "Alloy — neutral" },
  { value: "onyx", label: "Onyx — deep" },
  { value: "nova", label: "Nova — bright" },
  { value: "shimmer", label: "Shimmer — soft" },
] as const;

export const MUSIC_BEDS = [
  { value: "none", label: "No music" },
  { value: "tension", label: "Tension — low strings" },
  { value: "wonder", label: "Wonder — warm pad" },
  { value: "dread", label: "Dread — dark drone" },
  { value: "hope", label: "Hope — bright pad" },
] as const;
