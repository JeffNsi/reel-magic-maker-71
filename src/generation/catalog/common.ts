import type { SettingField } from "./types";

/** Small builders so each model file declares its allow-list in one line per field. */

export function enumField(values: readonly string[], def: string): SettingField {
  return { type: "enum", values, default: def };
}

export function range(min: number, max: number, def: number, step?: number): SettingField {
  return step === undefined
    ? { type: "range", min, max, default: def }
    : { type: "range", min, max, default: def, step };
}

export function boolField(def: boolean): SettingField {
  return { type: "boolean", default: def };
}

/** STORYREEL's house format is vertical; models that support it list 9:16 first. */
export const VERTICAL_FIRST = ["9:16", "16:9", "1:1"] as const;
export const WIDE_FIRST = ["16:9", "9:16", "1:1"] as const;
export const IMAGE_RATIOS = ["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"] as const;

export const CFG_SCALE = range(0, 1, 0.5, 0.01);
