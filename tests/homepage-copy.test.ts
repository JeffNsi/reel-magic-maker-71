import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CREATOR_CREDITS_PER_MONTH,
  CREATOR_FILMS_PER_MONTH,
  CREATOR_PLAN_COPY,
  FILM_PRICE_COPY,
  showcaseLogline,
  showcaseTitle,
} from "../src/components/landing/copy";

/** Words that belong to a shot list, never to a logline about the story. */
const CAMERA_LANGUAGE = [
  "vertical",
  "camera",
  "close-up",
  "close up",
  "push-in",
  "tracking",
  "handheld",
  "macro",
  "tilt",
  "medium shot",
  "wide shot",
  "frame",
  "lens",
];

describe("homepage presentation", () => {
  it("uses the existing film and clip prices in one consistent sentence", () => {
    expect(FILM_PRICE_COPY).toBe(
      "One film costs 70 credits. A finished clip can also be purchased separately for 29 kr.",
    );
  });

  it("states the Creator allowance once, derived from the film price", () => {
    expect(CREATOR_CREDITS_PER_MONTH).toBe(500);
    expect(CREATOR_FILMS_PER_MONTH).toBe(7);
    expect(CREATOR_PLAN_COPY).toBe("500 credits / month (7 films)");
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

  it("writes loglines about the story, never about the shot", () => {
    expect(
      showcaseLogline(
        "The Detective leans over the brushed steel surface, staring at a photograph.",
        "Cinematic",
        0,
      ),
    ).toBe("A detective finds a face he was never supposed to see again.");
    expect(
      showcaseLogline("Elin emerges from the granite archway into mist.", "Cinematic", 1),
    ).toBe("Elin walks into a fog that belongs to another century.");
    expect(showcaseLogline("Julian holds a phone on the rooftop terrace.", "Cinematic", 2)).toBe(
      "One tap on a rooftop could make him a different man.",
    );
    expect(showcaseLogline("Husband looks across the sunlit kitchen table.", "Cinematic", 3)).toBe(
      "At breakfast, her husband smiles like a stranger she once loved.",
    );
    expect(
      showcaseLogline(
        "Astrid steps through the arch exit into a 1926 streetscape.",
        "Cinematic",
        4,
      ),
    ).toBe("Astrid follows a lantern into a street that no longer exists.");

    const raw = showcaseLogline(
      "Vertical slow push-in medium close-up of a face, handheld camera.",
      "Cinematic",
      0,
    );
    expect(raw).toBe("A single moment, and everything after it is different.");
  });

  it("keeps every logline short and free of camera language", () => {
    const ideas = [
      "The Detective leans over the brushed steel surface",
      "Elin emerges from the granite archway",
      "A rooftop terrace with Julian",
      "Husband looks across the kitchen table",
      "Astrid steps through the arch exit",
      "The Woman rounds a stone pillar on the train platform",
      "The Speaker holds a glowing smartphone under the table",
      "Tight portrait of Arthur looking across the table at Eleanor",
      "A fisherman hauls rope at dawn in a quiet harbour",
      "A vintage car crosses an empty desert highway",
      "An astronaut's visor reflects a red planet",
      "Nothing recognisable at all about this one",
    ];
    ideas.forEach((idea, i) => {
      const logline = showcaseLogline(idea, "Cinematic", i);
      expect(logline.split(" ").length).toBeLessThanOrEqual(12);
      for (const term of CAMERA_LANGUAGE) {
        expect(logline.toLowerCase()).not.toContain(term);
      }
    });
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
    expect(sections).toContain("features: [CREATOR_PLAN_COPY");
    expect(sections).not.toContain("Monthly credits included");
  });

  it("shows the logline on the card and the raw prompt only in the dialog", () => {
    const gallery = readFileSync("src/components/landing/gallery.tsx", "utf8");
    expect(gallery).toContain("{example.logline}");
    expect(gallery).toContain("logline: showcaseLogline(short.idea");
    expect(gallery).not.toContain("{example.prompt}");
    expect(gallery).toContain("Original prompt");
  });
});
