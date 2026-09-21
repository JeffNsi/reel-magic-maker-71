import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";

/**
 * Server-only handling of the creator's platform key. It lives in an httpOnly
 * cookie: never in the browser's storage, never in our database, never returned
 * to the client. Kept in its own .server module so no client bundle can reach it.
 */

const COOKIE = "storyreel_platform_key";
const MAX_AGE = 60 * 60 * 24 * 30;

export function platformKeyFromRequest(): string | null {
  const header = getRequestHeader("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function setKeyCookie(value: string) {
  setResponseHeader(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
  );
}

export function clearKeyCookie() {
  setResponseHeader("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
}
