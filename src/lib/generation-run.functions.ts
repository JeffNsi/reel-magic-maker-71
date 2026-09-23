import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { defaultSettings, getModel } from "@/generation/catalog";
import type { MediaItem, MediaRole, ModelEntry } from "@/generation/catalog/types";
import {
  PlatformError,
  availablePlatforms,
  createPlatformClient,
  credentialsFor,
} from "@/generation/platform.server";
import { platformPathFor, toPlatform } from "@/generation/to-platform";
import { diagnoseFailure } from "@/lib/generation-recovery";

type Authed = { supabase: SupabaseClient<Database>; userId: string };

/**
 * Run lifecycle for the creator's own platform account (STRONG engine).
 *
 * Every run is one row: submit writes rows first, then submits, so a page reload
 * resumes polling from persisted state and never from an in-memory promise. The
 * failure vocabulary is the existing one in generation-recovery.
 */

const BUCKET = "generation-uploads";
const MAX_BATCH = 4;
/** Signed URLs handed to the platform must outlive the run comfortably. */
const ASSET_TTL = 60 * 60 * 24 * 7;

const mediaItemSchema = z.object({
  url: z.string().url(),
  kind: z.enum(["image", "video", "audio"]),
});

const planeSchema = z.object({
  model: z.string().min(1),
  prompt: z.object({ text: z.string().max(4000) }),
  media: z
    .record(z.enum(["start", "end", "reference", "video", "audio"]), z.array(mediaItemSchema))
    .default({}),
  settings: z.record(z.string(), z.unknown()).default({}),
});

/** Settings are persisted as JSON, so only JSON scalars ever reach a row. */
export type SettingValue = string | number | boolean;

export type RunRow = {
  id: string;
  /** Which scene this run belongs to, when it was pressed from a scene. */
  scene_id: string | null;
  batch_id: string;
  batch_index: number;
  surface: string;
  model: string;
  model_label: string;
  prompt: string;
  settings: Record<string, SettingValue>;
  media: Partial<Record<MediaRole, MediaItem[]>>;
  aspect_ratio: string;
  status: "queued" | "processing" | "completed" | "failed";
  queue_position: number | null;
  images: string[];
  video_url: string | null;
  error_message: string | null;
  error_category: string | null;
  favourite: boolean;
  created_at: string;
};

const RUN_COLUMNS =
  "scene_id, id, batch_id, batch_index, surface, model, model_label, prompt, settings, media, aspect_ratio, status, queue_position, images, video_url, error_message, error_category, favourite, deadline_at, created_at";

function asRun(row: Record<string, unknown>): RunRow {
  return {
    id: String(row["id"]),
    scene_id: (row["scene_id"] as string | null) ?? null,
    batch_id: String(row["batch_id"]),
    batch_index: Number(row["batch_index"] ?? 0),
    surface: String(row["surface"] ?? "video"),
    model: String(row["model"]),
    model_label: String(row["model_label"] ?? row["model"]),
    prompt: String(row["prompt"] ?? ""),
    settings: (row["settings"] as Record<string, SettingValue>) ?? {},
    media: (row["media"] as Partial<Record<MediaRole, MediaItem[]>>) ?? {},
    aspect_ratio: String(row["aspect_ratio"] ?? "9:16"),
    status: (row["status"] as RunRow["status"]) ?? "queued",
    queue_position: (row["queue_position"] as number | null) ?? null,
    images: Array.isArray(row["images"]) ? (row["images"] as string[]) : [],
    video_url: (row["video_url"] as string | null) ?? null,
    error_message: (row["error_message"] as string | null) ?? null,
    error_category: (row["error_category"] as string | null) ?? null,
    favourite: Boolean(row["favourite"]),
    created_at: String(row["created_at"]),
  };
}

/** The declared aspect ratio, so a skeleton tile has the right shape at once. */
function aspectOf(entry: ModelEntry, settings: Record<string, SettingValue>): string {
  const field = entry.settings["aspectRatio"];
  if (!field || field.type !== "enum") return "9:16";
  const chosen = settings["aspectRatio"];
  return typeof chosen === "string" && field.values.includes(chosen) ? chosen : field.default;
}

/** A model that renders several results per request declares its own count field. */
function nativeCountKey(entry: ModelEntry): string | null {
  const field = entry.settings["batchSize"];
  return field && field.type === "range" ? "batchSize" : null;
}

async function currentKey(): Promise<string | null> {
  const { platformKeyFromRequest } = await import("./platform-key.server");
  return platformKeyFromRequest();
}

function failureOf(err: unknown): { message: string; category: string; kind: string } {
  if (err instanceof PlatformError) {
    return {
      message: err.message,
      category: diagnoseFailure(err.message).category,
      kind: err.kind,
    };
  }
  const message = err instanceof Error ? err.message : "The run could not be started.";
  return { message, category: diagnoseFailure(message).category, kind: "request" };
}

