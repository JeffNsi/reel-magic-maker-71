import { describe, expect, it } from "vitest";
import { budgetView } from "@/lib/fal-prices";

describe("budgetView", () => {
  it("estimates per run and spent", () => {
    const v = budgetView(0.1, 5, 10, null);
    expect(v.perRun).toBeCloseTo(0.5);
    expect(v.spent).toBeCloseTo(1);
    expect(v.over).toBe(false);
  });
  it("warns when next press exceeds budget", () => {
    expect(budgetView(0.1, 5, 10, 1.2).over).toBe(true);
    expect(budgetView(0.1, 5, 10, 1.5).over).toBe(false);
  });
  it("never warns without a known rate", () => {
    expect(budgetView(null, 5, 10, 0).over).toBe(false);
  });
});
