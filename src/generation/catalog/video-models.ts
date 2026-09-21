import { boolField, enumField, range, VERTICAL_FIRST, WIDE_FIRST } from "./common";
import type { ModelEntry } from "./types";

/** Soul Cinema, Wan, MiniMax/Hailuo, Happy Horse, LTX, Grok, PixVerse and DoP. */

export const soulCinema: ModelEntry = {
  id: "soul-cinema",
  surface: "video",
  label: "Soul Cinema",
  roles: { start: 1, reference: 3 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(5, 10, 5, 5),
    sound: boolField(true),
    motionStrength: range(0, 1, 0.5, 0.05),
  },
  paths: { text: "soul-cinema", image: "soul-cinema/image", reference: "soul-cinema/reference" },
};

export const wan3: ModelEntry = {
  id: "wan-3",
  surface: "video",
  label: "Wan 3",
  roles: { start: 1, end: 1, reference: 3 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(3, 10, 5, 1),
    resolution: enumField(["480p", "720p", "1080p"], "720p"),
    sound: boolField(false),
    shift: range(1, 10, 5, 0.1),
  },
  paths: { text: "wan-3", image: "wan-3/image", firstLast: "wan-3/first-last", reference: "wan-3/reference" },
};

export const wan3Prime: ModelEntry = {
  id: "wan-3-prime",
  surface: "video",
  label: "Wan 3 Prime",
  roles: { start: 1, end: 1, reference: 4 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(3, 12, 5, 1),
    resolution: enumField(["720p", "1080p"], "1080p"),
    sound: boolField(true),
    shift: range(1, 10, 5, 0.1),
  },
  paths: { text: "wan-3-prime", image: "wan-3-prime/image", firstLast: "wan-3-prime/first-last" },
};

export const wan27: ModelEntry = {
  id: "wan-2.7",
  surface: "video",
  label: "Wan 2.7",
  roles: { start: 1, end: 1 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(3, 10, 5, 1),
    resolution: enumField(["480p", "720p"], "720p"),
    sound: boolField(false),
  },
  paths: { text: "wan-2.7", image: "wan-2.7/image", firstLast: "wan-2.7/first-last" },
};

export const wan26: ModelEntry = {
  id: "wan-2.6",
  surface: "video",
  label: "Wan 2.6",
  roles: { start: 1 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(3, 5, 5, 1),
    resolution: enumField(["480p", "720p"], "480p"),
  },
  paths: { text: "wan-2.6", image: "wan-2.6/image" },
};

export const minimaxH3: ModelEntry = {
  id: "minimax-h3",
  surface: "video",
  label: "MiniMax H3",
  roles: { start: 1, reference: 3 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(6, 10, 6, 4),
    resolution: enumField(["768p", "1080p"], "1080p"),
    sound: boolField(true),
    promptOptimizer: boolField(true),
  },
  paths: { text: "minimax-h3", image: "minimax-h3/image", reference: "minimax-h3/reference" },
};

export const hailuo23: ModelEntry = {
  id: "hailuo-2.3",
  surface: "video",
  label: "Hailuo 2.3",
  roles: { start: 1, end: 1 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(6, 10, 6, 4),
    resolution: enumField(["768p", "1080p"], "768p"),
    promptOptimizer: boolField(true),
  },
  paths: { text: "hailuo-2.3", image: "hailuo-2.3/image", firstLast: "hailuo-2.3/first-last" },
};

export const happyHorse1: ModelEntry = {
  id: "happy-horse-1",
  surface: "video",
  label: "Happy Horse 1",
  roles: { start: 1 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(4, 8, 5, 1),
    sound: boolField(false),
  },
  paths: { text: "happy-horse-1", image: "happy-horse-1/image" },
};

export const happyHorse11: ModelEntry = {
  id: "happy-horse-1.1",
  surface: "video",
  label: "Happy Horse 1.1",
  roles: { start: 1, reference: 2 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(4, 10, 5, 1),
    sound: boolField(true),
  },
  paths: { text: "happy-horse-1.1", image: "happy-horse-1.1/image" },
};

export const ltx25Fast: ModelEntry = {
  id: "ltx-2.5-fast",
  surface: "video",
  label: "LTX 2.5 Fast",
  roles: { start: 1, end: 1 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(4, 8, 5, 1),
    resolution: enumField(["720p", "1080p"], "720p"),
    sound: boolField(false),
  },
  paths: { text: "ltx-2.5-fast", image: "ltx-2.5-fast/image", firstLast: "ltx-2.5-fast/first-last" },
};

export const ltx25Pro: ModelEntry = {
  id: "ltx-2.5-pro",
  surface: "video",
  label: "LTX 2.5 Pro",
  roles: { start: 1, end: 1, reference: 3 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(4, 12, 5, 1),
    resolution: enumField(["1080p", "1440p"], "1080p"),
    sound: boolField(true),
  },
  paths: { text: "ltx-2.5-pro", image: "ltx-2.5-pro/image", firstLast: "ltx-2.5-pro/first-last" },
};

export const grokVideo15: ModelEntry = {
  id: "grok-video-1.5",
  surface: "video",
  label: "Grok Video 1.5",
  roles: { start: 1, reference: 3 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(5, 10, 5, 1),
    sound: boolField(true),
  },
  paths: { text: "grok-video-1.5", image: "grok-video-1.5/image", reference: "grok-video-1.5/reference" },
};

export const pixverse6: ModelEntry = {
  id: "pixverse-6",
  surface: "video",
  label: "PixVerse 6",
  roles: { start: 1, end: 1 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(5, 8, 5, 3),
    resolution: enumField(["360p", "540p", "720p", "1080p"], "720p"),
    style: enumField(["none", "anime", "3d_animation", "clay", "comic"], "none"),
    sound: boolField(false),
  },
  paths: { text: "pixverse-6", image: "pixverse-6/image", firstLast: "pixverse-6/first-last" },
};

/** DoP is a camera-direction model: it takes a still and moves the lens. */
export const dop: ModelEntry = {
  id: "dop",
  surface: "video",
  label: "DoP",
  roles: { start: 1 },
  settings: {
    aspectRatio: enumField(WIDE_FIRST, "9:16"),
    duration: range(3, 5, 5, 1),
    cameraMove: enumField(
      ["push_in", "pull_out", "pan_left", "pan_right", "tilt_up", "tilt_down", "orbit", "crane_up"],
      "push_in",
    ),
    speed: range(0.25, 2, 1, 0.05),
  },
  paths: { image: "dop/image" },
};

export const OTHER_VIDEO_MODELS: readonly ModelEntry[] = [
  soulCinema,
  wan3,
  wan3Prime,
  wan27,
  wan26,
  minimaxH3,
  hailuo23,
  happyHorse1,
  happyHorse11,
  ltx25Fast,
  ltx25Pro,
  grokVideo15,
  pixverse6,
  dop,
];
