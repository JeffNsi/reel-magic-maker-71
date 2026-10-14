import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { affectedScenes, normalizeFilmState, type FilmState } from "@/lib/film-state";
import { normalizeStoryState } from "@/lib/story-state";
import { applyCarryToCharacters, readCarry } from "@/lib/universe";
import {
  resolveSceneReferences,
  type RefImage,
  type ResolverCanon,
} from "@/lib/reference-resolver";
import type {
  Challenge,
  Evolution,
  FilmBible,
  FilmModel,
  Recommendation,
} from "@/lib/director.functions";

/**
 * CONTINUITY CENTER — the canonical film truth, editable by its owner.
 *
 * The derived FilmState (src/lib/film-state.ts) stays the deterministic reading
 * of what the story already says. This module persists that reading once, and
 * from then on the stored rows are canon: the creator edits them directly and
 * every edit appends a version snapshot instead of overwriting history.
 *
 * Nothing here renders, spends credits, calls a provider or touches generation.
 * Owner-only: every call is scoped by the film's session id, exactly like the
 * film page, and nothing is exposed on the public share route.
 */

const ref = z.object({
  film_id: z.string().uuid(),
  session_id: z.string().uuid(),
});

export type CanonLocks = {
  identity: boolean;
  face: boolean;
  hair: boolean;
  skin: boolean;
  body: boolean;
  wardrobe: boolean;
  accessories: boolean;
};

export type CanonAsset = {
  kind: string;
  storage_path: string;
  version: number;
  /** Short-lived signed link so the Continuity Center can show the image. */
  url: string | null;
};

/** The reference pack: one image per angle, generated from locked canonical truth. */
export const CHARACTER_PACK_KINDS = [
  "front",
  "three-quarter-left",
  "three-quarter-right",
  "profile",
  "full-body",
  "close-up",
] as const;

export const ENVIRONMENT_PACK_KINDS = ["wide", "detail", "lighting"] as const;

export const STYLE_PACK_KINDS = ["style-frame-1", "style-frame-2"] as const;

const ASSET_BUCKET = "films";
const ASSET_URL_TTL = 60 * 60 * 6;

export type CanonCharacter = {
  canonical_id: string;
  name: string;
  age: string;
  appearance: string;
  face: string;
  hair: string;
  skin: string;
  body: string;
  height: string;
  build: string;
  personality: string;
  expression_profile: string;
  locks: CanonLocks;
  continuity_constraints: string[];
  version: number;
  /** Derived, read-only: the scenes this character appears in. */
  appears_in: number[];
  reference_assets: CanonAsset[];
  reference_pack_ready: boolean;
};

export type CanonEnvironment = {
  canonical_id: string;
  name: string;
  architecture: string;
  layout: string;
  furniture: string;
  materials: string;
  palette: string;
  lighting: string;
  props: string[];
  continuity_constraints: string[];
  version: number;
  used_by: number[];
  reference_assets: CanonAsset[];
  reference_pack_ready: boolean;
};

export type CanonWardrobe = {
  canonical_id: string;
  character_canonical_id: string;
  description: string;
  accessories: string;
  from_scene: number | null;
  changed_in_scene: number | null;
  reason: string;
};

export type CanonProp = {
  canonical_id: string;
  name: string;
  appearance: string;
  owner_canonical_id: string | null;
  location: string;
  state: string;
  scene_number: number | null;
};

export type CanonScene = {
  scene_id: string;
  scene_number: number;
  title: string;
  previous_scene_id: string | null;
  next_scene_id: string | null;
  environment_id: string | null;
  characters: string[];
  status: string;
  has_clip: boolean;
};

export type CanonView = {
  film_id: string;
  title: string;
  style: string;
  characters: CanonCharacter[];
  environments: CanonEnvironment[];
  wardrobe: CanonWardrobe[];
  props: CanonProp[];
  scenes: CanonScene[];
  style_assets: CanonAsset[];
};

const DEFAULT_LOCKS: CanonLocks = {
  identity: true,
  face: true,
  hair: true,
  skin: true,
  body: true,
  wardrobe: false,
  accessories: false,
};

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const strList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

function readLocks(value: unknown): CanonLocks {
  const raw = (value ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_LOCKS };
  for (const key of Object.keys(DEFAULT_LOCKS) as (keyof CanonLocks)[]) {
    if (typeof raw[key] === "boolean") out[key] = raw[key] as boolean;
  }
  return out;
}

/** The universe slice the creator chose to carry into this film, if any. */
async function loadCarry(story_id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: story } = await supabaseAdmin
    .from("stories")
    .select("director_session_id")
    .eq("id", story_id)
    .maybeSingle();
  if (!story?.director_session_id) return null;
  const { data: session } = await supabaseAdmin
    .from("director_sessions")
    .select("universe_carry")
    .eq("id", story.director_session_id)
    .maybeSingle();
  return readCarry(session?.universe_carry ?? null);
}

/** The deterministic reading of the story as it stands — the seeding source. */
async function deriveState(film_id: string, session_id: string): Promise<FilmState> {
  const { story, film } = await deriveStory(film_id, session_id);
  return normalizeFilmState({ story, film });
}

