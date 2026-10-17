import { describe, expect, it } from "vitest";
import {
  approvedSceneTruth,
  filmEstimate,
  filmStartInput,
  templateScenes,
} from "../src/lib/film-start";
import type { LibraryCharacter } from "../src/lib/character-library";

const character: LibraryCharacter = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Amara",
  description: "A filmmaker",
  traits: { face: "oval", hair: "black curls", skin: "", body: "", height: "", build: "" },
  reference_path: null,
  reference_url: null,
};
const input = {
  session_id: character.id,
  key: character.id,
  character_id: character.id,
  title: "Homecoming",
  idea: "Returns home",
  setting: "Stockholm",
  genre: "Drama",
  style: "cinematic" as const,
  audience: "general" as const,
  length: 1 as const,
  approved: true as const,
  scenes: templateScenes(1, "Returns home", "Amara"),
};
describe("film start rules", () => {
  for (const [minutes, scenes, credits] of [
    [1, 5, 70],
    [3, 12, 168],
    [5, 20, 280],
    [10, 40, 560],
  ]) {
    it(`${minutes} min plans ${scenes} scenes and ${credits} EZY credits`, () => {
      expect(filmEstimate(minutes, "lovable")).toEqual({
        scenes,
        seconds: scenes * 5,
        perScene: 14,
        total: credits,
      });
      expect(templateScenes(minutes, "Story", "Amara")).toHaveLength(scenes);
    });
  }
  it("fal rendering uses zero app credits, not EZY credits", () => {
    expect(filmEstimate(1, "fal").total).toBe(0);
  });
  it("requires explicit character approval", () => {
    expect(filmStartInput.safeParse({ ...input, approved: false }).success).toBe(false);
  });
  it("requires exactly the selected number of scenes", () => {
    expect(filmStartInput.safeParse({ ...input, scenes: input.scenes.slice(0, 4) }).success).toBe(
      false,
    );
  });
  it("does not offer kids films without the safety gate", () => {
    expect(filmStartInput.safeParse({ ...input, audience: "kids" }).success).toBe(false);
  });
  it("stores approved scene decisions as creator truth without mutating the character", () => {
    const before = structuredClone(character);
    const scene = { title: "Arrival", idea: "Amara walks into the room", narration: "" };
    const truth = approvedSceneTruth(scene, input, character);
    expect(truth.action).toBe(scene.idea);
    expect(truth.provenance.action).toBe("user_decision");
    expect(truth.setting).toBe("Stockholm");
    expect(character).toEqual(before);
  });
});
