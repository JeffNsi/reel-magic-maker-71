import { describe, expect, it } from "vitest";
import {
  DAILY_FILM_LIMIT,
  filmStatusFrom,
  ownershipDecision,
  shouldReleaseSlot,
} from "@/lib/film-quota";

/** Mirror of claim_film_slot: INSERT … ON CONFLICT … WHERE count < 3. */
function makeQuota() {
  const rows = new Map<string, number>();
  return {
    claim(user: string, day: string) {
      const k = `${user}:${day}`;
      const c = rows.get(k) ?? 0;
      if (c >= DAILY_FILM_LIMIT) return false;
      rows.set(k, c + 1);
      return true;
    },
    release(user: string, day: string) {
      const k = `${user}:${day}`;
      rows.set(k, Math.max((rows.get(k) ?? 0) - 1, 0));
    },
  };
}

describe("daily film limit", () => {
  it("denies the fourth film on the same day", () => {
    const q = makeQuota();
    expect([1, 2, 3, 4].map(() => q.claim("u", "d1"))).toEqual([true, true, true, false]);
    expect(q.claim("u", "d2")).toBe(true);
    expect(q.claim("other", "d1")).toBe(true);
  });

  it("a failed creation gives the slot back", () => {
    const q = makeQuota();
    q.claim("u", "d");
    q.claim("u", "d");
    q.claim("u", "d");
    if (shouldReleaseSlot(new Error("gateway down"))) q.release("u", "d");
    expect(q.claim("u", "d")).toBe(true);
  });

  it("no error means nothing is released", () => {
    expect(shouldReleaseSlot(null)).toBe(false);
  });
});

describe("ownership", () => {
  it("owner allowed, stranger denied, legacy owner-less film denied", () => {
    expect(ownershipDecision("a", "a")).toBe("allow");
    expect(ownershipDecision("a", "b")).toBe("deny");
    expect(ownershipDecision(null, "b")).toBe("deny");
    expect(ownershipDecision("", "")).toBe("deny");
  });
});

describe("film status backfill mapping", () => {
  it("maps scene statuses", () => {
    expect(filmStatusFrom([])).toBe("queued");
    expect(filmStatusFrom(["completed", "completed"])).toBe("ready");
    expect(filmStatusFrom(["completed", "failed"])).toBe("failed");
    expect(filmStatusFrom(["completed", "processing"])).toBe("generating");
    expect(filmStatusFrom(["completed", null])).toBe("queued");
  });
});
