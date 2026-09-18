import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Staging verification only — deterministic, credit-free tests over the pure
 * layers of the product (twist search, Scene Truth, Generation Recovery) plus
 * source-level spoiler/privacy regression checks. It never boots the app,
 * never calls a model provider and never touches production data.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
