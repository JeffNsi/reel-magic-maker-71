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
