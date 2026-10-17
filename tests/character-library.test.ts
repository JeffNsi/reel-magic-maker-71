import { describe, expect, it } from "vitest";
import {
  characterInput,
  MAX_CHARACTER_IMAGE_BYTES,
  validateCharacterImage,
} from "../src/lib/character-library";

describe("free character uploads", () => {
  it("accepts a real PNG signature without generating a portrait", () => {
    expect(() =>
      validateCharacterImage(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"),
    ).not.toThrow();
  });
  it("rejects disguised non-image content", () => {
    expect(() =>
      validateCharacterImage(new TextEncoder().encode("<script>bad</script>"), "image/png"),
    ).toThrow();
  });
  it("enforces the 6 MB limit", () => {
    expect(MAX_CHARACTER_IMAGE_BYTES).toBe(6291456);
    expect(() => validateCharacterImage(new Uint8Array(6291457), "image/png")).toThrow();
  });
  it("keeps supplied locked traits without inventing missing values", () => {
    const value = characterInput.parse({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Amara",
      description: "A filmmaker",
      traits: { face: "oval", hair: "black curls", skin: "", body: "", height: "", build: "" },
    });
    expect(value.traits.face).toBe("oval");
    expect(value.traits.skin).toBe("");
  });
});
