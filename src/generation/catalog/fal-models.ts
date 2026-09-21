import { boolField, enumField, VERTICAL_FIRST } from "./common";
import type { ModelEntry } from "./types";

/**
 * Models that run on the creator's (or the house) fal.ai account. Only model
 * paths and fields this codebase already submits for real are listed here —
 * nothing is invented, so every entry in this file can actually be pressed.
 */

const KLING_3_STD = "fal-ai/kling-video/v3/standard/text-to-video";
const H3_MAX_DIRECTOR = "fal-ai/minimax/h3-max/director";

export const falKling3Standard: ModelEntry = {
  id: KLING_3_STD,
  platform: "fal",
  surface: "video",
  label: "Kling 3.0 Standard — fal.ai",
  /* Text-to-video: it reads no reference images, and we say so rather than
   * claiming an identity lock it cannot hold. */
  roles: {},
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: enumField(["5", "10"], "5"),
    sound: boolField(true),
  },
  paths: { text: KLING_3_STD },
};

export const falH3MaxDirector: ModelEntry = {
  id: H3_MAX_DIRECTOR,
  platform: "fal",
  surface: "video",
  label: "MiniMax H3 Max Director — fal.ai",
  roles: {},
  settings: {
    aspectRatio: enumField(VERTICAL_FIRST, "9:16"),
    duration: enumField(["5", "10"], "5"),
    sound: boolField(true),
  },
  paths: { text: H3_MAX_DIRECTOR },
};

export const FAL_MODELS: readonly ModelEntry[] = [falKling3Standard, falH3MaxDirector];
