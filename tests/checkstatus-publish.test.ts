import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shouldAutoPublish } from "@/lib/scene-job";

describe("scene clips are never auto-published", () => {
  it("behavioral: only stand-alone shorts publish", () => {
    expect(shouldAutoPublish({ story_id: "film", episode_id: null })).toBe(false);
    expect(shouldAutoPublish({ story_id: null, episode_id: null })).toBe(true);
    expect(shouldAutoPublish({ story_id: null, episode_id: "ep" })).toBe(false);
  });

  it("source: checkStatus gates the episode insert on shouldAutoPublish and reads story_id", () => {
    const src = readFileSync("src/lib/storyreel.functions.ts", "utf8");
    const fn = src.slice(src.indexOf("export const checkStatus"));
    expect(fn).toContain("episode_id, story_id");
    expect(fn.indexOf("shouldAutoPublish(row)")).toBeLessThan(fn.indexOf('.from("episodes")'));
  });

  it("source: the feed filters hidden episodes", () => {
    const src = readFileSync("src/lib/vibe.functions.ts", "utf8");
    expect(src).toContain('.eq("hidden", false)');
  });
});