/** StoryState plus the film view — server-only, never returned to a client. */
export async function deriveStory(film_id: string, session_id: string) {
  const { loadFilm } = await import("@/lib/film.functions");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const film = await loadFilm(film_id, session_id);

  let session: {
    film_model?: unknown;
    film_bible?: unknown;
    recommendation?: unknown;
    challenge?: unknown;
    evolution?: unknown;
  } | null = null;

  if (film.director_session_id) {
    const { data } = await supabaseAdmin
      .from("director_sessions")
      .select("film_model, film_bible, recommendation, challenge, evolution")
      .eq("id", film.director_session_id)
      .maybeSingle();
    session = data ?? null;
  }

  const story = normalizeStoryState({
    film,
    scenes: film.scenes,
    film_model: (session?.film_model ?? null) as FilmModel | null,
    film_bible: (session?.film_bible ?? null) as FilmBible | null,
    recommendation: (session?.recommendation ?? null) as Recommendation | null,
    challenge: (session?.challenge ?? null) as Challenge | null,
    evolution: (session?.evolution ?? null) as Evolution | null,
  });

  return { story, film };
}

/**
 * The canonical view. On the first call the derived reading is materialized, so
 * the creator starts from what the story already establishes rather than an
 * empty page. Existing rows are never overwritten by seeding.
 */
