import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * The creator's own platform key (STRONG engine). The cookie handling itself
 * lives in platform-key.server.ts and is loaded inside the handlers, so this
 * client-reachable module never pulls server-only code into the browser bundle.
 */

const KeyInput = z.object({
  api_key: z
    .string()
    .trim()
    .regex(/^[^:\s]+:[^:\s]+$/, "API key must be id:secret"),
});

export const savePlatformKey = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => KeyInput.parse(input))
  .handler(async ({ data }) => {
    const { setKeyCookie } = await import("./platform-key.server");
    setKeyCookie(data.api_key);
    return { held: true as const };
  });

export const removePlatformKey = createServerFn({ method: "POST" }).handler(async () => {
  const { clearKeyCookie } = await import("./platform-key.server");
  clearKeyCookie();
  return { held: false as const };
});

/**
 * Whether a key is held, and which generation accounts can actually be reached
 * right now. The key value itself never crosses the boundary.
 */
export const platformKeyStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { platformKeyFromRequest } = await import("./platform-key.server");
  const { availablePlatforms } = await import("@/generation/platform-config.server");
  const key = platformKeyFromRequest();
  return { held: Boolean(key), platforms: availablePlatforms(key) };
});
