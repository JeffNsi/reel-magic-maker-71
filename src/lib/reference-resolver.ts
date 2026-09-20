/**
 * PHASE 3 — REFERENCE RESOLVER
 *
 * Pure, deterministic selection of which canonical reference images a scene
 * should be generated from. No AI, no credits, no provider call, no fetch, no
 * database, no randomness, no clock. Same canon + same scene number always
 * produces byte-identical output.
 *
 * The resolver never invents a reference: an angle that does not exist in the
 * stored pack is reported in `missing`, and a scene with no usable image at all
 * resolves in "text-only" mode instead of blocking.
 */

export type RefImage = {
  kind: string;
  storage_path: string;
  version: number;
  url: string | null;
};

type Locks = {
  identity: boolean;
  face: boolean;
  hair: boolean;
  skin: boolean;
  body: boolean;
};

export type ResolverCharacter = {
  canonical_id: string;
  name: string;
  face: string;
  hair: string;
  skin: string;
  body: string;
  height: string;
  build: string;
  locks: Locks;
  reference_assets: RefImage[];
};

export type ResolverEnvironment = {
  canonical_id: string;
  name: string;
  reference_assets: RefImage[];
};

export type ResolverScene = {
  scene_id: string;
  scene_number: number;
  title: string;
  characters: string[];
  environment_id: string | null;
  /** The scene's own camera line from Scene Truth. Drives the shot type. */
  camera: string | null;
  wardrobe: string | null;
  props: string[];
  location: string | null;
};

export type ResolverCanon = {
  characters: ResolverCharacter[];
  environments: ResolverEnvironment[];
  style_assets: RefImage[];
  scenes: ResolverScene[];
};

export type ShotType = "close-up" | "medium" | "wide" | "profile";

export type ResolvedCharacter = {
  characterId: string;
  name: string;
  images: RefImage[];
  /** One sentence, shown in the UI: why exactly these angles. */
  reason: string;
  /** The locked truth for this character, for the identity block. */
  locked: string[];
};

export type SceneReferences = {
  sceneId: string;
  sceneNumber: number;
  shotType: ShotType;
  screenDirection: "left" | "right";
  characters: ResolvedCharacter[];
  environment: { environmentId: string; name: string; images: RefImage[] } | null;
  style: RefImage[];
  mode: "image-conditioned" | "text-only";
  missing: string[];
  /** Deterministic continuity carry-over from the preceding scene. */
  previousSceneStatus: string | null;
};

/** Style references are appended last and never dominate the manifest. */
export const STYLE_REFERENCE_CAP = 2;

const CLOSE = /close[-\s]?up|insert|macro|detail shot/i;
const PROFILE = /profile|over[-\s]?the[-\s]?shoulder|over[-\s]?shoulder|side view/i;
const WIDE = /\bwide\b|establish|aerial|drone|long shot|full shot|landscape/i;
const MEDIUM = /\bmedium\b|two[-\s]?shot|mid[-\s]?shot|dialogue|conversation|waist/i;

/** Shot type comes from the scene's own camera line — never from AI, never random. */
export function shotTypeFor(camera: string | null): ShotType {
  const value = (camera ?? "").trim();
  if (!value) return "medium";
  if (CLOSE.test(value)) return "close-up";
  if (PROFILE.test(value)) return "profile";
  if (WIDE.test(value)) return "wide";
  if (MEDIUM.test(value)) return "medium";
  return "medium";
}

function screenDirectionFor(camera: string | null): {
  direction: "left" | "right";
  stated: boolean;
} {
  const value = (camera ?? "").toLowerCase();
  if (/\bright\b|camera right|screen right/.test(value))
    return { direction: "right", stated: true };
  if (/\bleft\b|camera left|screen left/.test(value)) return { direction: "left", stated: true };
  return { direction: "left", stated: false };
}

function pick(assets: RefImage[], kinds: string[]): { images: RefImage[]; missing: string[] } {
  const images: RefImage[] = [];
  const missing: string[] = [];
  for (const kind of kinds) {
    const found = assets.filter((a) => a.kind === kind).sort((a, b) => b.version - a.version)[0];
    if (found) images.push(found);
    else missing.push(kind);
  }
  return { images, missing };
}

function lockedTruth(character: ResolverCharacter): string[] {
  const out: string[] = [];
  const add = (label: string, locked: boolean, value: string) => {
    if (locked && value.trim()) out.push(`${label}: ${value.trim()}`);
  };
  add("face", character.locks.face, character.face);
  add("hair", character.locks.hair, character.hair);
  add("skin", character.locks.skin, character.skin);
  add("body", character.locks.body, character.body);
  add("height", character.locks.body, character.height);
  add("build", character.locks.body, character.build);
  return out;
}

