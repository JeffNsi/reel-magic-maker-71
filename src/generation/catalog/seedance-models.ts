import { boolField, enumField, range, VERTICAL_FIRST } from "./common";
import type { MapInput, ModelEntry } from "./types";

/** Seedance family, including the Edit and Extend surfaces. */

export const seedance25: ModelEntry = {
  id: "seedance-2.5",
  surface: "video",
  label: "Seedance 2.5",
  roles: { start: 1, end: 1, reference: 4 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(3, 12, 5, 1),
    resolution: enumField(["720p", "1080p"], "1080p"),
    sound: boolField(true),
    cameraFixed: boolField(false),
  },
  paths: {
    text: "seedance-2.5",
    image: "seedance-2.5/image",
    firstLast: "seedance-2.5/first-last",
    reference: "seedance-2.5/reference",
  },
};

/** Edit rewrites an existing clip, so the source video is required, not optional. */
export const seedance25Edit: ModelEntry = {
  id: "seedance-2.5-edit",
  surface: "video",
  label: "Seedance 2.5 Edit",
  roles: { video: 1, reference: 2 },
  settings: {
    strength: range(0, 1, 0.6, 0.05),
    resolution: enumField(["720p", "1080p"], "1080p"),
    sound: boolField(true),
  },
  paths: { text: "seedance-2.5/edit" },
  map: ({ prompt, media, settings }: MapInput) => ({
    prompt,
    video_url: media.video?.[0]?.url,
    reference_image_urls: (media.reference ?? []).map((m) => m.url),
    strength: settings["strength"],
    resolution: settings["resolution"],
    generate_audio: settings["sound"],
  }),
};

/** Extend continues an existing clip; duration is the added tail, not the total. */
export const seedance25Extend: ModelEntry = {
  id: "seedance-2.5-extend",
  surface: "video",
  label: "Seedance 2.5 Extend",
  roles: { video: 1 },
  settings: {
    duration: range(3, 10, 5, 1),
    resolution: enumField(["720p", "1080p"], "1080p"),
    sound: boolField(true),
  },
  paths: { text: "seedance-2.5/extend" },
  map: ({ prompt, media, settings }: MapInput) => ({
    prompt,
    video_url: media.video?.[0]?.url,
    extend_duration: settings["duration"],
    resolution: settings["resolution"],
    generate_audio: settings["sound"],
  }),
};

export const seedance20: ModelEntry = {
  id: "seedance-2.0",
  surface: "video",
  label: "Seedance 2.0",
  roles: { start: 1, end: 1 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(3, 10, 5, 1),
    resolution: enumField(["480p", "720p", "1080p"], "1080p"),
    sound: boolField(false),
    cameraFixed: boolField(false),
  },
  paths: {
    text: "seedance-2.0",
    image: "seedance-2.0/image",
    firstLast: "seedance-2.0/first-last",
  },
};

export const seedance20Fast: ModelEntry = {
  id: "seedance-2.0-fast",
  surface: "video",
  label: "Seedance 2.0 Fast",
  roles: { start: 1 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(3, 8, 5, 1),
    resolution: enumField(["480p", "720p"], "720p"),
    sound: boolField(false),
  },
  paths: { text: "seedance-2.0-fast", image: "seedance-2.0-fast/image" },
};

export const seedance20Mini: ModelEntry = {
  id: "seedance-2.0-mini",
  surface: "video",
  label: "Seedance 2.0 Mini",
  roles: { start: 1 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(3, 5, 5, 1),
    resolution: enumField(["480p", "720p"], "720p"),
  },
  paths: { text: "seedance-2.0-mini", image: "seedance-2.0-mini/image" },
};

export const SEEDANCE_MODELS: readonly ModelEntry[] = [
  seedance25,
  seedance25Edit,
  seedance25Extend,
  seedance20,
  seedance20Fast,
  seedance20Mini,
];
