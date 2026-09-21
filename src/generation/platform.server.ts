/**
 * Server-only client for the generation platform. The browser never calls this
 * and never sees a key. The Authorization header is never logged.
 */

import { platformOf } from "./catalog";
import type { ModelEntry, PlatformFlavor } from "./catalog/types";
import {
  availablePlatforms,
  baseUrlFor,
  houseFalKey,
  keyAuthHeader,
  platformBaseUrl,
  platformConfig,
} from "./platform-config.server";

export { availablePlatforms, baseUrlFor, platformBaseUrl, platformConfig };

const MODEL_ID = /^[a-z0-9][a-z0-9._/-]*$/i;

/**
 * Every platform failure carries a kind so the UI can act on it: reopen the key
 * modal, say when to retry, or report a platform outage. Never a bare message.
 */
export type PlatformFailureKind = "key" | "rate_limited" | "platform" | "gateway" | "request";

export class PlatformError extends Error {
  readonly kind: PlatformFailureKind;
  readonly status: number;
  readonly retry_after_seconds: number | null;

  constructor(
    kind: PlatformFailureKind,
    message: string,
    status = 0,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "PlatformError";
    this.kind = kind;
    this.status = status;
    this.retry_after_seconds = retryAfterSeconds;
  }
}

function retryAfter(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 3600) : null;
}

export type PlatformSubmit = {
  request_id: string;
  status_url: string | null;
  cancel_url: string | null;
};

export type PlatformStatus =
  | { state: "queued" | "processing"; queue_position: number | null }
  | { state: "completed"; images: string[]; video: string | null }
  | { state: "failed"; reason: string };

type RawSubmit = { request_id?: string; status_url?: string; cancel_url?: string; error?: string };
type RawStatus = {
  status?: string;
  queue_position?: number;
  images?: { url?: string }[];
  video?: { url?: string };
  error?: string | { message?: string };
  detail?: string;
};

function reason(raw: RawStatus): string {
  if (typeof raw.error === "string" && raw.error) return raw.error;
  if (raw.error && typeof raw.error === "object" && raw.error.message) return raw.error.message;
  if (typeof raw.detail === "string" && raw.detail) return raw.detail;
  return "The generation platform rejected this run without a reason.";
}

export function createPlatformClient(opts: {
  apiKey: string;
  baseUrl: string;
  flavor?: PlatformFlavor;
}) {
  const headers = {
    ...keyAuthHeader(opts.apiKey),
    "Content-Type": "application/json",
  };
  const base = opts.baseUrl.replace(/\/+$/, "");
  const flavor: PlatformFlavor = opts.flavor ?? "higgsfield";

  function assertModel(model: string) {
    if (!MODEL_ID.test(model) || model.includes("..")) {
      throw new Error(`Invalid model path: ${model}`);
    }
  }

  return {
    async submit(model: string, input: Record<string, unknown>): Promise<PlatformSubmit> {
      assertModel(model);
      const res = await fetch(`${base}/${model}`, {
        method: "POST",
        headers,
        body: JSON.stringify(input),
      });
      const raw = (await res.json().catch(() => null)) as RawSubmit | null;

      if (!res.ok) {
        console.error(
          "platform submit failed",
          res.status,
          JSON.stringify({ model, error: raw?.error }),
        );
        if (res.status === 401 || res.status === 403) {
          throw new PlatformError(
            "key",
            "The platform rejected this API key. Enter a valid key and try again.",
            res.status,
          );
        }
        if (res.status === 429) {
          const wait = retryAfter(res);
          throw new PlatformError(
            "rate_limited",
            wait
              ? `The platform is rate limiting this account. Try again in about ${wait} second(s).`
              : "The platform is rate limiting this account. Try again in about a minute.",
            429,
            wait,
          );
        }
        if (res.status >= 500) {
          throw new PlatformError(
            "platform",
            "The generation platform is having trouble right now. The run was not started, so nothing was charged.",
            res.status,
          );
        }
        throw new PlatformError(
          "request",
          raw?.error || "The platform could not start this generation.",
          res.status,
        );
      }
      if (!raw?.request_id) {
        console.error("platform submit missing request_id", JSON.stringify({ model }));
        throw new PlatformError(
          "gateway",
          "The platform accepted the request but returned no run id.",
          502,
        );
      }
      return {
        request_id: raw.request_id,
        status_url: raw.status_url ?? null,
        cancel_url: raw.cancel_url ?? null,
      };
    },

    /**
     * fal.ai scopes a run under its model path and serves the finished payload
     * from a second endpoint; the queue platform answers both from one. The
     * model path is required for fal and ignored elsewhere.
     */
    async status(requestId: string, modelPath?: string): Promise<PlatformStatus> {
      const id = encodeURIComponent(requestId);
      let statusUrl = `${base}/requests/${id}/status`;
      if (flavor === "fal") {
        if (!modelPath) return { state: "processing", queue_position: null };
        assertModel(modelPath);
        statusUrl = `${base}/${modelPath}/requests/${id}/status`;
      }

      const res = await fetch(statusUrl, { headers });
      const raw = (await res.json().catch(() => null)) as RawStatus | null;

      if (!res.ok) {
        if (res.status >= 500 || res.status === 429)
          return { state: "processing", queue_position: null };
        return { state: "failed", reason: reason(raw ?? {}) };
      }

      const state = (raw?.status ?? "").toLowerCase();
      if (state === "completed" || state === "succeeded") {
        if (flavor === "fal" && modelPath) {
          /* fal keeps the finished media behind the result endpoint. */
          const done = await fetch(`${base}/${modelPath}/requests/${id}`, { headers });
          const body = (await done.json().catch(() => null)) as RawStatus | null;
          if (!done.ok) return { state: "failed", reason: reason(body ?? {}) };
          return {
            state: "completed",
            images: (body?.images ?? []).map((i) => i.url).filter((u): u is string => Boolean(u)),
            video: body?.video?.url ?? null,
          };
        }
        return {
          state: "completed",
          images: (raw?.images ?? []).map((i) => i.url).filter((u): u is string => Boolean(u)),
          video: raw?.video?.url ?? null,
        };
      }
      if (state === "failed" || state === "error" || state === "nsfw" || state === "cancelled") {
        return { state: "failed", reason: reason(raw ?? {}) };
      }
      return {
        state: state === "in_queue" || state === "queued" ? "queued" : "processing",
        queue_position: raw?.queue_position ?? null,
      };
    },
  };
}

export type PlatformClient = ReturnType<typeof createPlatformClient>;

/**
 * Which account a given model runs on, resolved at call time. The creator's own
 * pasted key always wins; fal.ai additionally falls back to the house key, so
 * the fal models stay pressable without the creator configuring anything.
 */
export function credentialsFor(
  entry: ModelEntry,
  creatorKey: string | null,
): { apiKey: string; baseUrl: string; flavor: PlatformFlavor } {
  const flavor = platformOf(entry);
  const baseUrl = baseUrlFor(flavor);
  if (!baseUrl) {
    throw new PlatformError(
      "key",
      `${entry.label} runs on a platform that has no address configured yet, so it cannot be reached. Pick a fal.ai model, or have the platform address configured.`,
    );
  }
  const apiKey = creatorKey ?? (flavor === "fal" ? houseFalKey() : null);
  if (!apiKey) {
    throw new PlatformError("key", "Add your platform API key to generate with this engine.");
  }
  return { apiKey, baseUrl, flavor };
}
