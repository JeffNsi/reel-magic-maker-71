import { beforeEach, describe, expect, it, vi } from "vitest";

/** Stored owner per film, read by assertFilmOwner through the (mocked) admin client. */
const owners = new Map<string, string | null>();
const updates: unknown[] = [];

vi.mock("@/integrations/supabase/client.server", () => {
  const query = () => {
    let id = "";
    const q = {
      select: () => q,
      eq: (col: string, v: string) => {
        if (col === "id") id = v;
        return q;
      },
      is: () => q,
      update: (v: unknown) => {
        updates.push(v);
        return q;
      },
      maybeSingle: async () => ({
        data: owners.has(id) ? { id, user_id: owners.get(id) } : null,
      }),
    };
    return q;
  };
  return { supabaseAdmin: { from: () => query() } };
});

const { assertFilmOwner } = await import("@/lib/film.functions");

const FILM = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";

describe("film ownership (core path, no middleware)", () => {
  beforeEach(() => {
    owners.clear();
    updates.length = 0;
  });

  it("lets the stored owner through", async () => {
    owners.set(FILM, "owner");
    await expect(assertFilmOwner(FILM, SESSION, "owner")).resolves.toBeUndefined();
  });

  it("denies a stranger", async () => {
    owners.set(FILM, "owner");
    await expect(assertFilmOwner(FILM, SESSION, "stranger")).rejects.toThrow(/another account/);
  });

  it("keeps an owner-less legacy film read-only and never claims it", async () => {
    owners.set(FILM, null);
    await expect(assertFilmOwner(FILM, SESSION, "anyone")).rejects.toThrow(/older film/);
    expect(updates).toHaveLength(0);
  });

  it("missing film is reported, not thrown as a crash", async () => {
    await expect(assertFilmOwner(FILM, SESSION, "owner")).rejects.toThrow(/could not be found/);
  });
});
