import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EZY_SCENE_COST, FILM_COST, SINGLE_SHORT_COST, sceneCostFor } from "@/lib/pricing";

describe("one price (behavioral + source)", () => {
  it("14 per EZY scene, 70 per five-scene film", () => {
    expect(EZY_SCENE_COST).toBe(14);
    expect(FILM_COST).toBe(70);
    expect(SINGLE_SHORT_COST).toBe(70);
    expect(sceneCostFor("lovable")).toBe(14);
    expect(sceneCostFor("fal")).toBe(0);
    expect(sceneCostFor("live")).toBe(0);
  });

  it("source: displayed costs read the constant that is charged", () => {
    const film = readFileSync("src/lib/film.functions.ts", "utf8");
    expect(film).toContain("export const SHOT_COST = EZY_SCENE_COST;");
    expect(film).toContain("sceneCostFor(data.engine)");
    expect(film).not.toMatch(/SHOT_COST \* 2/);
    const plane = readFileSync("src/lib/scene-plane.functions.ts", "utf8");
    expect(plane).toContain("ezy_credits: SHOT_COST");
    const shorts = readFileSync("src/lib/storyreel.functions.ts", "utf8");
    expect(shorts).toContain("export const COIN_COST = SINGLE_SHORT_COST;");
    expect(shorts).toContain("dbCoins.spend(context.userId, COIN_COST)");
    expect(shorts).not.toContain("const charge = async (sign");
  });
});
