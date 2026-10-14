import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  carryWarnings,
  currentSnapshot,
  planRestore,
  planUniverseUpdate,
  previouslySummary,
  readSnapshot,
  selectCarry,
  statusFromText,
  type FilmOutcome,
  type UniverseConflict,
  type UniverseSnapshot,
  type UniverseVersionRow,
} from "@/lib/universe";

/**
 * ROLLING UNIVERSE — Creator-only memory across films. Every change is a new,
 * append-only version row. Canon of a single film is never touched here, except
 * that a film started with a carry seeds its canon once (see canon.functions).
 * No AI, no credits, no generation.
 */

export type UniverseVersionView = {
  version: number;
  status: string;
  film_id: string | null;
  film_title: string;
  note: string;
  created_at: string;
  conflicts: UniverseConflict[];
};

export type UniverseView =
  | { creator: false }
  | {
      creator: true;
      snapshot: UniverseSnapshot;
      previously: string[];
      versions: UniverseVersionView[];
    };

/** Creator = the active monthly plan ("Go Creator" checkout), read server-side only. */
async function isCreator(userId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("is_vip, vip_until")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_vip) return false;
  return !data.vip_until || new Date(data.vip_until) > new Date();
}

async function loadHistory(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("universe_versions")
    .select(
      "version, status, film_id, film_title, note, fingerprint, snapshot, conflicts, created_at",
    )
    .eq("user_id", userId)
    .order("version", { ascending: true });
  return (data ?? []).map((row) => ({
    ...row,
    status: row.status as UniverseVersionRow["status"],
    snapshot: readSnapshot(row.snapshot),
    conflicts: (Array.isArray(row.conflicts) ? row.conflicts : []) as UniverseConflict[],
  }));
}

async function insertVersion(row: {
  user_id: string;
  version: number;
  status: string;
  film_id: string | null;
  film_title: string;
  note: string;
  fingerprint: string;
  snapshot: UniverseSnapshot;
  conflicts: UniverseConflict[];
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("universe_versions")
    .insert({ ...row, snapshot: row.snapshot as never, conflicts: row.conflicts as never });
  if (error) throw new Error("Could not save your universe. / Kunde inte spara ditt universum.");
}

function view(history: Awaited<ReturnType<typeof loadHistory>>): UniverseView {
  const snapshot = currentSnapshot(history);
  return {
    creator: true,
    snapshot,
    previously: previouslySummary(snapshot),
    versions: history
      .map((r) => ({
        version: r.version,
        status: r.status,
        film_id: r.film_id,
        film_title: r.film_title,
        note: r.note,
        created_at: r.created_at,
        conflicts: r.conflicts,
      }))
      .reverse(),
  };
}

export const getUniverse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UniverseView> => {
    if (!(await isCreator(context.userId))) return { creator: false };
    return view(await loadHistory(context.userId));
  });

/** The film's end state, read deterministically from its canon and StoryState. */
async function filmOutcome(
  film_id: string,
  session_id: string,
): Promise<{
  outcome: FilmOutcome;
  finished: boolean;
}> {
  const { deriveStory, loadResolverCanon } = await import("@/lib/canon.functions");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ story, film }, canon, wardrobe] = await Promise.all([
    deriveStory(film_id, session_id),
    loadResolverCanon(film_id, session_id),
    supabaseAdmin.from("film_canon_wardrobe").select("*").eq("story_id", film_id),
  ]);

  const latestWardrobe = new Map<string, { scene: number; text: string }>();
  for (const w of wardrobe.data ?? []) {
    const scene = w.changed_in_scene ?? w.from_scene ?? 0;
    const had = latestWardrobe.get(w.character_canonical_id);
    if (!had || scene >= had.scene) {
      latestWardrobe.set(w.character_canonical_id, { scene, text: w.description });
    }
  }

  const characters = canon.characters.length
    ? canon.characters.map((c) => ({
        canonical_id: c.canonical_id,
        name: c.name,
        locked: {
          name: c.name,
          face: c.face,
          hair: c.hair,
          skin: c.skin,
          body: c.body,
          height: c.height,
          build: c.build,
        },
        reference_assets: c.reference_assets.map((a) => `${a.kind}::${a.storage_path}`),
      }))
    : story.characters.map((c) => ({
        canonical_id: c.id,
        name: c.name,
        locked: { name: c.name },
        reference_assets: [] as string[],
      }));

  const outcome: FilmOutcome = {
    film_id,
    film_title: film.title,
    style: {
      name: String(film.style ?? ""),
      reference_assets: canon.style_assets.map((a) => `${a.kind}::${a.storage_path}`),
    },
    characters: characters.map((c) => {
      const state = story.character_states.find((s) => s.character_id === c.canonical_id);
      const events = state?.events ?? [];
      const last = (aspect: string) =>
        [...events].reverse().find((e) => e.aspect === aspect)?.value;
      const physical = events.filter((e) => e.aspect === "physical").map((e) => e.value);
      const status = physical.map(statusFromText).filter(Boolean).pop() ?? undefined;
      return {
        canonical_id: c.canonical_id,
        locked: c.locked,
        reference_assets: c.reference_assets,
        end: {
          ...(status ? { status } : {}),
          wardrobe: latestWardrobe.get(c.canonical_id)?.text ?? "",
          location: last("location") ?? "",
          injuries: physical.filter((p) => !statusFromText(p)),
          relationships: events.filter((e) => e.aspect === "relationship").map((e) => e.value),
          knowledge: (state?.knowledge ?? [])
            .filter((k) => k.state === "known" || k.state === "revealed")
            .map((k) => k.subject),
        },
      };
    }),
    locations: canon.environments.map((e) => ({
      canonical_id: e.canonical_id,
      locked: { name: e.name },
      reference_assets: e.reference_assets.map((a) => `${a.kind}::${a.storage_path}`),
      end: {},
    })),
    events: story.timeline
      .slice(-6)
      .map((t) => ({ scene_number: t.scene_number, description: t.description })),
  };

  const scenes = story.scenes;
  const finished = scenes.length > 0 && scenes.every((s) => s.generation?.status === "completed");
  return { outcome, finished };
}

