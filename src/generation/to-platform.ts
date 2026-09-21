import { getModel } from "./catalog";
import type { GenerationPlane, MediaItem, MediaRole, ModelEntry } from "./catalog/types";

/**
 * Resolve a GenerationPlane against the catalogue and map it to the platform's
 * own field names. Unknown settings are dropped, never forwarded. Out-of-range
 * or unlisted values are rejected with a message the creator can act on.
 */

export type ResolvedRequest = {
  entry: ModelEntry;
  /** Platform path for this plane, chosen from the media roles actually filled. */
  path: string;
  body: Record<string, unknown>;
};

const ROLE_KIND: Record<MediaRole, MediaItem["kind"]> = {
  start: "image",
  end: "image",
  reference: "image",
  video: "video",
  audio: "audio",
};

function validateSettings(entry: ModelEntry, settings: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(entry.settings)) {
    const raw = key in settings ? settings[key] : field.default;
    if (field.type === "enum") {
      if (typeof raw !== "string" || !field.values.includes(raw)) {
        throw new Error(
          `${entry.label} does not accept ${key} = ${String(raw)}. Allowed: ${field.values.join(", ")}.`,
        );
      }
      out[key] = raw;
    } else if (field.type === "range") {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || n < field.min || n > field.max) {
        throw new Error(
          `${entry.label} accepts ${key} between ${field.min} and ${field.max} — got ${String(raw)}.`,
        );
      }
      out[key] = n;
    } else {
      if (typeof raw !== "boolean")
        throw new Error(`${entry.label} accepts ${key} as true or false.`);
      out[key] = raw;
    }
  }
  return out;
}

function validateMedia(entry: ModelEntry, media: Partial<Record<MediaRole, MediaItem[]>>) {
  const out: Partial<Record<MediaRole, MediaItem[]>> = {};
  for (const [role, items] of Object.entries(media) as [MediaRole, MediaItem[]][]) {
    if (!items || items.length === 0) continue;
    const cap = entry.roles[role];
    if (!cap) throw new Error(`${entry.label} does not take ${role} media.`);
    if (items.length > cap) throw new Error(`${entry.label} takes at most ${cap} ${role} item(s).`);
    const wanted = ROLE_KIND[role];
    const wrong = items.find((item) => item.kind !== wanted);
    if (wrong) throw new Error(`The ${role} slot takes ${wanted} files, not ${wrong.kind}.`);
    out[role] = items;
  }
  return out;
}

/** Which submit path the filled roles imply, falling back to the text path. */
export function platformPathFor(entry: ModelEntry, media: Partial<Record<MediaRole, MediaItem[]>>): string {
  const p = entry.paths ?? {};
  if (media.start?.length && media.end?.length && p.firstLast) return p.firstLast;
  if (media.reference?.length && p.reference) return p.reference;
  if (media.start?.length && p.image) return p.image;
  return p.text ?? p.image ?? entry.id;
}

/** Shared snake_case mapping. A model with its own `map` bypasses this entirely. */
function sharedBody(
  prompt: string,
  media: Partial<Record<MediaRole, MediaItem[]>>,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = { prompt };

  if (media.start?.[0]) body["image_url"] = media.start[0].url;
  if (media.end?.[0]) body["end_image_url"] = media.end[0].url;
  if (media.reference?.length) body["image_urls"] = media.reference.map((m) => m.url);
  if (media.video?.[0]) body["video_url"] = media.video[0].url;
  if (media.audio?.[0]) body["audio_url"] = media.audio[0].url;

  const field: Record<string, string> = {
    aspectRatio: "aspect_ratio",
    duration: "duration",
    resolution: "resolution",
    sound: "generate_audio",
    cfgScale: "cfg_scale",
    multiShots: "multi_shots",
    cameraFixed: "camera_fixed",
    motionStrength: "motion_strength",
    promptOptimizer: "prompt_optimizer",
    enhancePrompt: "enhance_prompt",
    renderingSpeed: "rendering_speed",
    styleType: "style_type",
    batchSize: "num_images",
    cameraMove: "camera_move",
    strength: "strength",
    guidance: "guidance_scale",
    steps: "num_inference_steps",
    quality: "quality",
    style: "style",
    shift: "shift",
    speed: "speed",
  };

  for (const [key, value] of Object.entries(settings)) {
    const mapped = field[key];
    if (!mapped) continue; // unknown settings are dropped, not forwarded
    body[mapped] = value;
  }
  return body;
}

export function toPlatform(plane: GenerationPlane): ResolvedRequest {
  const entry = getModel(plane.model);
  if (!entry) throw new Error(`Unknown model: ${plane.model}`);

  const prompt = plane.prompt.text.trim();
  if (!prompt && !plane.media.video?.length) throw new Error("A prompt is required.");

  const settings = validateSettings(entry, plane.settings);
  const media = validateMedia(entry, plane.media);
  const body = entry.map
    ? entry.map({ entry, prompt, media, settings })
    : sharedBody(prompt, media, settings);

  return { entry, path: platformPathFor(entry, media), body };
}