export const getCanon = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ref.parse(data))
  .handler(async ({ data }): Promise<CanonView> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const state = await deriveState(data.film_id, data.session_id);
    const story_id = data.film_id;

    const [characters, environments, wardrobe, props] = await Promise.all([
      supabaseAdmin.from("film_canon_characters").select("*").eq("story_id", story_id),
      supabaseAdmin.from("film_canon_environments").select("*").eq("story_id", story_id),
      supabaseAdmin.from("film_canon_wardrobe").select("*").eq("story_id", story_id),
      supabaseAdmin.from("film_canon_props").select("*").eq("story_id", story_id),
    ]);

    /* ---- seeding: insert only what canon does not carry yet ---- */
    const haveChar = new Set((characters.data ?? []).map((row) => row.canonical_id));
    const newChars = state.characters
      .filter((c) => !haveChar.has(c.canonical_id))
      .map((c) => ({
        story_id,
        canonical_id: c.canonical_id,
        name: c.name,
        age: c.age ?? "",
        appearance: c.appearance ?? "",
        face: c.face ?? "",
        hair: c.hair ?? "",
        skin: c.skin ?? "",
        body: c.body ?? "",
        locks: c.locks,
      }));
    /* A film started from the creator's universe seeds its locked traits from it. */
    const carry = !haveChar.size ? await loadCarry(story_id) : null;
    const carried = applyCarryToCharacters(newChars, carry);
    const seedChars = carried.rows.map((row) => ({ locks: {}, ...row, story_id }));
    if (seedChars.length) await supabaseAdmin.from("film_canon_characters").insert(seedChars);
    const carriedAssets = carried.links.flatMap((link) =>
      link.universe.reference_assets.map((entry, i) => {
        const [kind, path] = entry.includes("::") ? entry.split("::") : [`carried-${i + 1}`, entry];
        return {
        story_id,
        subject_type: "character",
        subject_canonical_id: link.canonical_id,
        kind: kind || `carried-${i + 1}`,
        storage_path: path ?? entry,
        prompt: "Carried from your universe (locked reference)",
        version: 1,
        };
      }),
    );
    if (carriedAssets.length) await supabaseAdmin.from("film_canon_assets").insert(carriedAssets);

    const haveEnv = new Set((environments.data ?? []).map((row) => row.canonical_id));
    const newEnvs = state.environments
      .filter((e) => !haveEnv.has(e.canonical_id))
      .map((e) => ({
        story_id,
        canonical_id: e.canonical_id,
        name: e.name,
        architecture: e.description ?? "",
        lighting: e.lighting ?? "",
      }));
    if (newEnvs.length) await supabaseAdmin.from("film_canon_environments").insert(newEnvs);

    const haveWardrobe = new Set((wardrobe.data ?? []).map((row) => row.canonical_id));
    const newWardrobe = state.wardrobe
      .filter((w) => !haveWardrobe.has(w.id))
      .map((w) => ({
        story_id,
        canonical_id: w.id,
        character_canonical_id: w.character_id,
        description: w.value,
        from_scene: w.scene_number,
      }));
    if (newWardrobe.length) await supabaseAdmin.from("film_canon_wardrobe").insert(newWardrobe);

    const haveProps = new Set((props.data ?? []).map((row) => row.canonical_id));
    const newProps = state.props
      .filter((p) => !haveProps.has(p.canonical_id))
      .map((p) => ({
        story_id,
        canonical_id: p.canonical_id,
        name: p.name,
        appearance: p.significance ?? "",
        scene_number: p.appears_in[0] ?? null,
      }));
    if (newProps.length) await supabaseAdmin.from("film_canon_props").insert(newProps);

    /* ---- read back the settled canon plus its reference assets ---- */
    const [charRows, envRows, wardrobeRows, propRows, assetRows] = await Promise.all([
      supabaseAdmin
        .from("film_canon_characters")
        .select("*")
        .eq("story_id", story_id)
        .order("canonical_id"),
      supabaseAdmin
        .from("film_canon_environments")
        .select("*")
        .eq("story_id", story_id)
        .order("canonical_id"),
      supabaseAdmin
        .from("film_canon_wardrobe")
        .select("*")
        .eq("story_id", story_id)
        .order("from_scene", { ascending: true, nullsFirst: true }),
      supabaseAdmin
        .from("film_canon_props")
        .select("*")
        .eq("story_id", story_id)
        .order("canonical_id"),
      supabaseAdmin.from("film_canon_assets").select("*").eq("story_id", story_id),
    ]);

    /* Signed links for every stored reference image, in one round trip. */
    const paths = (assetRows.data ?? []).map((row) => row.storage_path);
    const signed = new Map<string, string>();
    if (paths.length) {
      const { data: links } = await supabaseAdmin.storage
        .from(ASSET_BUCKET)
        .createSignedUrls(paths, ASSET_URL_TTL);
      for (const link of links ?? []) {
        if (link.path && link.signedUrl) signed.set(link.path, link.signedUrl);
      }
    }

    /**
     * The newest image PER ANGLE for a subject — older versions stay in the table
     * as history. Per angle, not per run: a pack run that stopped partway (credits
     * ran out on image 3 of 6) writes only the angles it finished at the new
     * version, and the angles already paid for must keep counting instead of
     * disappearing behind the newer, smaller run.
     */
    const assetsFor = (type: string, id: string): CanonAsset[] => {
      const rows = (assetRows.data ?? []).filter(
        (row) => row.subject_type === type && row.subject_canonical_id === id,
      );
      if (!rows.length) return [];
      const latestOf = new Map<string, number>();
      for (const row of rows) {
        latestOf.set(row.kind, Math.max(latestOf.get(row.kind) ?? 0, row.version));
      }
      return rows
        .filter((row) => row.version === latestOf.get(row.kind))
        .map((row) => ({
          kind: row.kind,
          storage_path: row.storage_path,
          version: row.version,
          url: signed.get(row.storage_path) ?? null,
        }))
        .sort((a, b) => a.kind.localeCompare(b.kind));
    };

    const appearsIn = new Map(state.characters.map((c) => [c.canonical_id, c.appears_in]));
    const usedBy = new Map(state.environments.map((e) => [e.canonical_id, e.used_by]));

    return {
      film_id: story_id,
      title: state.title,
      style: state.visual_style.style,
      characters: (charRows.data ?? []).map((row) => {
        const assets = assetsFor("character", row.canonical_id);
        return {
          canonical_id: row.canonical_id,
          name: str(row.name),
          age: str(row.age),
          appearance: str(row.appearance),
          face: str(row.face),
          hair: str(row.hair),
          skin: str(row.skin),
          body: str(row.body),
          height: str(row.height),
          build: str(row.build),
          personality: str(row.personality),
          expression_profile: str(row.expression_profile),
          locks: readLocks(row.locks),
          continuity_constraints: strList(row.continuity_constraints),
          version: row.version,
          appears_in: appearsIn.get(row.canonical_id) ?? [],
          reference_assets: assets,
          reference_pack_ready: assets.length > 0,
        };
      }),
      environments: (envRows.data ?? []).map((row) => {
        const assets = assetsFor("environment", row.canonical_id);
        return {
          canonical_id: row.canonical_id,
          name: str(row.name),
          architecture: str(row.architecture),
          layout: str(row.layout),
          furniture: str(row.furniture),
          materials: str(row.materials),
          palette: str(row.palette),
          lighting: str(row.lighting),
          props: strList(row.props),
          continuity_constraints: strList(row.continuity_constraints),
          version: row.version,
          used_by: usedBy.get(row.canonical_id) ?? [],
          reference_assets: assets,
          reference_pack_ready: assets.length > 0,
        };
      }),
      wardrobe: (wardrobeRows.data ?? []).map((row) => ({
        canonical_id: row.canonical_id,
        character_canonical_id: row.character_canonical_id,
        description: str(row.description),
        accessories: str(row.accessories),
        from_scene: row.from_scene,
        changed_in_scene: row.changed_in_scene,
        reason: str(row.reason),
      })),
      props: (propRows.data ?? []).map((row) => ({
        canonical_id: row.canonical_id,
        name: str(row.name),
        appearance: str(row.appearance),
        owner_canonical_id: row.owner_canonical_id,
        location: str(row.location),
        state: str(row.state),
        scene_number: row.scene_number,
      })),
      scenes: state.scenes.map((scene) => ({
        scene_id: scene.scene_id,
        scene_number: scene.scene_number,
        title: scene.title,
        previous_scene_id: scene.previous_scene_id,
        next_scene_id: scene.next_scene_id,
        environment_id: scene.environment_id,
        characters: scene.characters,
        status: scene.generation_status,
        has_clip: scene.output_assets.length > 0,
      })),
      style_assets: assetsFor("style", "STYLE_01"),
    };
  });

/* ------------------------------------------------------------------ editing */

