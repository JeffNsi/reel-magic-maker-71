import { MODELS, defaultSettings, getModel, platformOf } from "@/generation/catalog";
import type {
  GenerationPlane,
  MediaItem,
  MediaRole,
  ModelEntry,
  PlatformFlavor,
} from "@/generation/catalog/types";
import { buildGenerationRequest, type GenerationContext, type SceneTruth } from "@/lib/scene-truth";
import type { SceneReferences } from "@/lib/reference-resolver";

/**
 * PHASE 4 — DIRECTOR → GENERATION PLANE
 *
 * Pure compiler. No AI call, no fetch, no credits, no database, no clock, no
 * randomness: the same Film Bible, Scene Truth, canon references and model
 * always compile to a byte-identical plane.
 *
 * The prompt text comes from the ONE existing prompt compiler
 * (buildGenerationRequest in scene-truth.ts) — this module never writes a second
 * prompt builder. It only decides which model, which settings and which
 * canonical reference images that prompt travels with.
 *
 * Canonical truth is read, never written: an override changes the plane for this
 * press only and can never edit canon, and generated output is never promoted to
 * truth anywhere in this file.
 */

/** STORYREEL's house format: vertical, five seconds, one continuous shot. */
export const HOUSE_ASPECT = "9:16";
export const HOUSE_DURATION = 5;

export type FormatNote = {
  /** The house value we asked for. */
  wanted: string;
  /** What this model actually offers instead, stated plainly. */
  offered: string;
  message: string;
};

export type PlaneReference = {
  role: MediaRole;
  label: string;
  kind: string;
  url: string;
};

export type OmittedReference = {
  label: string;
  kind: string;
  reason: string;
};

export type PlaneGate = {
  allowed: boolean;
  /** Named, never vague: exactly which packs or angles are absent. */
  missing: string[];
  reason: string;
};

export type CompiledPlane = {
  plane: GenerationPlane;
  model: { id: string; label: string; reason: string };
  /** In the resolver's order — the order the adapter must preserve. */
  references: PlaneReference[];
  omitted: OmittedReference[];
  format: { vertical: boolean; duration: number | null; notes: FormatNote[] };
  gate: PlaneGate;
  /** True when the chosen model can actually read the reference images. */
  image_conditioned: boolean;
};

/* ------------------------------------------------------------------ format */

function ratioField(entry: ModelEntry) {
  const field = entry.settings["aspectRatio"];
  return field && field.type === "enum" ? field : null;
}

function durationField(entry: ModelEntry) {
  const field = entry.settings["duration"];
  return field && field.type === "range" ? field : null;
}

/** The nearest thing the model itself declares — never a silent 16:9. */
export function formatNotesFor(entry: ModelEntry): FormatNote[] {
  const notes: FormatNote[] = [];
  const ratio = ratioField(entry);
  if (ratio && !ratio.values.includes(HOUSE_ASPECT)) {
    notes.push({
      wanted: HOUSE_ASPECT,
      offered: ratio.default,
      message: `This model cannot do ${HOUSE_ASPECT}. The nearest shape it declares is ${ratio.default}.`,
    });
  }
  const duration = durationField(entry);
  if (duration && (HOUSE_DURATION < duration.min || HOUSE_DURATION > duration.max)) {
    const nearest = HOUSE_DURATION < duration.min ? duration.min : duration.max;
    notes.push({
      wanted: `${HOUSE_DURATION}s`,
      offered: `${nearest}s`,
      message: `This model cannot do ${HOUSE_DURATION} seconds. It runs ${duration.min}–${duration.max}s, so the nearest take is ${nearest}s.`,
    });
  }
  return notes;
}

/** House settings, clamped to what the model declares. Nothing is invented. */
function houseSettings(entry: ModelEntry, filmStyle: string): Record<string, unknown> {
  const settings = defaultSettings(entry);

  const ratio = ratioField(entry);
  if (ratio && ratio.values.includes(HOUSE_ASPECT)) settings["aspectRatio"] = HOUSE_ASPECT;

  const duration = durationField(entry);
  if (duration) {
    const value = Math.min(Math.max(HOUSE_DURATION, duration.min), duration.max);
    settings["duration"] = value;
  }

  /* One continuous shot: only where the model declares the switch itself. */
  const multi = entry.settings["multiShots"];
  if (multi && multi.type === "boolean") settings["multiShots"] = false;

  /* Style reaches the model only through a setting the model actually declares. */
  for (const key of ["style", "styleType"]) {
    const field = entry.settings[key];
    if (!field || field.type !== "enum") continue;
    const wanted = styleValueFor(filmStyle, field.values);
    if (wanted) settings[key] = wanted;
  }

  return settings;
}

