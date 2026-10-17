import { describe, expect, it, vi } from "vitest";
import { ownerTickIfAllowed, type TickDeps } from "@/lib/film-tick-poll.server";

const deps = (over: Partial<TickDeps> = {}) => {
  const tick = vi.fn(async () => ({}));
  return {
    tick,
    d: {
      userFromToken: async (t: string) =>
        t === "owner-token" ? "u1" : t === "other" ? "u2" : null,
      ownerOf: async () => "u1",
      tick,
      ...over,
    } as TickDeps,
  };
};

describe("getFilm-driven tick (Path A)", () => {
  it("anonymous poll does not advance jobs", async () => {
    const { d, tick } = deps();
    expect(await ownerTickIfAllowed("f", "", d)).toBe(false);
    expect(tick).not.toHaveBeenCalled();
  });
  it("publishable key is not a user", async () => {
    const { d, tick } = deps();
    expect(await ownerTickIfAllowed("f", "Bearer sb_publishable_x", d)).toBe(false);
    expect(tick).not.toHaveBeenCalled();
  });
  it("non-owner poll does not advance jobs", async () => {
    const { d, tick } = deps();
    expect(await ownerTickIfAllowed("f", "Bearer other", d)).toBe(false);
    expect(tick).not.toHaveBeenCalled();
  });
  it("legacy film without owner is never ticked", async () => {
    const { d, tick } = deps({ ownerOf: async () => null });
    expect(await ownerTickIfAllowed("f", "Bearer owner-token", d)).toBe(false);
    expect(tick).not.toHaveBeenCalled();
  });
  it("owner poll ticks that film only", async () => {
    const { d, tick } = deps();
    expect(await ownerTickIfAllowed("film-9", "Bearer owner-token", d)).toBe(true);
    expect(tick).toHaveBeenCalledWith("film-9");
  });
  it("tick failure never throws to getFilm", async () => {
    const { d } = deps({
      tick: async () => {
        throw new Error("boom");
      },
    });
    await expect(ownerTickIfAllowed("f", "Bearer owner-token", d)).resolves.toBe(true);
  });
});
