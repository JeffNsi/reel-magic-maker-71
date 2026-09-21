import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * The creator's own platform key (STRONG engine). Held in an httpOnly cookie —
 * never in localStorage, never in our database, never returned to the browser.
 */

const COOKIE = "storyreel_platform_key";
const MAX_AGE = 60 * 60 * 24 * 30;

const KeyInput = z.object({
  api_key: z
    .string()
    .trim()
    .regex(/^[^:\s]+:[^:\s]+$/, "API key must be id:secret"),
});

function readCookie(name: string): string | null {
  const header = getRequestHeader("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** Server-only: the key for the current request, or null. */
export function platformKeyFromRequest(): string | null {
  return readCookie(COOKIE);
}

export const savePlatformKey = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => KeyInput.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader(
      "Set-Cookie",
      `${COOKIE}=${encodeURIComponent(data.api_key)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
    );
    return { held: true as const };
  });

export const removePlatformKey = createServerFn({ method: "POST" }).handler(async () => {
  setResponseHeader("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  return { held: false as const };
});

/** Only whether a key is held — the value itself never crosses the boundary. */
export const platformKeyStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { held: Boolean(readCookie(COOKIE)) };
});