const characterEdit = ref.extend({
  canonical_id: z.string().trim().min(1),
  name: z.string().trim().max(120),
  age: z.string().trim().max(120).default(""),
  appearance: z.string().trim().max(2000).default(""),
  face: z.string().trim().max(2000).default(""),
  hair: z.string().trim().max(2000).default(""),
  skin: z.string().trim().max(2000).default(""),
  body: z.string().trim().max(2000).default(""),
  height: z.string().trim().max(120).default(""),
  build: z.string().trim().max(240).default(""),
  personality: z.string().trim().max(2000).default(""),
  expression_profile: z.string().trim().max(2000).default(""),
  locks: z
    .object({
      identity: z.boolean(),
      face: z.boolean(),
      hair: z.boolean(),
      skin: z.boolean(),
      body: z.boolean(),
      wardrobe: z.boolean(),
      accessories: z.boolean(),
    })
    .default(DEFAULT_LOCKS),
  continuity_constraints: z.array(z.string().trim().max(400)).max(40).default([]),
});

export type CanonSaveResult = {
  canonical_id: string;
  version: number;
  /** Which scenes this entity appears in — change propagation is the creator's call. */
  affected_scenes: number[];
};

/** Confirms the film belongs to this session before any canon write. */
async function assertOwner(film_id: string, session_id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("stories")
    .select("id")
    .eq("id", film_id)
    .eq("session_id", session_id)
    .maybeSingle();
  if (!data) throw new Error("That film could not be found.");
}

/** Append-only history: the previous row is archived before the new one lands. */
async function archive(
  story_id: string,
  subject_type: string,
  subject_canonical_id: string,
  version: number,
  snapshot: unknown,
  note: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("film_canon_versions").insert({
    story_id,
    subject_type,
    subject_canonical_id,
    version,
    snapshot: snapshot as never,
    note,
  });
}

/** Edit one canonical character. Locked truth changes only through this call. */
export const saveCanonCharacter = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => characterEdit.parse(data))
  .handler(async ({ data }): Promise<CanonSaveResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwner(data.film_id, data.session_id);

    const { data: current } = await supabaseAdmin
      .from("film_canon_characters")
      .select("*")
      .eq("story_id", data.film_id)
      .eq("canonical_id", data.canonical_id)
      .maybeSingle();

    if (!current) throw new Error("That character is not part of this film's canon.");

    await archive(
      data.film_id,
      "character",
      data.canonical_id,
      current.version,
      current,
      "Replaced by a creator edit",
    );

    const nextVersion = current.version + 1;
    const { error } = await supabaseAdmin
      .from("film_canon_characters")
      .update({
        name: data.name || current.name,
        age: data.age,
        appearance: data.appearance,
        face: data.face,
        hair: data.hair,
        skin: data.skin,
        body: data.body,
        height: data.height,
        build: data.build,
        personality: data.personality,
        expression_profile: data.expression_profile,
        locks: data.locks,
        continuity_constraints: data.continuity_constraints,
        version: nextVersion,
      })
      .eq("id", current.id);
    if (error) throw new Error(error.message);

    const state = await deriveState(data.film_id, data.session_id);
    return {
      canonical_id: data.canonical_id,
      version: nextVersion,
      affected_scenes: affectedScenes(state, data.canonical_id),
    };
  });

const environmentEdit = ref.extend({
  canonical_id: z.string().trim().min(1),
  name: z.string().trim().max(200),
  architecture: z.string().trim().max(2000).default(""),
  layout: z.string().trim().max(2000).default(""),
  furniture: z.string().trim().max(2000).default(""),
  materials: z.string().trim().max(2000).default(""),
  palette: z.string().trim().max(2000).default(""),
  lighting: z.string().trim().max(2000).default(""),
  props: z.array(z.string().trim().max(200)).max(60).default([]),
  continuity_constraints: z.array(z.string().trim().max(400)).max(40).default([]),
});

/** Edit one canonical environment. */
export const saveCanonEnvironment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => environmentEdit.parse(data))
  .handler(async ({ data }): Promise<CanonSaveResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwner(data.film_id, data.session_id);

    const { data: current } = await supabaseAdmin
      .from("film_canon_environments")
      .select("*")
      .eq("story_id", data.film_id)
      .eq("canonical_id", data.canonical_id)
      .maybeSingle();

    if (!current) throw new Error("That location is not part of this film's canon.");

    await archive(
      data.film_id,
      "environment",
      data.canonical_id,
      current.version,
      current,
      "Replaced by a creator edit",
    );

    const nextVersion = current.version + 1;
    const { error } = await supabaseAdmin
      .from("film_canon_environments")
      .update({
        name: data.name || current.name,
        architecture: data.architecture,
        layout: data.layout,
        furniture: data.furniture,
        materials: data.materials,
        palette: data.palette,
        lighting: data.lighting,
        props: data.props,
        continuity_constraints: data.continuity_constraints,
        version: nextVersion,
      })
      .eq("id", current.id);
    if (error) throw new Error(error.message);

    const state = await deriveState(data.film_id, data.session_id);
    return {
      canonical_id: data.canonical_id,
      version: nextVersion,
      affected_scenes: affectedScenes(state, data.canonical_id),
    };
  });

