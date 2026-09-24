import { describe, expect, it } from "vitest";

import { buildTemplateChallenge } from "@/lib/director.functions";

describe("director challenge fallback", () => {
  it("keeps the approved blueprint usable when AI credits are unavailable", () => {
    const blueprint = "A woman sees her future self reflected in a train window.";
    const challenge = buildTemplateChallenge(
      blueprint,
      "This project is out of AI credits. Top them up to keep directing.",
    );

    expect(challenge.verdict).toBe("ready");
    expect(challenge.improved_blueprint).toBe(blueprint);
    expect(challenge.weakness).toBeNull();
    expect(challenge.generation_risk).toBeNull();
    expect(challenge.notice).toContain("out of AI credits");
  });
});
