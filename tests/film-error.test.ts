import { describe, expect, it } from "vitest";
import { FILM_SCENE_FAILED_ERROR, nextFilmError } from "@/lib/film-error";

describe("film-level error_message", () => {
  it("terminal failure sets the scene-failed text when no error exists", () => {
    expect(nextFilmError("failed", null)).toBe(FILM_SCENE_FAILED_ERROR);
  });
  it("an earlier real error is never overwritten", () => {
    expect(nextFilmError("failed", "submit error")).toBe("submit error");
    expect(nextFilmError("generating", "submit error")).toBe("submit error");
  });
  it("generating with no error invents none", () => {
    expect(nextFilmError("generating", null)).toBeNull();
    expect(nextFilmError("ready", null)).toBeNull();
  });
});

import { VideoProviderError, filmSubmitErrorFor, shouldFallBackToFal } from "@/lib/film-error";
import { aiVideoError, falSubmitError } from "@/lib/storyreel-core.server";

describe("scene submit error text", () => {
  it("empty house balance names the scene", () => {
    expect(filmSubmitErrorFor(5, aiVideoError(402, "Not enough credits"))).toContain(
      "Scene 05 could not start: the house video balance is empty. No credits were used.",
    );
    expect(filmSubmitErrorFor(5, new VideoProviderError("x", "provider_unavailable"))).toContain(
      "Scen 05 kunde inte starta: husets videosaldo är slut.",
    );
  });
  it("policy, busy and credentials map to their own text", () => {
    expect(filmSubmitErrorFor(5, aiVideoError(400, "Blocked by Responsible AI"))).toContain(
      "refused this scene's content",
    );
    expect(filmSubmitErrorFor(3, falSubmitError(429, ""))).toContain(
      "Scene 03 could not start: the video service is busy",
    );
    expect(filmSubmitErrorFor(3, falSubmitError(401, ""))).toContain("rejected the house key");
  });
  it("unknown errors keep the generic text with the scene number, no raw detail", () => {
    const text = filmSubmitErrorFor(2, new Error('{"status":500}'));
    expect(text.startsWith("Scene 02:")).toBe(true);
    expect(text).not.toContain("500");
  });
});

describe("fal fallback decision", () => {
  it("only EZY out-of-credits falls back", () => {
    expect(shouldFallBackToFal("lovable", aiVideoError(402, ""))).toBe(true);
    expect(shouldFallBackToFal("lovable", aiVideoError(429, ""))).toBe(false);
    expect(shouldFallBackToFal("fal", falSubmitError(400, "balance locked"))).toBe(false);
    expect(shouldFallBackToFal("lovable", new Error("Not enough credits"))).toBe(false);
  });
});
