/**
 * The ONE place that decides where a generation platform lives and how we
 * authenticate against it. Two real platforms are supported, and a model says
 * which one it belongs to:
 *
 *   higgsfield  POST ${HF_API_BASE_URL}/${model}
 *               GET  ${HF_API_BASE_URL}/requests/{id}/status
 *   fal         POST https://queue.fal.run/${model}
 *               GET  https://queue.fal.run/${model}/requests/{id}/status
 *
 * Both use `Authorization: Key <id:secret>`. This is NOT the Hugging Face
 * router (OpenAI-compatible chat completions only, no video) — an HF-backed
 * engine would get its own adapter, never a swapped base URL.
 */

import type { PlatformFlavor } from "./catalog/types";

export type PlatformConfig = {
  baseUrl: string;
  authHeader: (apiKey: string) => Record<string, string>;
};

/** fal.ai's queue endpoint. Fixed by the provider, not configuration. */
export const FAL_QUEUE_BASE = "https://queue.fal.run";

/** Auth scheme for both queue APIs. Change it here, nowhere else. */
export function keyAuthHeader(apiKey: string): Record<string, string> {
  return { Authorization: `Key ${apiKey}` };
}

/** The queue platform's address, when it has been configured at all. */
export function higgsfieldBaseUrl(): string | null {
  const url = process.env["HF_API_BASE_URL"];
  return url ? url.replace(/\/+$/, "") : null;
}

/** The house fal.ai key, used when the creator has not pasted their own. */
export function houseFalKey(): string | null {
  return process.env["FAL_KEY"] ?? null;
}

/** Server-only base URL for the queue platform. Read at call time. */
export function platformBaseUrl(): string {
  const url = higgsfieldBaseUrl();
  if (!url) throw new Error("The generation platform isn't configured yet.");
  return url;
}

export function platformConfig(): PlatformConfig {
  return { baseUrl: platformBaseUrl(), authHeader: keyAuthHeader };
}

export function baseUrlFor(flavor: PlatformFlavor): string | null {
  return flavor === "fal" ? FAL_QUEUE_BASE : higgsfieldBaseUrl();
}

/**
 * Which platforms can be reached right now. `creatorKey` is the key the creator
 * pasted into this browser; fal also works from the house key, so the fal
 * models stay pressable without the creator configuring anything.
 */
export function availablePlatforms(creatorKey: string | null): PlatformFlavor[] {
  const out: PlatformFlavor[] = [];
  if (creatorKey || houseFalKey()) out.push("fal");
  if (higgsfieldBaseUrl() && creatorKey) out.push("higgsfield");
  return out;
}
