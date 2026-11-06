import { describe, expect, it } from "vitest";
import { falScenePriceUsd } from "@/lib/fal-prices";

describe("fal fallback scene price", () => {
  it("five-second Kling 3.0 scene costs $0.42 at the list rate", () => {
    expect(falScenePriceUsd(5)).toBe(0.42);
  });
  it("unknown model has no price", () => {
    expect(falScenePriceUsd(5, "unknown/model")).toBeNull();
  });
});