const STYLE_WORDS: Record<string, readonly string[]> = {
  anime: ["anime"],
  comic: ["comic", "graphic-novel", "graphic novel"],
  clay: ["clay", "stop-motion"],
  "3d_animation": ["3d", "animation", "animated", "pixar"],
  realistic: ["cinematic", "documentary", "noir", "realistic", "photo"],
};

function styleValueFor(filmStyle: string, values: readonly string[]): string | null {
  const style = filmStyle.toLowerCase();
  for (const value of values) {
    const words = STYLE_WORDS[value];
    if (!words) continue;
    if (words.some((word) => style.includes(word))) return value;
  }
  return null;
}

/* ------------------------------------------------------------- model choice */

function conditionsOnImages(entry: ModelEntry): boolean {
  return (entry.roles["reference"] ?? 0) > 0;
}

/**
 * The Director's default model for a scene, and the one line that explains it.
 * Deterministic: the catalogue order breaks every tie, never a random pick.
 */
export function pickModelForScene(
  references: SceneReferences | null,
  options: { platforms?: readonly PlatformFlavor[] } = {},
): {
  id: string;
  label: string;
  reason: string;
} {
  /* Only models on an account that can actually be reached are eligible — the
   * Director never picks a model the creator could not press. */
  const reachable = options.platforms
    ? MODELS.filter((m) => options.platforms!.includes(platformOf(m)))
    : MODELS;
  const video = reachable.filter((m) => m.surface === "video");
  const wantsImages = !!references && references.mode === "image-conditioned";

  const candidates = video.filter((m) => {
    const ratio = ratioField(m);
    const vertical = !ratio || ratio.values.includes(HOUSE_ASPECT);
    const duration = durationField(m);
    const fiveSeconds =
      !duration || (HOUSE_DURATION >= duration.min && HOUSE_DURATION <= duration.max);
    return vertical && fiveSeconds;
  });

  const pool = candidates.length ? candidates : video;

  if (wantsImages) {
    const capable = pool
      .filter(conditionsOnImages)
      .sort((a, b) => (b.roles["reference"] ?? 0) - (a.roles["reference"] ?? 0));
    const best = capable[0];
    if (best) {
      return {
        id: best.id,
        label: best.label,
        reason: `This scene has canonical reference images, and ${best.label} takes up to ${best.roles["reference"]} of them while holding ${HOUSE_ASPECT} at ${HOUSE_DURATION} seconds — so the identity lock can actually be enforced.`,
      };
    }
  }

  const fallback = pool[0] ?? reachable[0];
  if (!fallback) {
    return { id: "", label: "", reason: "No model in the catalogue can render this scene." };
  }
  return {
    id: fallback.id,
    label: fallback.label,
    reason: wantsImages
      ? `No model that reads reference images can hold ${HOUSE_ASPECT} at ${HOUSE_DURATION} seconds, so ${fallback.label} renders the shot from text and the identity lock is not enforced.`
      : `This scene has no reference images yet, so ${fallback.label} renders it from the approved direction in the house ${HOUSE_ASPECT} / ${HOUSE_DURATION}s format.`,
  };
}

/* ------------------------------------------------------------- references */

type Ordered = { label: string; kind: string; url: string; priority: number; why: string };

/**
 * Continuity-graph order: the characters present in the scene first, then the
 * environment, then the style frames. When a model's per-role cap is smaller
 * than the manifest, the tail is dropped and every dropped image is named.
 */
function orderedReferences(references: SceneReferences): Ordered[] {
  const out: Ordered[] = [];
  for (const character of references.characters) {
    for (const image of character.images) {
      if (!image.url) continue;
      out.push({
        label: `${character.characterId}${character.name ? ` — ${character.name}` : ""}`,
        kind: image.kind,
        url: image.url,
        priority: 0,
        why: "a character present in this scene",
      });
    }
  }
  for (const image of references.environment?.images ?? []) {
    if (!image.url) continue;
    out.push({
      label: references.environment?.environmentId ?? "environment",
      kind: image.kind,
      url: image.url,
      priority: 1,
      why: "the scene's environment plate",
    });
  }
  for (const image of references.style) {
    if (!image.url) continue;
    out.push({
      label: "STYLE_01",
      kind: image.kind,
      url: image.url,
      priority: 2,
      why: "a style frame",
    });
  }
  return out;
}