const wardrobeEdit = ref.extend({
  canonical_id: z.string().trim().min(1),
  description: z.string().trim().max(2000).default(""),
  accessories: z.string().trim().max(2000).default(""),
  changed_in_scene: z.number().int().min(1).max(500).nullable().default(null),
  reason: z.string().trim().max(1000).default(""),
});

/** Edit one wardrobe state. A change is always an explicit story event. */
export const saveCanonWardrobe = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => wardrobeEdit.parse(data))
  .handler(async ({ data }): Promise<{ canonical_id: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwner(data.film_id, data.session_id);

    const { data: current } = await supabaseAdmin
      .from("film_canon_wardrobe")
      .select("*")
      .eq("story_id", data.film_id)
      .eq("canonical_id", data.canonical_id)
      .maybeSingle();
    if (!current) throw new Error("That wardrobe state is not part of this film's canon.");

    await archive(
      data.film_id,
      "wardrobe",
      data.canonical_id,
      1,
      current,
      "Replaced by a creator edit",
    );

    const { error } = await supabaseAdmin
      .from("film_canon_wardrobe")
      .update({
        description: data.description,
        accessories: data.accessories,
        changed_in_scene: data.changed_in_scene,
        reason: data.reason,
      })
      .eq("id", current.id);
    if (error) throw new Error(error.message);

    return { canonical_id: data.canonical_id };
  });

const propEdit = ref.extend({
  canonical_id: z.string().trim().min(1),
  name: z.string().trim().max(200),
  appearance: z.string().trim().max(2000).default(""),
  owner_canonical_id: z.string().trim().max(120).nullable().default(null),
  location: z.string().trim().max(400).default(""),
  state: z.string().trim().max(400).default(""),
  scene_number: z.number().int().min(1).max(500).nullable().default(null),
});

/** Edit one canonical prop, including who holds it and where it now sits. */
export const saveCanonProp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => propEdit.parse(data))
  .handler(async ({ data }): Promise<{ canonical_id: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwner(data.film_id, data.session_id);

    const { data: current } = await supabaseAdmin
      .from("film_canon_props")
      .select("*")
      .eq("story_id", data.film_id)
      .eq("canonical_id", data.canonical_id)
      .maybeSingle();
    if (!current) throw new Error("That prop is not part of this film's canon.");

    await archive(
      data.film_id,
      "prop",
      data.canonical_id,
      1,
      current,
      "Replaced by a creator edit",
    );

    const { error } = await supabaseAdmin
      .from("film_canon_props")
      .update({
        name: data.name || current.name,
        appearance: data.appearance,
        owner_canonical_id: data.owner_canonical_id,
        location: data.location,
        state: data.state,
        scene_number: data.scene_number,
      })
      .eq("id", current.id);
    if (error) throw new Error(error.message);

    return { canonical_id: data.canonical_id };
  });

/* ------------------------------------------------- reference pack generation */

const assetRequest = ref.extend({
  subject_type: z.enum(["character", "environment", "style"]),
  subject_canonical_id: z.string().trim().min(1).max(120),
  kind: z.string().trim().min(1).max(60),
  /** Every image in one pack run shares a version; a rerun bumps it. */
  version: z.number().int().min(1).max(500),
});

export type CanonAssetResult = {
  subject_canonical_id: string;
  kind: string;
  version: number;
  storage_path: string;
  url: string | null;
  /** Set when the image could not be made; existing images and canon are untouched. */
  error?: string;
};

const CHARACTER_ANGLE: Record<string, string> = {
  front: "straight-on front view of the face and shoulders, neutral expression, eyes to camera",
  "three-quarter-left": "three-quarter view turned to the left, face and shoulders",
  "three-quarter-right": "three-quarter view turned to the right, face and shoulders",
  profile: "exact side profile of the head and shoulders",
  "full-body": "full body standing straight, head to feet, arms relaxed",
  "close-up": "tight close-up of the face, showing skin texture and eye colour",
};

const ENVIRONMENT_ANGLE: Record<string, string> = {
  wide: "wide establishing shot of the whole space, showing architecture and layout",
  detail: "closer shot of the furniture, materials and surfaces of the same space",
  lighting: "the same space showing its characteristic light: direction, colour and contrast",
};

function characterPrompt(row: Record<string, unknown>, kind: string, style: string): string {
  const parts = [
    `Character reference sheet image, ${CHARACTER_ANGLE[kind] ?? kind}.`,
    `Visual style: ${style}.`,
    `Name: ${str(row["name"])}.`,
    str(row["age"]) && `Age: ${str(row["age"])}.`,
    str(row["face"]) && `Face: ${str(row["face"])}.`,
    str(row["hair"]) && `Hair: ${str(row["hair"])}.`,
    str(row["skin"]) && `Skin: ${str(row["skin"])}.`,
    str(row["body"]) && `Body: ${str(row["body"])}.`,
    str(row["height"]) && `Height: ${str(row["height"])}.`,
    str(row["build"]) && `Build: ${str(row["build"])}.`,
    str(row["appearance"]) && `Overall appearance: ${str(row["appearance"])}.`,
    "Plain neutral studio background, even soft lighting, no text, no watermark, no collage, one single person only.",
  ];
  return parts.filter(Boolean).join(" ");
}

