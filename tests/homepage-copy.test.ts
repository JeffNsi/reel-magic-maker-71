import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { FILM_PRICE_COPY, showcaseTitle } from "../src/components/landing/copy";

describe("homepage presentation", () => {
  it("uses the existing film and clip prices in one consistent sentence", () => {
    expect(FILM_PRICE_COPY).toBe(
      "One film costs 70 credits. A finished clip can also be purchased separately for 29 kr.",
    );
  });

  it("gives showcase subjects short editorial titles instead of prompt fragments", () => {
    expect(
      showcaseTitle("The Detective leans over the brushed steel surface", "Cinematic", 0),
    ).toBe("The Quiet Investigation");
    expect(showcaseTitle("Elin emerges from the granite archway", "Cinematic", 1)).toBe(
      "Through the Archway",
    );
    expect(showcaseTitle("A rooftop terrace with Julian", "Cinematic", 2)).toBe(
      "The Hidden Transfer",
    );
    expect(showcaseTitle("Husband looks across the kitchen table", "Cinematic", 3)).toBe(
      "A Familiar Stranger",
    );
    expect(showcaseTitle("Astrid steps through the arch exit", "Cinematic", 5)).toBe(
      "Another Time Awaits",
    );
    const title = showcaseTitle("Vertical slow push-in medium close-up", "Cinematic", 0);
    expect(title.split(" ").length).toBeGreaterThanOrEqual(2);
    expect(title.split(" ").length).toBeLessThanOrEqual(4);
    expect(title).not.toContain("Vertical");
  });

  it("keeps the beginner engine selected and shares pricing across the four placements", () => {
    const home = readFileSync("src/routes/index.tsx", "utf8");
    const story = readFileSync("src/components/landing/director-story.tsx", "utf8");
    const sections = readFileSync("src/components/landing/sections.tsx", "utf8");
    expect(home).toContain('useState<Engine>("lovable")');
    expect(home).toContain("{FILM_PRICE_COPY}");
    expect(story).toContain("body: FILM_PRICE_COPY");
    expect(sections).toContain("{FILM_PRICE_COPY}");
    expect(sections).toContain("${FILM_PRICE_COPY}");
    expect(story).toContain("Create a free account to save your films and sessions.");
    expect(sections).not.toContain("Unlimited renders");
  });
});
