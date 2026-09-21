/**
 * The ONE place that decides where the generation platform lives and how we
 * authenticate against it. The provider is not settled yet, so nothing else in
 * the codebase may hardcode a base URL or an auth header.
 *
 * The shape here is the queue-style API:
 *   POST ${baseUrl}/${model}
 *   GET  ${baseUrl}/requests/{id}/status
 *   Authorization: Key <id:secret>
 *
 * This is NOT the Hugging Face router (https://router.huggingface.co/v1) —
 * that endpoint is OpenAI-compatible chat completions only and serves no video
 * generation. An HF-backed engine, if we ever add one, gets its own adapter;
 * it must never be wired in by swapping this base URL.
 */

export type PlatformConfig = {
  baseUrl: string;
  authHeader: (apiKey: string) => Record<string, string>;
};

/** Auth scheme for the queue API. Change it here, nowhere else. */
export function keyAuthHeader(apiKey: string): Record<string, string> {
  return { Authorization: `Key ${apiKey}` };
}

/** Server-only base URL. Read at call time, never at module scope. */
export function platformBaseUrl(): string {
  const url = process.env["HF_API_BASE_URL"];
  if (!url) throw new Error("The generation platform isn't configured yet.");
  return url.replace(/\/+$/, "");
}

export function platformConfig(): PlatformConfig {
  return { baseUrl: platformBaseUrl(), authHeader: keyAuthHeader };
}