function environmentPrompt(row: Record<string, unknown>, kind: string, style: string): string {
  const parts = [
    `Location reference image, ${ENVIRONMENT_ANGLE[kind] ?? kind}.`,
    `Visual style: ${style}.`,
    `Location: ${str(row["name"])}.`,
    str(row["architecture"]) && `Architecture: ${str(row["architecture"])}.`,
    str(row["layout"]) && `Layout: ${str(row["layout"])}.`,
    str(row["furniture"]) && `Furniture: ${str(row["furniture"])}.`,
    str(row["materials"]) && `Materials: ${str(row["materials"])}.`,
    str(row["palette"]) && `Colour palette: ${str(row["palette"])}.`,
    str(row["lighting"]) && `Lighting: ${str(row["lighting"])}.`,
    "Empty of people, no text, no watermark, no collage.",
  ];
  return parts.filter(Boolean).join(" ");
}

/**
 * Generate ONE reference image and store it as canon history.
 *
 * Owner-only, one image per call so the caller can build a pack incrementally
 * and see progress. Nothing here renders a scene or touches generation.
 */
export const generateCanonAsset = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => assetRequest.parse(data))
  .handler(async ({ data }): Promise<CanonAssetResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwner(data.film_id, data.session_id);

    const state = await deriveState(data.film_id, data.session_id);
    const style = state.visual_style.style || "cinematic";

    let prompt: string;
    if (data.subject_type === "character") {
      const { data: row } = await supabaseAdmin
        .from("film_canon_characters")
        .select("*")
        .eq("story_id", data.film_id)
        .eq("canonical_id", data.subject_canonical_id)
        .maybeSingle();
      if (!row) throw new Error("That character is not part of this film's canon.");
      prompt = characterPrompt(row as Record<string, unknown>, data.kind, style);
    } else if (data.subject_type === "environment") {
      const { data: row } = await supabaseAdmin
        .from("film_canon_environments")
        .select("*")
        .eq("story_id", data.film_id)
        .eq("canonical_id", data.subject_canonical_id)
        .maybeSingle();
      if (!row) throw new Error("That location is not part of this film's canon.");
      prompt = environmentPrompt(row as Record<string, unknown>, data.kind, style);
    } else {
      prompt =
        `Style reference frame for a film. Visual style: ${style}. ` +
        `Film: ${state.title}. A single representative frame showing the film's lighting, ` +
        `colour palette, contrast and texture. No text, no watermark, no collage.`;
    }

    const { generateReferenceImage } = await import("@/lib/canon-assets.server");
    let bytes: Uint8Array;
    try {
      bytes = await generateReferenceImage(prompt);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "The reference image could not be generated.";
      return {
        subject_canonical_id: data.subject_canonical_id,
        kind: data.kind,
        version: data.version,
        storage_path: "",
        url: null,
        error: `${message} Nothing was charged; existing images are untouched. / Ingenting debiterades; befintliga bilder är orörda.`,
      };
    }

    const path = `${data.film_id}/${data.subject_canonical_id}/${data.kind}-v${data.version}.png`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(ASSET_BUCKET)
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (uploadError) throw new Error("The reference image could not be saved.");

    const { data: existing } = await supabaseAdmin
      .from("film_canon_assets")
      .select("id")
      .eq("story_id", data.film_id)
      .eq("subject_type", data.subject_type)
      .eq("subject_canonical_id", data.subject_canonical_id)
      .eq("kind", data.kind)
      .eq("version", data.version)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from("film_canon_assets")
        .update({ storage_path: path, prompt })
        .eq("id", existing.id);
    } else {
      const { error } = await supabaseAdmin.from("film_canon_assets").insert({
        story_id: data.film_id,
        subject_type: data.subject_type,
        subject_canonical_id: data.subject_canonical_id,
        kind: data.kind,
        storage_path: path,
        prompt,
        version: data.version,
      });
      if (error) throw new Error(error.message);
    }

    const { data: link } = await supabaseAdmin.storage
      .from(ASSET_BUCKET)
      .createSignedUrl(path, ASSET_URL_TTL);

    return {
      subject_canonical_id: data.subject_canonical_id,
      kind: data.kind,
      version: data.version,
      storage_path: path,
      url: link?.signedUrl ?? null,
    };
  });

/* --------------------------------------------- PHASE 3: reference resolution */

/**
 * The canon as the pure resolver needs it: stored rows plus signed links, and
 * the scene chain from the derived FilmState (camera, wardrobe, props, location).
 * Read-only — no seeding, no writes, no generation.
 */
