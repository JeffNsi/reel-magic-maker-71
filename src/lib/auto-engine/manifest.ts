/**
 * Auto Engine — film manifest (pure).
 *
 * Turns the rows a film already has (stories, story_scenes, generations) into
 * the ordered, frozen list of clips the render worker assembles. It mirrors
 * the film page exactly: a scene's clip is the generation its `generation_id`
 * points at, and only a completed generation with a stored clip counts.
 *
 * Pure: no database, no network, no AI, no credits, no mutation of inputs.
 * Spoiler-safe: Scene Truth (twist, reveal, foreshadowing …), owners and
 * billing never enter the manifest — it carries only what assembly needs.
 * Episodes (several films in a row, minutes long) are built by joining film
 * manifests with `combineManifests`, so a 20-second short and a 10-minute
 * episode go through the same worker.
 */

export const MANIFEST_VERSION = 1 as const;
/** Every engine renders 5-second clips today; the worker measures the real length. */
export const DEFAULT_CLIP_MS = 5_000;
/** Bucket the scene clips and voice-overs live in (see storyreel-core.server.ts). */
export const CLIP_BUCKET = "videos" as const;
/** Upper bound for one manifest: 720 clips of 5 s = 60 minutes. */
export const MAX_SEGMENTS = 720;

export type ManifestStoryInput = {
  id: string;
  title: string | null;
};

export type ManifestSceneInput = {
  id: string;
  scene_number: number;
  title: string | null;
  narration: string | null;
  generation_id: string | null;
};

export type ManifestGenerationInput = {
  id: string;
  story_id: string | null;
  status: string | null;
  video_url: string | null;
  voiceover_url: string | null;
  provider: string | null;
};

export type ManifestIssueCode =
  | "no_scenes"
  | "no_films"
  | "too_many_segments"
  | "duplicate_scene_number"
  | "scene_not_rendered"
  | "generation_missing"
  | "generation_other_film"
  | "clip_not_ready"
  | "clip_path_missing"
  | "clip_path_invalid"
  | "voice_path_invalid"
  | "no_narration"
  | "narration_missing";

export type ManifestIssue = {
  code: ManifestIssueCode;
  /** `error` blocks assembly; `warning` is shown but never blocks. */
  severity: "error" | "warning";
  story_id: string | null;
  scene_number: number | null;
  /** Bilingual, plain language, no technical detail: "English / Svenska". */
  message: string;
};

export type ManifestSegment = {
  /** 0-based position in the final cut. */
  index: number;
  story_id: string;
  scene_id: string;
  scene_number: number;
  title: string;
  generation_id: string;
  /** Object path inside the clip bucket, e.g. "<generation_id>.mp4". Never a URL. */
  clip_path: string;
  voice_path: string | null;
  /** Trimmed narration for subtitles; null when the scene has none. */
  narration: string | null;
  provider: string | null;
  /** Planning estimate only; the worker measures every clip before cutting. */
  expected_duration_ms: number;
  /** Expected start of this segment in the final cut. */
  expected_start_ms: number;
};

export type ManifestSubject =
  | { type: "film"; story_id: string }
  | { type: "episode"; drama_id: string; episode_number: number };

export type FilmManifest = {
  manifest_version: typeof MANIFEST_VERSION;
  subject: ManifestSubject;
  title: string;
  aspect_ratio: "9:16";
  clip_bucket: typeof CLIP_BUCKET;
  /** Films in this manifest, in playing order (one for a film, several for an episode). */
  story_ids: string[];
  segments: ManifestSegment[];
  totals: {
    segments: number;
    expected_duration_ms: number;
    with_voice: number;
    with_narration: number;
  };
  issues: ManifestIssue[];
  /** True only when there is at least one segment and no error-level issue. */
  ready: boolean;
};