export const submitRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ plane: planeSchema, count: z.number().int().min(1).max(MAX_BATCH).default(1) })
      .parse(input),
  )
  .handler(({ data, context }) => submitPlane(context, data.plane, data.count));

/**
 * The submit core, shared by the free-form studio and the Director's scene
 * presses. `link` ties the run to a film and scene so the scene view can show
 * its own output assets — history only, never canonical truth.
 */
export async function submitPlane(
  context: Authed,
  plane: z.infer<typeof planeSchema>,
  count: number,
  link: { story_id?: string; scene_id?: string } = {},
): Promise<{ runs: RunRow[] }> {
  const entry = getModel(plane.model);
  if (!entry) throw new Error(`Unknown model: ${plane.model}`);

  const settings = {
    ...defaultSettings(entry),
    ...plane.settings,
  } as Record<string, SettingValue>;
  const countKey = nativeCountKey(entry);
  // Native count models render the whole batch in one request; the rest get one
  // request per result so every tile clears on its own clock.
  const requests = countKey ? 1 : count;
  if (countKey) settings[countKey] = count;

  const resolved = toPlatform({ ...plane, settings });
  const aspect = aspectOf(entry, settings);
  const batchId = crypto.randomUUID();

  // Key and platform address are checked BEFORE any row is written, so a
  // missing key never leaves an orphan run stuck at "queued".
  const client = createPlatformClient(credentialsFor(entry, await currentKey()));

  const rows = Array.from({ length: requests }, (_, index) => ({
    user_id: context.userId,
    batch_id: batchId,
    batch_index: index,
    surface: entry.surface,
    model: entry.id,
    model_label: entry.label,
    prompt: plane.prompt.text.trim(),
    settings: settings as unknown as Json,
    media: plane.media as unknown as Json,
    aspect_ratio: aspect,
    status: "queued",
    story_id: link.story_id ?? null,
    scene_id: link.scene_id ?? null,
  }));

  const { data: inserted, error } = await context.supabase
    .from("generation_runs")
    .insert(rows)
    .select(RUN_COLUMNS);

  if (error || !inserted) throw new Error("The run could not be recorded. Please try again.");

  const results = await Promise.all(
    inserted.map(async (row) => {
      try {
        const submitted = await client.submit(resolved.path, resolved.body);
        const { data: updated } = await context.supabase
          .from("generation_runs")
          .update({ request_id: submitted.request_id, status: "processing" })
          .eq("id", row.id as string)
          .select(RUN_COLUMNS)
          .single();
        return asRun((updated ?? row) as Record<string, unknown>);
      } catch (err) {
        const failure = failureOf(err);
        const { data: updated } = await context.supabase
          .from("generation_runs")
          .update({
            status: "failed",
            error_message: failure.message,
            error_category: failure.kind,
          })
          .eq("id", row.id as string)
          .select(RUN_COLUMNS)
          .single();
        return asRun((updated ?? row) as Record<string, unknown>);
      }
    }),
  );

  return { runs: results };
}

export const listRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(200).default(48),
        scene_id: z.string().uuid().optional(),
        story_id: z.string().uuid().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase.from("generation_runs").select(RUN_COLUMNS);
    if (data.scene_id) query = query.eq("scene_id", data.scene_id);
    if (data.story_id) query = query.eq("story_id", data.story_id);
    const { data: rows } = await query.order("created_at", { ascending: false }).limit(data.limit);
    return { runs: (rows ?? []).map((row) => asRun(row as Record<string, unknown>)) };
  });

/**
 * Advance every open run. Each row is polled independently, so one slow request
 * never holds back a result that already finished. Called on a 4-second clock by
 * the client and safe to call after a reload.
 */