const syncInput = z.object({
  film_id: z.string().uuid(),
  session_id: z.string().uuid(),
  only_if_finished: z.boolean().optional().default(false),
});

export type SyncResult =
  | { status: "locked" | "not_finished" | "already_recorded" }
  | { status: "applied" | "pending"; version: number; conflicts: UniverseConflict[] };

/** Called automatically from a finished film's page, or by an explicit press. */
export const syncUniverseFromFilm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => syncInput.parse(data))
  .handler(async ({ data, context }): Promise<SyncResult> => {
    if (!(await isCreator(context.userId))) return { status: "locked" };
    const { outcome, finished } = await filmOutcome(data.film_id, data.session_id);
    if (data.only_if_finished && !finished) return { status: "not_finished" };
    const history = await loadHistory(context.userId);
    const plan = planUniverseUpdate(history, outcome);
    if (plan.kind === "skip") return { status: "already_recorded" };
    await insertVersion({
      user_id: context.userId,
      version: plan.version,
      status: plan.kind === "apply" ? "applied" : "pending",
      film_id: outcome.film_id,
      film_title: outcome.film_title,
      note:
        plan.kind === "apply"
          ? "Updated from film"
          : "Waiting for you — this film contradicts your universe",
      fingerprint: plan.fingerprint,
      snapshot: plan.snapshot,
      conflicts: plan.conflicts,
    });
    return {
      status: plan.kind === "apply" ? "applied" : "pending",
      version: plan.version,
      conflicts: plan.conflicts,
    };
  });

const resolveInput = z.object({
  version: z.number().int().positive(),
  decision: z.enum(["accept", "reject"]),
  session_id: z.string().uuid(),
});

/** The creator's answer to a contradiction. Nothing is decided without it. */
export const resolveUniverseConflict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => resolveInput.parse(data))
  .handler(async ({ data, context }): Promise<UniverseView> => {
    if (!(await isCreator(context.userId))) return { creator: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const history = await loadHistory(context.userId);
    const pending = history.find((r) => r.version === data.version && r.status === "pending");
    if (!pending) return view(history);

    await supabaseAdmin
      .from("universe_versions")
      .update({ status: data.decision === "accept" ? "resolved" : "rejected" })
      .eq("user_id", context.userId)
      .eq("version", data.version);

    if (data.decision === "accept" && pending.film_id) {
      const { outcome } = await filmOutcome(pending.film_id, data.session_id);
      const allowReturns = pending.conflicts
        .filter((c) => c.kind === "dead_returns")
        .map((c) => c.canonical_id);
      const fresh = await loadHistory(context.userId);
      const plan = planUniverseUpdate(fresh, outcome, { allowReturns, force: true });
      if (plan.kind !== "skip") {
        await insertVersion({
          user_id: context.userId,
          version: plan.version,
          status: "applied",
          film_id: outcome.film_id,
          film_title: outcome.film_title,
          note: "Applied after you approved the contradiction",
          fingerprint: `${plan.fingerprint}:approved`,
          snapshot: plan.snapshot,
          conflicts: plan.conflicts,
        });
      }
    }
    return view(await loadHistory(context.userId));
  });

const restoreInput = z.object({ version: z.number().int().positive() });

export const restoreUniverseVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => restoreInput.parse(data))
  .handler(async ({ data, context }): Promise<UniverseView> => {
    if (!(await isCreator(context.userId))) return { creator: false };
    const history = await loadHistory(context.userId);
    const plan = planRestore(history, data.version);
    if (plan) {
      await insertVersion({
        user_id: context.userId,
        version: plan.version,
        status: "applied",
        film_id: null,
        film_title: "",
        note: `Restored from version ${data.version}`,
        fingerprint: `restore:${data.version}:${plan.version}`,
        snapshot: plan.snapshot,
        conflicts: [],
      });
    }
    return view(await loadHistory(context.userId));
  });

const carryInput = z.object({
  director_session_id: z.string().uuid(),
  session_id: z.string().uuid(),
  character_ids: z.array(z.string()).max(40),
  location_ids: z.array(z.string()).max(40),
});

/** Store the ticked slice on the Director session; canon seeds from it once. */
export const attachUniverseCarry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => carryInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; warnings: string[] }> => {
    if (!(await isCreator(context.userId))) return { ok: false, warnings: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const carry = selectCarry(
      currentSnapshot(await loadHistory(context.userId)),
      data.character_ids,
      data.location_ids,
    );
    const { error } = await supabaseAdmin
      .from("director_sessions")
      .update({ universe_carry: carry as never })
      .eq("id", data.director_session_id)
      .eq("session_id", data.session_id);
    return { ok: !error, warnings: carryWarnings(carry) };
  });
