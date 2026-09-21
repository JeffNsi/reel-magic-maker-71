import { IMAGE_MODELS } from "./image-models";
import { KLING_MODELS } from "./kling-models";
import { SEEDANCE_MODELS } from "./seedance-models";
import { OTHER_VIDEO_MODELS } from "./video-models";
import type { ModelEntry, Surface } from "./types";

export * from "./types";
export { enumField, range, boolField } from "./common";

/** 8 image + 30 video. The picker, the settings rail and the mapper all read this. */
export const MODELS: readonly ModelEntry[] = [
  ...IMAGE_MODELS,
  ...SEEDANCE_MODELS,
  ...KLING_MODELS,
  ...OTHER_VIDEO_MODELS,
];

const BY_ID = new Map(MODELS.map((m) => [m.id, m] as const));

export function getModel(id: string): ModelEntry | undefined {
  return BY_ID.get(id);
}

export function modelsForSurface(surface: Surface): readonly ModelEntry[] {
  return MODELS.filter((m) => m.surface === surface);
}

/** Default settings for a model, straight from its declared fields. */
export function defaultSettings(entry: ModelEntry): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(entry.settings)) out[key] = field.default;
  return out;
}

/** Does this model offer STORYREEL's house vertical format at all? */
export function supportsVertical(entry: ModelEntry): boolean {
  const ratio = entry.settings["aspectRatio"];
  if (!ratio || ratio.type !== "enum") return true;
  return ratio.values.includes("9:16");
}