export const pollRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows } = await context.supabase
      .from("generation_runs")
      .select(RUN_COLUMNS)
      .in("status", ["queued", "processing"])
      .order("created_at", { ascending: false })
      .limit(24);

    const open = rows ?? [];
    if (open.length === 0) return { runs: [] as RunRow[], key_missing: false };

    const creatorKey = await currentKey();

    const updated = await Promise.all(
      open.map(async (row) => {
        const record = row as Record<string, unknown>;
        const requestId = record["request_id"] as string | null;
        const deadline = new Date(String(record["deadline_at"] ?? "")).getTime();

        if (Number.isFinite(deadline) && Date.now() > deadline) {
          const { data: done } = await context.supabase
            .from("generation_runs")
            .update({
              status: "failed",
              error_message:
                "The platform did not finish this run within ten minutes. Nothing was delivered — retry when you like.",
              error_category: "timeout",
            })
            .eq("id", record["id"] as string)
            .select(RUN_COLUMNS)
            .single();
          return asRun((done ?? record) as Record<string, unknown>);
        }

        if (!requestId) return asRun(record);

        const entry = getModel(String(record["model"] ?? ""));
        if (!entry) return asRun(record);

        try {
          const client = createPlatformClient(credentialsFor(entry, creatorKey));
          const path = platformPathFor(
            entry,
            (record["media"] as Partial<Record<MediaRole, MediaItem[]>>) ?? {},
          );
          const status = await client.status(requestId, path);
          const patch =
            status.state === "completed"
              ? {
                  status: "completed",
                  images: status.images,
                  video_url: status.video,
                  queue_position: null,
                }
              : status.state === "failed"
                ? {
                    status: "failed",
                    error_message: status.reason,
                    error_category: diagnoseFailure(status.reason).category,
                  }
                : {
                    status: status.state,
                    queue_position: status.queue_position,
                  };

          const { data: done } = await context.supabase
            .from("generation_runs")
            .update(patch)
            .eq("id", record["id"] as string)
            .select(RUN_COLUMNS)
            .single();
          return asRun((done ?? record) as Record<string, unknown>);
        } catch {
          // A transient status failure leaves the run open; the next tick retries.
          return asRun(record);
        }
      }),
    );

    return { runs: updated, key_missing: availablePlatforms(creatorKey).length === 0 };
  });

/** Re-run a recorded run with its exact prompt, model, media and settings. */
export const retryRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ run_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("generation_runs")
      .select(RUN_COLUMNS)
      .eq("id", data.run_id)
      .single();
    if (!row) throw new Error("That run is no longer available.");
    const run = asRun(row as Record<string, unknown>);
    return {
      plane: {
        model: run.model,
        prompt: { text: run.prompt },
        media: run.media,
        settings: run.settings,
      },
    };
  });

export const setRunFavourite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ run_id: z.string().uuid(), favourite: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("generation_runs")
      .update({ favourite: data.favourite })
      .eq("id", data.run_id);
    return { favourite: data.favourite };
  });

/* ---------------------------------------------------------------------------
 * Media — our own storage, owner-scoped. No third-party blob store.
 * ------------------------------------------------------------------------- */

const uploadSchema = z.object({
  filename: z.string().min(1).max(200),
  kind: z.enum(["image", "video", "audio"]),
});

export const createUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => uploadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
    const path = `${context.userId}/${data.kind}/${crypto.randomUUID()}-${safe}`;
    const { data: signed, error } = await context.supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error("The upload could not be prepared. Please try again.");
    return { path, token: signed.token, signed_url: signed.signedUrl };
  });

/** After the browser has uploaded, hand back a URL the platform can fetch. */
export const signUploadedAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ path: z.string().min(1), kind: z.enum(["image", "video", "audio"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!data.path.startsWith(`${context.userId}/`)) throw new Error("That file is not yours.");
    const { data: signed, error } = await context.supabase.storage
      .from(BUCKET)
      .createSignedUrl(data.path, ASSET_TTL);
    if (error || !signed?.signedUrl) throw new Error("That file could not be read back.");
    return { url: signed.signedUrl, kind: data.kind, path: data.path };
  });

export type LibraryItem = {
  url: string;
  kind: MediaItem["kind"];
  label: string;
  source: "upload" | "result";
  path: string | null;
};

/** One library, two tabs: the creator's uploads, and results from finished runs. */
export const listLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uploads: LibraryItem[] = [];
    for (const kind of ["image", "video", "audio"] as const) {
      const { data: files } = await context.supabase.storage
        .from(BUCKET)
        .list(`${context.userId}/${kind}`, {
          limit: 100,
          sortBy: { column: "created_at", order: "desc" },
        });
      for (const file of files ?? []) {
        const path = `${context.userId}/${kind}/${file.name}`;
        const { data: signed } = await context.supabase.storage
          .from(BUCKET)
          .createSignedUrl(path, ASSET_TTL);
        if (signed?.signedUrl) {
          uploads.push({ url: signed.signedUrl, kind, label: file.name, source: "upload", path });
        }
      }
    }

    const { data: rows } = await context.supabase
      .from("generation_runs")
      .select("id, model_label, images, video_url, status, created_at")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(60);

    const results: LibraryItem[] = [];
    for (const row of rows ?? []) {
      const record = row as Record<string, unknown>;
      const label = String(record["model_label"] ?? "Result");
      for (const url of Array.isArray(record["images"]) ? (record["images"] as string[]) : []) {
        results.push({ url, kind: "image", label, source: "result", path: null });
      }
      const video = record["video_url"] as string | null;
      if (video) results.push({ url: video, kind: "video", label, source: "result", path: null });
    }

    return { uploads, results };
  });