const MESSAGES: Record<ManifestIssueCode, string> = {
  no_scenes: "This film has no scenes yet. / Filmen har inga scener än.",
  no_films: "Add at least one film to the episode. / Lägg till minst en film i avsnittet.",
  too_many_segments: `More than ${MAX_SEGMENTS} clips in one cut. Split it into episodes. / Fler än ${MAX_SEGMENTS} klipp i en version. Dela upp den i avsnitt.`,
  duplicate_scene_number:
    "Two scenes share the same number, so the order is unclear. / Två scener har samma nummer, så ordningen är oklar.",
  scene_not_rendered: "This scene has no clip yet. / Scenen har inget klipp än.",
  generation_missing:
    "This scene points to a clip that no longer exists. / Scenen pekar på ett klipp som inte finns längre.",
  generation_other_film:
    "This scene points to a clip from another film. / Scenen pekar på ett klipp från en annan film.",
  clip_not_ready: "This scene's clip is not finished. / Klippet för scenen är inte färdigt.",
  clip_path_missing:
    "This scene's clip finished but was never stored. / Klippet blev klart men sparades aldrig.",
  clip_path_invalid:
    "This scene's clip is not stored in the project's video storage. / Klippet ligger inte i projektets videolagring.",
  voice_path_invalid:
    "The voice-over for this scene is not in the project's storage and is skipped. / Berättarrösten ligger inte i projektets lagring och hoppas över.",
  no_narration:
    "No scene has narration, so subtitles will be unavailable. / Ingen scen har berättartext, så undertexter saknas.",
  narration_missing:
    "This scene has no narration, so it gets no subtitle. / Scenen saknar berättartext och får ingen undertext.",
};

const ERROR_CODES: ReadonlySet<ManifestIssueCode> = new Set<ManifestIssueCode>([
  "no_scenes",
  "no_films",
  "too_many_segments",
  "duplicate_scene_number",
  "scene_not_rendered",
  "generation_missing",
  "generation_other_film",
  "clip_not_ready",
  "clip_path_missing",
  "clip_path_invalid",
]);

function issue(
  code: ManifestIssueCode,
  story_id: string | null,
  scene_number: number | null,
): ManifestIssue {
  return {
    code,
    severity: ERROR_CODES.has(code) ? "error" : "warning",
    story_id,
    scene_number,
    message: MESSAGES[code],
  };
}

/**
 * A storage object path the worker may fetch: relative, no traversal, no
 * scheme, ending in an allowed extension. Anything else is never handed to the
 * worker, so a stored URL can not make it fetch from elsewhere.
 */
function safeObjectPath(value: string | null, extensions: readonly string[]): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path || path.length > 512) return null;
  if (path.startsWith("/") || path.includes("..") || path.includes("://") || path.includes("\\"))
    return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path)) return null;
  const lower = path.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext)) ? path : null;
}

const CLIP_EXTENSIONS = [".mp4"] as const;
const VOICE_EXTENSIONS = [".mp3", ".wav", ".m4a"] as const;

function cleanText(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text : null;
}

function withTimeline(segments: Omit<ManifestSegment, "index" | "expected_start_ms">[]) {
  let start = 0;
  return segments.map((segment, index) => {
    const placed: ManifestSegment = { ...segment, index, expected_start_ms: start };
    start += segment.expected_duration_ms;
    return placed;
  });
}

function totalsOf(segments: ManifestSegment[]): FilmManifest["totals"] {
  return {
    segments: segments.length,
    expected_duration_ms: segments.reduce((sum, s) => sum + s.expected_duration_ms, 0),
    with_voice: segments.filter((s) => s.voice_path !== null).length,
    with_narration: segments.filter((s) => s.narration !== null).length,
  };
}

function isReady(segments: ManifestSegment[], issues: ManifestIssue[]) {
  return segments.length > 0 && !issues.some((i) => i.severity === "error");
}

