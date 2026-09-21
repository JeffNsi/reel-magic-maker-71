import { boolField, enumField, IMAGE_RATIOS, range } from "./common";
import type { ModelEntry } from "./types";

/** The 8 image models the platform serves. Each declares only its own settings. */

export const soul2: ModelEntry = {
  id: "soul-2",
  surface: "image",
  label: "Soul 2",
  roles: { reference: 3 },
  settings: {
    aspectRatio: enumField(IMAGE_RATIOS, "9:16"),
    quality: enumField(["standard", "high"], "high"),
    batchSize: range(1, 4, 1, 1),
    enhancePrompt: boolField(true),
  },
  paths: { text: "soul-2", reference: "soul-2/reference" },
};

export const flux2: ModelEntry = {
  id: "flux-2",
  surface: "image",
  label: "Flux 2",
  roles: { reference: 4 },
  settings: {
    aspectRatio: enumField(IMAGE_RATIOS, "9:16"),
    steps: range(4, 50, 28, 1),
    guidance: range(1, 10, 3.5, 0.1),
    batchSize: range(1, 4, 1, 1),
  },
  paths: { text: "flux-2", image: "flux-2/image", reference: "flux-2/reference" },
};

export const flux3: ModelEntry = {
  id: "flux-3",
  surface: "image",
  label: "Flux 3",
  roles: { reference: 6 },
  settings: {
    aspectRatio: enumField(IMAGE_RATIOS, "9:16"),
    steps: range(4, 50, 30, 1),
    guidance: range(1, 10, 3.5, 0.1),
    batchSize: range(1, 4, 1, 1),
    enhancePrompt: boolField(false),
  },
  paths: { text: "flux-3", image: "flux-3/image", reference: "flux-3/reference" },
};

export const ideogram4: ModelEntry = {
  id: "ideogram-4",
  surface: "image",
  label: "Ideogram 4",
  roles: { reference: 3 },
  settings: {
    aspectRatio: enumField(IMAGE_RATIOS, "9:16"),
    renderingSpeed: enumField(["turbo", "default", "quality"], "default"),
    styleType: enumField(["auto", "general", "realistic", "design"], "auto"),
    batchSize: range(1, 4, 1, 1),
  },
  paths: { text: "ideogram-4", reference: "ideogram-4/reference" },
};

export const recraft41: ModelEntry = {
  id: "recraft-4.1",
  surface: "image",
  label: "Recraft 4.1",
  roles: { reference: 2 },
  settings: {
    aspectRatio: enumField(IMAGE_RATIOS, "9:16"),
    style: enumField(
      ["realistic_image", "digital_illustration", "vector_illustration"],
      "realistic_image",
    ),
    batchSize: range(1, 4, 1, 1),
  },
  paths: { text: "recraft-4.1", reference: "recraft-4.1/reference" },
};

export const qwenImage3: ModelEntry = {
  id: "qwen-image-3",
  surface: "image",
  label: "Qwen Image 3",
  roles: { reference: 3 },
  settings: {
    aspectRatio: enumField(IMAGE_RATIOS, "9:16"),
    steps: range(10, 50, 30, 1),
    guidance: range(1, 10, 4, 0.1),
    batchSize: range(1, 4, 1, 1),
  },
  paths: { text: "qwen-image-3", image: "qwen-image-3/image" },
};

export const zImageTurbo: ModelEntry = {
  id: "z-image-turbo",
  surface: "image",
  label: "Z-Image Turbo",
  roles: {},
  settings: {
    aspectRatio: enumField(IMAGE_RATIOS, "9:16"),
    steps: range(2, 12, 6, 1),
    batchSize: range(1, 4, 1, 1),
  },
  paths: { text: "z-image-turbo" },
};

export const grokImagine2: ModelEntry = {
  id: "grok-imagine-2",
  surface: "image",
  label: "Grok Imagine 2",
  roles: { reference: 2 },
  settings: {
    aspectRatio: enumField(IMAGE_RATIOS, "9:16"),
    batchSize: range(1, 4, 1, 1),
  },
  paths: { text: "grok-imagine-2", image: "grok-imagine-2/image" },
};

export const IMAGE_MODELS: readonly ModelEntry[] = [
  soul2,
  flux2,
  flux3,
  ideogram4,
  recraft41,
  qwenImage3,
  zImageTurbo,
  grokImagine2,
];
