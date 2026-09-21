import { describe, expect, it } from "vitest";

import {
  MODELS,
  defaultSettings,
  getModel,
  modelsForSurface,
  supportsVertical,
} from "@/generation/catalog";
import { toPlatform } from "@/generation/to-platform";

describe("generation catalogue", () => {
  it("carries 8 image and 30 video models with unique ids", () => {
    expect(modelsForSurface("image")).toHaveLength(8);
    expect(modelsForSurface("video")).toHaveLength(30);
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
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