export async function loadResolverCanon(
  film_id: string,
  session_id: string,
): Promise<ResolverCanon> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const state = await deriveState(film_id, session_id);

  const [charRows, envRows, assetRows] = await Promise.all([
    supabaseAdmin.from("film_canon_characters").select("*").eq("story_id", film_id),
    supabaseAdmin.from("film_canon_environments").select("*").eq("story_id", film_id),
    supabaseAdmin.from("film_canon_assets").select("*").eq("story_id", film_id),
  ]);

  const paths = (assetRows.data ?? []).map((row) => row.storage_path);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: links } = await supabaseAdmin.storage
      .from(ASSET_BUCKET)
      .createSignedUrls(paths, ASSET_URL_TTL);
    for (const link of links ?? []) {
      if (link.path && link.signedUrl) signed.set(link.path, link.signedUrl);
    }
  }

  /**
   * The newest image per angle reaches generation. Keeping it per angle means a
   * half-finished pack run never hides the angles that were already generated.
   */
  const assetsFor = (type: string, id: string): RefImage[] => {
    const rows = (assetRows.data ?? []).filter(
      (row) => row.subject_type === type && row.subject_canonical_id === id,
    );
    if (!rows.length) return [];
    const latestOf = new Map<string, number>();
    for (const row of rows) {
      latestOf.set(row.kind, Math.max(latestOf.get(row.kind) ?? 0, row.version));
    }
    return rows
      .filter((row) => row.version === latestOf.get(row.kind))
      .map((row) => ({
        kind: row.kind,
        storage_path: row.storage_path,
        version: row.version,
        url: signed.get(row.storage_path) ?? null,
      }))
      .sort((a, b) => a.kind.localeCompare(b.kind));
  };

  return {
    characters: (charRows.data ?? [])
      .map((row) => ({
        canonical_id: row.canonical_id,
        name: str(row.name),
        face: str(row.face),
        hair: str(row.hair),
        skin: str(row.skin),
        body: str(row.body),
        height: str(row.height),
        build: str(row.build),
        locks: readLocks(row.locks),
        reference_assets: assetsFor("character", row.canonical_id),
      }))
      .sort((a, b) => a.canonical_id.localeCompare(b.canonical_id)),
    environments: (envRows.data ?? [])
      .map((row) => ({
        canonical_id: row.canonical_id,
        name: str(row.name),
        reference_assets: assetsFor("environment", row.canonical_id),
      }))
      .sort((a, b) => a.canonical_id.localeCompare(b.canonical_id)),
    style_assets: assetsFor("style", "STYLE_01"),
    scenes: state.scenes.map((scene) => ({
      scene_id: scene.scene_id,
      scene_number: scene.scene_number,
      title: scene.title,
      characters: scene.characters,
      environment_id: scene.environment_id,
      camera: scene.camera,
      wardrobe: scene.wardrobe[0]?.value ?? null,
      props: scene.props,
      location: scene.environment_id,
    })),
  };
}

export type SceneReferencePlan = {
  scene_id: string;
  scene_number: number;
  shot_type: string;
  mode: "image-conditioned" | "text-only";
  /** Honest marker: the current engines are text-to-video. */
  provider_conditions_on_images: boolean;
  missing: string[];
  previous_scene_status: string | null;
  selections: {
    label: string;
    reason: string;
    images: { kind: string; url: string | null }[];
  }[];
};

/**
 * What the creator sees before pressing generate: which references a scene would
 * use, why, and whether the lock can actually be enforced. Pure read.
 */
export const getSceneReferencePlans = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ref.parse(data))
  .handler(async ({ data }): Promise<SceneReferencePlan[]> => {
    const { PROVIDER_ACCEPTS_IMAGE_REFERENCES } = await import("@/lib/storyreel-core.server");
    const canon = await loadResolverCanon(data.film_id, data.session_id);

    return canon.scenes.map((scene) => {
      const refs = resolveSceneReferences(canon, scene.scene_number);
      const selections: SceneReferencePlan["selections"] = [];
      for (const character of refs?.characters ?? []) {
        selections.push({
          label: `${character.characterId}${character.name ? ` — ${character.name}` : ""}`,
          reason: character.reason,
          images: character.images.map((image) => ({ kind: image.kind, url: image.url })),
        });
      }
      if (refs?.environment) {
        selections.push({
          label: refs.environment.environmentId,
          reason: "The location plate keeps architecture, materials and light consistent.",
          images: refs.environment.images.map((image) => ({ kind: image.kind, url: image.url })),
        });
      }
      if (refs?.style.length) {
        selections.push({
          label: "STYLE_01",
          reason: "Style frames are appended last, capped at two, to hold the film's look.",
          images: refs.style.map((image) => ({ kind: image.kind, url: image.url })),
        });
      }

      return {
        scene_id: scene.scene_id,
        scene_number: scene.scene_number,
        shot_type: refs?.shotType ?? "medium",
        mode: refs?.mode ?? "text-only",
        provider_conditions_on_images: PROVIDER_ACCEPTS_IMAGE_REFERENCES.lovable,
        missing: refs?.missing ?? [],
        previous_scene_status: refs?.previousSceneStatus ?? null,
        selections,
      };
    });
  });

/* ------------------------------------------- owner uploads + reference usage */

const uploadRequest = ref.extend({
  subject_type: z.enum(["character", "environment", "style"]),
  subject_canonical_id: z.string().trim().min(1).max(120),
  kind: z.string().trim().min(1).max(60),
  content_type: z.enum(["image/png", "image/jpeg", "image/webp"]),
  /** Base64 of the image bytes; capped at roughly 6 MB of image data. */
  data_base64: z.string().min(16).max(8_500_000),
});