/** The carry-over the next scene inherits — position, wardrobe, props. */
function previousStatus(canon: ResolverCanon, scene: ResolverScene): string | null {
  const earlier = canon.scenes
    .filter((s) => s.scene_number < scene.scene_number)
    .sort((a, b) => a.scene_number - b.scene_number);
  const prev = earlier[earlier.length - 1];
  if (!prev) return null;

  const parts: string[] = [];
  const where = prev.location ?? prev.environment_id;
  if (where) parts.push(`position: ${where}`);
  if (prev.wardrobe) parts.push(`wardrobe: ${prev.wardrobe}`);
  if (prev.props.length) parts.push(`props: ${prev.props.join(", ")}`);
  if (!parts.length) return null;
  return `after scene ${String(prev.scene_number).padStart(2, "0")} — ${parts.join("; ")}`;
}

/**
 * Resolve the smallest sufficient reference set for one scene.
 * Pure: the inputs are read, never mutated.
 */
export function resolveSceneReferences(
  canon: ResolverCanon,
  sceneNumber: number,
): SceneReferences | null {
  const scene = canon.scenes.find((s) => s.scene_number === sceneNumber) ?? null;
  if (!scene) return null;

  const shotType = shotTypeFor(scene.camera);
  const { direction, stated } = screenDirectionFor(scene.camera);
  const quarter = direction === "right" ? "three-quarter-right" : "three-quarter-left";
  const missing: string[] = [];

  const kindsFor = (): { kinds: string[]; reason: string } => {
    if (shotType === "close-up") {
      return {
        kinds: ["close-up", "front"],
        reason: "Close-up or insert: the close-up and front angles carry face and identity.",
      };
    }
    if (shotType === "wide") {
      return {
        kinds: ["full-body"],
        reason: "Wide or establishing shot: the full-body angle plus the location's wide plate.",
      };
    }
    if (shotType === "profile") {
      return {
        kinds: ["profile", quarter],
        reason: stated
          ? `Profile or over-shoulder shot: profile plus the three-quarter matching camera ${direction}.`
          : "Profile or over-shoulder shot: profile plus three-quarter left, the default when the camera line states no screen direction.",
      };
    }
    return {
      kinds: ["front", quarter],
      reason: stated
        ? `Medium or dialogue shot: front plus the three-quarter matching camera ${direction}.`
        : "Medium or dialogue shot: front plus three-quarter left, the default when the camera line states no screen direction.",
    };
  };

  const { kinds, reason } = kindsFor();

  const present = [...scene.characters].sort((a, b) => a.localeCompare(b));
  const characters: ResolvedCharacter[] = [];
  for (const id of present) {
    const character = canon.characters.find((c) => c.canonical_id === id);
    if (!character) {
      missing.push(`${id} is not in canon`);
      continue;
    }
    const chosen = pick(character.reference_assets, kinds);
    for (const kind of chosen.missing) missing.push(`${id} ${kind}`);
    characters.push({
      characterId: id,
      name: character.name,
      images: chosen.images,
      reason,
      locked: lockedTruth(character),
    });
  }

  let environment: SceneReferences["environment"] = null;
  if (scene.environment_id) {
    const env = canon.environments.find((e) => e.canonical_id === scene.environment_id);
    if (env) {
      const envKinds = shotType === "wide" ? ["wide"] : ["detail"];
      const chosen = pick(env.reference_assets, envKinds);
      for (const kind of chosen.missing) missing.push(`${env.canonical_id} ${kind}`);
      environment = {
        environmentId: env.canonical_id,
        name: env.name,
        images: chosen.images,
      };
    } else {
      missing.push(`${scene.environment_id} is not in canon`);
    }
  }

  /* Style references last, capped — they support the look, never the identity. */
  const style = [...canon.style_assets]
    .sort((a, b) => (a.kind === b.kind ? b.version - a.version : a.kind.localeCompare(b.kind)))
    .slice(0, STYLE_REFERENCE_CAP);

  const usable = [
    ...characters.flatMap((c) => c.images),
    ...(environment?.images ?? []),
    ...style,
  ].filter((image) => !!image.url);

  return {
    sceneId: scene.scene_id,
    sceneNumber: scene.scene_number,
    shotType,
    screenDirection: direction,
    characters,
    environment,
    style,
    mode: usable.length ? "image-conditioned" : "text-only",
    missing,
    previousSceneStatus: previousStatus(canon, scene),
  };
}

/** The ordered image list the provider adapter receives. Resolver order is law. */
export function referenceImageUrls(refs: SceneReferences | null): string[] {
  if (!refs || refs.mode === "text-only") return [];
  const ordered = [
    ...refs.characters.flatMap((c) => c.images),
    ...(refs.environment?.images ?? []),
    ...refs.style,
  ];
  return ordered.map((image) => image.url).filter((url): url is string => !!url);
}
