import { describe, expect, it } from "vitest";

import {
  MODELS,
  defaultSettings,
  getModel,
  modelsForPlatforms,
  modelsForSurface,
  platformOf,
  rolesSummary,
  supportsVertical,
} from "@/generation/catalog";
import { toPlatform } from "@/generation/to-platform";

describe("generation catalogue", () => {
  it("carries 8 image and 32 video models with unique ids", () => {
    expect(modelsForSurface("image")).toHaveLength(8);
    /* 30 on the queue platform plus the two fal.ai video models. */
    expect(modelsForSurface("video")).toHaveLength(32);
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
  });

  it("assigns every model to a real platform and filters by it", () => {
    for (const model of MODELS) {
      expect(["higgsfield", "fal"]).toContain(platformOf(model));
    }
    const fal = modelsForPlatforms(["fal"], "video");
    expect(fal.length).toBe(2);
    expect(fal.every((m) => platformOf(m) === "fal")).toBe(true);
    expect(modelsForPlatforms([], "video")).toHaveLength(0);
  });

  it("resolves a model by id", () => {
    expect(getModel("kling-3-std")?.label).toBe("Kling 3 Standard");
    expect(getModel("nope")).toBeUndefined();
  });

  it("declares defaults for every field", () => {
    for (const model of MODELS) {
      const defaults = defaultSettings(model);
      expect(Object.keys(defaults)).toEqual(Object.keys(model.settings));
    }
  });

  it("knows which models can do the house vertical format", () => {
    expect(supportsVertical(getModel("kling-3-std")!)).toBe(true);
  });
});

describe("plane to platform mapping", () => {
  const plane = {
    model: "kling-3-std",
    prompt: { text: "a lamp flickers in a dark hallway" },
    media: {},
    settings: { aspectRatio: "9:16", duration: 5, sound: false, cfgScale: 0.5, multiShots: false },
  };

  it("maps settings to platform field names", () => {
    const req = toPlatform(plane);
    expect(req.path).toBe("kling-3-std");
    expect(req.body).toMatchObject({
      aspect_ratio: "9:16",
      duration: 5,
      generate_audio: false,
      cfg_scale: 0.5,
    });
  });

  it("drops unknown settings instead of forwarding them", () => {
    const req = toPlatform({ ...plane, settings: { ...plane.settings, hackedField: "x" } });
    expect(Object.keys(req.body)).not.toContain("hackedField");
  });

  it("rejects a value outside the declared enum", () => {
    expect(() =>
      toPlatform({ ...plane, settings: { ...plane.settings, aspectRatio: "21:9" } }),
    ).toThrow(/does not accept/);
  });

  it("rejects a value outside the declared range", () => {
    expect(() => toPlatform({ ...plane, settings: { ...plane.settings, duration: 99 } })).toThrow(
      /between 3 and 15/,
    );
  });

  it("rejects a media role the model does not take", () => {
    expect(() =>
      toPlatform({ ...plane, media: { audio: [{ url: "https://x/a.mp3", kind: "audio" }] } }),
    ).toThrow(/does not take audio media/);
  });

  it("enforces the per-role cap", () => {
    expect(() =>
      toPlatform({
        ...plane,
        media: {
          start: [
            { url: "https://x/1.jpg", kind: "image" },
            { url: "https://x/2.jpg", kind: "image" },
          ],
        },
      }),
    ).toThrow(/at most 1 start/);
  });

  it("enforces the role's kind", () => {
    expect(() =>
      toPlatform({ ...plane, media: { start: [{ url: "https://x/1.mp4", kind: "video" }] } }),
    ).toThrow(/takes image files/);
  });

  it("picks the first-last path when both frames are present", () => {
    const req = toPlatform({
      ...plane,
      media: {
        start: [{ url: "https://x/1.jpg", kind: "image" }],
        end: [{ url: "https://x/2.jpg", kind: "image" }],
      },
    });
    expect(req.path).toBe("kling-3-std/first-last");
    expect(req.body["image_url"]).toBe("https://x/1.jpg");
    expect(req.body["end_image_url"]).toBe("https://x/2.jpg");
  });

  it("uses a model's own mapper when the shared shape cannot express it", () => {
    const req = toPlatform({
      model: "seedance-2.5-extend",
      prompt: { text: "keep walking" },
      media: { video: [{ url: "https://x/clip.mp4", kind: "video" }] },
      settings: { duration: 5, resolution: "1080p", sound: true },
    });
    expect(req.body).toMatchObject({ video_url: "https://x/clip.mp4", extend_duration: 5 });
  });

  it("is deterministic for identical input", () => {
    expect(JSON.stringify(toPlatform(plane))).toBe(JSON.stringify(toPlatform(plane)));
  });
});

describe("catalogue is complete enough to run", () => {
  it("gives every model at least one setting or an honest text-only note", () => {
    for (const model of MODELS) {
      const summary = rolesSummary(model);
      expect(summary.length).toBeGreaterThan(0);
      if (Object.keys(model.roles).length === 0) expect(summary).toContain("Text only");
      else expect(summary).toContain("Takes up to");
    }
  });

  it("submits every model's own defaults without a rejection", () => {
    for (const model of MODELS) {
      const media: Record<string, { url: string; kind: "image" | "video" | "audio" }[]> = {};
      for (const [role, cap] of Object.entries(model.roles)) {
        if (!cap) continue;
        const kind = role === "video" ? "video" : role === "audio" ? "audio" : "image";
        media[role] = Array.from({ length: cap }, (_, i) => ({
          url: `https://example.com/${role}-${i}.${kind === "image" ? "png" : "mp4"}`,
          kind: kind as "image" | "video" | "audio",
        }));
      }
      const resolved = toPlatform({
        model: model.id,
        prompt: { text: "a locked identity shot" },
        media,
        settings: defaultSettings(model),
      });
      expect(resolved.path.length).toBeGreaterThan(0);
      expect(resolved.body["prompt"] ?? resolved.body["video_url"]).toBeTruthy();
    }
  });

  it("refuses a role the model never declared", () => {
    const textOnly = MODELS.find((m) => Object.keys(m.roles).length === 0);
    expect(textOnly).toBeTruthy();
    expect(() =>
      toPlatform({
        model: textOnly!.id,
        prompt: { text: "x" },
        media: { reference: [{ url: "https://example.com/a.png", kind: "image" }] },
        settings: defaultSettings(textOnly!),
      }),
    ).toThrow();
  });
});