/** Which characters this scene names in canon but has no usable image for. */
export function missingRequiredPacks(references: SceneReferences | null): string[] {
  if (!references) return [];
  const missing: string[] = [];
  for (const character of references.characters) {
    if (!character.images.some((image) => !!image.url)) {
      missing.push(
        `${character.characterId}${character.name ? ` (${character.name})` : ""} reference pack`,
      );
    }
  }
  if (references.environment && !references.environment.images.some((image) => !!image.url)) {
    missing.push(`${references.environment.environmentId} reference pack`);
  }
  return missing;
}

/* ---------------------------------------------------------------- compiler */

export type PlaneInput = {
  /** The model to compile for: the Director's pick, or the creator's override. */
  modelId: string;
  truth: SceneTruth;
  ctx: GenerationContext;
  references: SceneReferences | null;
  /** Film style, so a style-bearing setting can be filled where declared. */
  filmStyle: string;
  /** Creator overrides from the advanced rail. Never touches canon. */
  overrides?: Record<string, unknown>;
};

/**
 * Compile one scene into exactly one GenerationPlane, plus everything the UI
 * needs to explain the press before it happens.
 */
export function compileScenePlane(input: PlaneInput): CompiledPlane | null {
  const entry = getModel(input.modelId);
  if (!entry) return null;

  const refs = input.references;
  const imageConditioned = conditionsOnImages(entry) && refs?.mode === "image-conditioned";

  /* The one prompt compiler. The identity and previous-scene blocks are only
   * appended when the images really travel with the request. */
  const prompt = buildGenerationRequest(input.truth, input.ctx, {
    references: imageConditioned ? refs : null,
  });

  const settings = { ...houseSettings(entry, input.filmStyle), ...(input.overrides ?? {}) };

  const media: Partial<Record<MediaRole, MediaItem[]>> = {};
  const used: PlaneReference[] = [];
  const omitted: OmittedReference[] = [];

  if (refs && imageConditioned) {
    const ordered = orderedReferences(refs).sort((a, b) =>
      a.priority === b.priority ? 0 : a.priority - b.priority,
    );
    const referenceCap = entry.roles["reference"] ?? 0;
    const startCap = entry.roles["start"] ?? 0;

    const taken = ordered.slice(0, referenceCap);
    for (const item of ordered.slice(referenceCap)) {
      omitted.push({
        label: item.label,
        kind: item.kind,
        reason: `${entry.label} accepts ${referenceCap} reference image${referenceCap === 1 ? "" : "s"}; the scene's characters come first, then the environment, so this ${item.why} did not fit.`,
      });
    }

    if (taken.length) {
      media["reference"] = taken.map((item) => ({ url: item.url, kind: "image" as const }));
      for (const item of taken) {
        used.push({ role: "reference", label: item.label, kind: item.kind, url: item.url });
      }
    }

    /* A start frame is the shot's opening image: the environment plate when the
     * scene has one, otherwise the first character angle. */
    if (startCap > 0) {
      const plate =
        ordered.find((item) => item.priority === 1) ?? ordered.find((item) => item.priority === 0);
      if (plate) {
        media["start"] = [{ url: plate.url, kind: "image" }];
        used.push({ role: "start", label: plate.label, kind: plate.kind, url: plate.url });
      }
    }
  }

  const missing = missingRequiredPacks(refs);
  const gate: PlaneGate = missing.length
    ? {
        allowed: false,
        missing,
        reason:
          "This scene cannot be generated from canon yet: the reference packs below are missing, so identity cannot be held. Generate them in the Continuity Center first.",
      }
    : { allowed: true, missing: [], reason: "This scene is eligible to generate from canon." };

  const ratio = ratioField(entry);
  const duration = durationField(entry);

  return {
    plane: { model: entry.id, prompt: { text: prompt }, media, settings },
    model: { id: entry.id, label: entry.label, reason: "" },
    references: used,
    omitted,
    format: {
      vertical: !ratio || ratio.values.includes(HOUSE_ASPECT),
      duration: duration ? Number(settings["duration"] ?? duration.default) : null,
      notes: formatNotesFor(entry),
    },
    gate,
    image_conditioned: imageConditioned,
  };
}
