/**
 * Server-only client for the generation platform. The browser never calls this
 * and never sees a key. The Authorization header is never logged.
 */

const MODEL_ID = /^[a-z0-9][a-z0-9._/-]*$/i;

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

export function platformBaseUrl(): string {
  const url = process.env["HF_API_BASE_URL"];
  if (!url) throw new Error("The generation platform isn't configured yet.");
  return url.replace(/\/+$/, "");
}

function reason(raw: RawStatus): string {
  if (typeof raw.error === "string" && raw.error) return raw.error;
  if (raw.error && typeof raw.error === "object" && raw.error.message) return raw.error.message;
  if (typeof raw.detail === "string" && raw.detail) return raw.detail;
  return "The generation platform rejected this run without a reason.";
}

export function createPlatformClient(opts: { apiKey: string; baseUrl: string }) {
  const headers = {
    Authorization: `Key ${opts.apiKey}`,
    "Content-Type": "application/json",
  };
  const base = opts.baseUrl.replace(/\/+$/, "");

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
        console.error("platform submit failed", res.status, JSON.stringify({ model, error: raw?.error }));
        if (res.status === 401 || res.status === 403) {
          throw new Error("The platform rejected this API key. Check the key and try again.");
        }
        if (res.status === 429) throw new Error("The platform is rate limiting this account right now.");
        throw new Error(raw?.error || "The platform could not start this generation.");
      }
      if (!raw?.request_id) {
        console.error("platform submit missing request_id", JSON.stringify({ model }));
        const err = new Error("The platform accepted the request but returned no run id.");
        (err as Error & { status?: number }).status = 502;
        throw err;
      }
      return {
        request_id: raw.request_id,
        status_url: raw.status_url ?? null,
        cancel_url: raw.cancel_url ?? null,
      };
    },

    async status(requestId: string): Promise<PlatformStatus> {
      const res = await fetch(`${base}/requests/${encodeURIComponent(requestId)}/status`, { headers });
      const raw = (await res.json().catch(() => null)) as RawStatus | null;

      if (!res.ok) {
        if (res.status >= 500 || res.status === 429) return { state: "processing", queue_position: null };
        return { state: "failed", reason: reason(raw ?? {}) };
      }

      const state = (raw?.status ?? "").toLowerCase();
      if (state === "completed" || state === "succeeded") {
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
