import { boolField, CFG_SCALE, enumField, range, VERTICAL_FIRST } from "./common";
import type { ModelEntry } from "./types";

/** Kling family. Every tier declares its own duration ceiling and settings. */

function klingTier(id: string, label: string, maxDuration: number, motion: boolean): ModelEntry {
  return {
    id,
    surface: "video",
    label,
    roles: { start: 1, end: 1 },
    settings: {
      aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
      duration: range(3, maxDuration, 5, 1),
      sound: boolField(false),
      cfgScale: CFG_SCALE,
      ...(motion ? {} : { multiShots: boolField(false) }),
    },
    paths: { text: id, image: `${id}/image`, firstLast: `${id}/first-last` },
  };
}

export const kling3Turbo = klingTier("kling-3-turbo", "Kling 3 Turbo", 10, false);
export const kling3Std = klingTier("kling-3-std", "Kling 3 Standard", 15, false);
export const kling3Pro = klingTier("kling-3-pro", "Kling 3 Pro", 15, false);
export const kling34k = klingTier("kling-3-4k", "Kling 3 4K", 10, false);
export const kling3MotionStd = klingTier("kling-3-motion-std", "Kling 3 Motion Standard", 10, true);
export const kling3MotionPro = klingTier("kling-3-motion-pro", "Kling 3 Motion Pro", 10, true);
export const kling26 = klingTier("kling-2.6", "Kling 2.6", 10, false);
export const kling25 = klingTier("kling-2.5", "Kling 2.5", 10, false);

export const klingO3: ModelEntry = {
  id: "kling-o3",
  surface: "video",
  label: "Kling O3",
  roles: { start: 1, reference: 4 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(5, 10, 5, 5),
    sound: boolField(true),
    cfgScale: CFG_SCALE,
  },
  paths: { text: "kling-o3", image: "kling-o3/image", reference: "kling-o3/reference" },
};

export const klingO1: ModelEntry = {
  id: "kling-o1",
  surface: "video",
  label: "Kling O1",
  roles: { start: 1, reference: 2 },
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: range(5, 10, 5, 5),
    sound: boolField(false),
  },
  paths: { text: "kling-o1", image: "kling-o1/image", reference: "kling-o1/reference" },
};

export const KLING_MODELS: readonly ModelEntry[] = [
  kling3Turbo,
  kling3Std,
  kling3Pro,
  kling34k,
  kling3MotionStd,
  kling3MotionPro,
  kling26,
  kling25,
  klingO3,
  klingO1,
];