const UPLOAD_MARK = "UPLOADED_BY_OWNER";

/**
 * Store the owner's own image as a NEW version of one reference angle.
 * No AI, no credits. Older versions stay as history; nothing regenerates.
 */
export const uploadCanonReference = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => uploadRequest.parse(data))
  .handler(async ({ data }): Promise<CanonAssetResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwner(data.film_id, data.session_id);

    const table =
      data.subject_type === "character"
        ? "film_canon_characters"
        : data.subject_type === "environment"
          ? "film_canon_environments"
          : null;
    if (table) {
      const { data: row } = await supabaseAdmin
        .from(table)
        .select("id")
        .eq("story_id", data.film_id)
        .eq("canonical_id", data.subject_canonical_id)
        .maybeSingle();
      if (!row) throw new Error("That subject is not part of this film's canon.");
    }

    const { data: prior } = await supabaseAdmin
      .from("film_canon_assets")
      .select("version")
      .eq("story_id", data.film_id)
      .eq("subject_type", data.subject_type)
      .eq("subject_canonical_id", data.subject_canonical_id)
      .eq("kind", data.kind);
    const version = Math.max(0, ...(prior ?? []).map((r) => r.version)) + 1;

    const ext = data.content_type.split("/")[1];
    const path = `${data.film_id}/${data.subject_canonical_id}/${data.kind}-v${version}-upload.${ext}`;
    const bytes = Uint8Array.from(atob(data.data_base64), (c) => c.charCodeAt(0));
    const { error: uploadError } = await supabaseAdmin.storage
      .from(ASSET_BUCKET)
      .upload(path, bytes, { contentType: data.content_type, upsert: false });
    if (uploadError) throw new Error("The image could not be saved. / Bilden kunde inte sparas.");

    const { error } = await supabaseAdmin.from("film_canon_assets").insert({
      story_id: data.film_id,
      subject_type: data.subject_type,
      subject_canonical_id: data.subject_canonical_id,
      kind: data.kind,
      storage_path: path,
      prompt: UPLOAD_MARK,
      version,
    });
    if (error) throw new Error(error.message);

    const { data: link } = await supabaseAdmin.storage
      .from(ASSET_BUCKET)
      .createSignedUrl(path, ASSET_URL_TTL);
    return {
      subject_canonical_id: data.subject_canonical_id,
      kind: data.kind,
      version,
      storage_path: path,
      url: link?.signedUrl ?? null,
    };
  });

export type ReferenceUsageItem = {
  subject_type: string;
  subject_canonical_id: string;
  kind: string;
  version: number;
  source: "uploaded" | "generated";
  url: string | null;
  /** True when this is the newest version of its angle (the one scenes use). */
  current: boolean;
  used_in: number[];
};

/** Every reference image and the scenes the resolver would send it with. Pure read. */
export const getReferenceUsage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ref.parse(data))
  .handler(async ({ data }): Promise<ReferenceUsageItem[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwner(data.film_id, data.session_id);
    const canon = await loadResolverCanon(data.film_id, data.session_id);

    const usedIn = new Map<string, Set<number>>();
    for (const scene of canon.scenes) {
      const refs = resolveSceneReferences(canon, scene.scene_number);
      const images = [
        ...(refs?.characters ?? []).flatMap((c) => c.images),
        ...(refs?.environment?.images ?? []),
        ...(refs?.style ?? []),
      ];
      for (const image of images) {
        const set = usedIn.get(image.storage_path) ?? new Set<number>();
        set.add(scene.scene_number);
        usedIn.set(image.storage_path, set);
      }
    }

    const { data: rows } = await supabaseAdmin
      .from("film_canon_assets")
      .select("subject_type, subject_canonical_id, kind, version, storage_path, prompt")
      .eq("story_id", data.film_id);
    const list = rows ?? [];
    const latest = new Map<string, number>();
    for (const row of list) {
      const key = `${row.subject_type}|${row.subject_canonical_id}|${row.kind}`;
      latest.set(key, Math.max(latest.get(key) ?? 0, row.version));
    }
    const signed = new Map<string, string>();
    if (list.length) {
      const { data: links } = await supabaseAdmin.storage.from(ASSET_BUCKET).createSignedUrls(
        list.map((r) => r.storage_path),
        ASSET_URL_TTL,
      );
      for (const link of links ?? [])
        if (link.path && link.signedUrl) signed.set(link.path, link.signedUrl);
    }

    return list
      .map((row) => ({
        subject_type: row.subject_type,
        subject_canonical_id: row.subject_canonical_id,
        kind: row.kind,
        version: row.version,
        source: (row.prompt === UPLOAD_MARK ? "uploaded" : "generated") as "uploaded" | "generated",
        url: signed.get(row.storage_path) ?? null,
        current:
          latest.get(`${row.subject_type}|${row.subject_canonical_id}|${row.kind}`) === row.version,
        used_in: [...(usedIn.get(row.storage_path) ?? [])].sort((a, b) => a - b),
      }))
      .sort(
        (a, b) =>
          a.subject_canonical_id.localeCompare(b.subject_canonical_id) ||
          a.kind.localeCompare(b.kind) ||
          b.version - a.version,
      );
  });