/** Build the assembly manifest for one film from its existing rows. */
export function buildFilmManifest(input: {
  story: ManifestStoryInput;
  scenes: readonly ManifestSceneInput[];
  generations: readonly ManifestGenerationInput[];
}): FilmManifest {
  const storyId = input.story.id;
  const issues: ManifestIssue[] = [];
  const byId = new Map(input.generations.map((g) => [g.id, g]));

  const scenes = [...input.scenes].sort(
    (a, b) => a.scene_number - b.scene_number || a.id.localeCompare(b.id),
  );
  if (!scenes.length) issues.push(issue("no_scenes", storyId, null));

  const seen = new Map<number, number>();
  for (const scene of scenes) seen.set(scene.scene_number, (seen.get(scene.scene_number) ?? 0) + 1);
  for (const [number, count] of seen) {
    if (count > 1) issues.push(issue("duplicate_scene_number", storyId, number));
  }

  const resolved: Omit<ManifestSegment, "index" | "expected_start_ms">[] = [];
  for (const scene of scenes) {
    const n = scene.scene_number;
    if (!scene.generation_id) {
      issues.push(issue("scene_not_rendered", storyId, n));
      continue;
    }
    const generation = byId.get(scene.generation_id);
    if (!generation) {
      issues.push(issue("generation_missing", storyId, n));
      continue;
    }
    if (generation.story_id !== storyId) {
      issues.push(issue("generation_other_film", storyId, n));
      continue;
    }
    if (generation.status !== "completed") {
      issues.push(issue("clip_not_ready", storyId, n));
      continue;
    }
    if (!generation.video_url || !generation.video_url.trim()) {
      issues.push(issue("clip_path_missing", storyId, n));
      continue;
    }
    const clip = safeObjectPath(generation.video_url, CLIP_EXTENSIONS);
    if (!clip) {
      issues.push(issue("clip_path_invalid", storyId, n));
      continue;
    }
    const voice = safeObjectPath(generation.voiceover_url, VOICE_EXTENSIONS);
    if (generation.voiceover_url && !voice) issues.push(issue("voice_path_invalid", storyId, n));

    resolved.push({
      story_id: storyId,
      scene_id: scene.id,
      scene_number: n,
      title: cleanText(scene.title) ?? `Scene ${n}`,
      generation_id: generation.id,
      clip_path: clip,
      voice_path: voice,
      narration: cleanText(scene.narration),
      provider: generation.provider ?? null,
      expected_duration_ms: DEFAULT_CLIP_MS,
    });
  }

  if (resolved.length > MAX_SEGMENTS) issues.push(issue("too_many_segments", storyId, null));

  const narrated = resolved.filter((s) => s.narration !== null);
  if (resolved.length && !narrated.length) {
    issues.push(issue("no_narration", storyId, null));
  } else {
    for (const s of resolved)
      if (s.narration === null) issues.push(issue("narration_missing", storyId, s.scene_number));
  }

  const segments = withTimeline(resolved);
  return {
    manifest_version: MANIFEST_VERSION,
    subject: { type: "film", story_id: storyId },
    title: cleanText(input.story.title) ?? "Untitled film",
    aspect_ratio: "9:16",
    clip_bucket: CLIP_BUCKET,
    story_ids: [storyId],
    segments,
    totals: totalsOf(segments),
    issues,
    ready: isReady(segments, issues),
  };
}

/**
 * Join film manifests, in the given order, into one episode manifest. Every
 * film's issues travel with it, so one unfinished scene keeps the episode from
 * being assembled and says exactly which film and scene it is.
 */
export function combineManifests(
  parts: readonly FilmManifest[],
  episode: { drama_id: string; episode_number: number; title: string },
): FilmManifest {
  const issues: ManifestIssue[] = parts.flatMap((p) => p.issues);
  if (!parts.length) issues.push(issue("no_films", null, null));

  const joined = parts.flatMap((p) =>
    p.segments.map(({ index: _index, expected_start_ms: _start, ...rest }) => rest),
  );
  if (joined.length > MAX_SEGMENTS && !issues.some((i) => i.code === "too_many_segments")) {
    issues.push(issue("too_many_segments", null, null));
  }
  const segments = withTimeline(joined);
  return {
    manifest_version: MANIFEST_VERSION,
    subject: {
      type: "episode",
      drama_id: episode.drama_id,
      episode_number: episode.episode_number,
    },
    title: cleanText(episode.title) ?? `Episode ${episode.episode_number}`,
    aspect_ratio: "9:16",
    clip_bucket: CLIP_BUCKET,
    story_ids: parts.flatMap((p) => p.story_ids),
    segments,
    totals: totalsOf(segments),
    issues,
    ready: parts.length > 0 && parts.every((p) => p.ready) && isReady(segments, issues),
  };
}

/** Deterministic JSON: object keys sorted at every level. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/**
 * The part of a manifest that changes the rendered output. Titles, totals and
 * issues are left out, so renaming a film does not force a re-render.
 */
export function manifestFingerprint(manifest: FilmManifest): string {
  return canonicalJson({
    manifest_version: manifest.manifest_version,
    subject: manifest.subject,
    aspect_ratio: manifest.aspect_ratio,
    clip_bucket: manifest.clip_bucket,
    segments: manifest.segments.map((s) => ({
      story_id: s.story_id,
      scene_number: s.scene_number,
      generation_id: s.generation_id,
      clip_path: s.clip_path,
      voice_path: s.voice_path,
      narration: s.narration,
    })),
  });
}

/** SHA-256 (hex) of the fingerprint: the key that stops the same cut being rendered twice. */
export async function manifestHash(manifest: FilmManifest): Promise<string> {
  const bytes = new TextEncoder().encode(manifestFingerprint(manifest));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
