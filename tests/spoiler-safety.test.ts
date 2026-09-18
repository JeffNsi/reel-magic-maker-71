import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Spoiler and privacy regression guard.
 *
 * A buyer-facing payload may carry the clip and what it costs. It may never
 * carry the hidden turn of the story, internal validation reasoning, provider
 * job identifiers or billing internals.
 */

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const FORBIDDEN_IN_BUYER_PAYLOAD = [
  "truth",
  "twist",
  "reveal",
  "foreshadowing",
  "blueprint",
  "fal_request_id",
  "director_session_id",
  "generation_id",
  "coins_spent",
  "rejections",
  "fidelity",
];

/** The literal properties of the buyer-facing delivery payload. */
function deliveryFields(source: string): string[] {
  const block = source.match(/export type ClipDelivery = \{([\s\S]*?)\n\};/);
  expect(block, "ClipDelivery type not found").toBeTruthy();
  return Array.from(block![1].matchAll(/^ {2}([a-z_]+)\??:/gm)).map((m) => m[1]);
}

describe("spoiler security", () => {
  const clipShop = read("src/lib/clip-shop.functions.ts");

  it("delivers only clip, title and payment facts to a buyer", () => {
    const fields = deliveryFields(clipShop);
    expect(fields).toEqual([
      "purchase_id",
      "status",
      "video_url",
      "scene_title",
      "film_title",
      "amount",
      "currency",
    ]);
    for (const forbidden of FORBIDDEN_IN_BUYER_PAYLOAD) {
      expect(fields).not.toContain(forbidden);
    }
  });

  it("only signs a playable clip once the payment is confirmed", () => {
    expect(clipShop).toMatch(/status === "paid"|paid[\s\S]{0,200}signedUrl/);
    expect(clipShop).toContain("delivery_token");
  });

  it("keeps internal recovery reasoning out of the film payload", () => {
    const film = read("src/lib/film.functions.ts");
    const block = film.match(/recovery: \{([\s\S]*?)\n {2}\} \| null;/);
    expect(block).toBeTruthy();
    const fields = block![1];
    expect(fields).toContain("outcome");
    expect(fields).not.toContain("rejections");
    expect(fields).not.toContain("candidates");
    expect(fields).not.toContain("provider_message");
    expect(fields).not.toContain("fidelity");
  });

  it("never exposes a service key or provider secret to the browser", () => {
    for (const path of [
      "src/lib/clip-shop.functions.ts",
      "src/lib/film.functions.ts",
      "src/lib/recovery.functions.ts",
    ]) {
      const source = read(path);
      expect(source).not.toMatch(/VITE_SUPABASE_SERVICE|SERVICE_ROLE_KEY/);
      expect(source).not.toMatch(/import\.meta\.env\.[A-Z_]*(SECRET|KEY)/);
    }
  });
});
