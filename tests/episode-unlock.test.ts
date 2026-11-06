import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  interpretUnlock,
  UNLOCK_MESSAGES,
  unlockWith,
  type UnlockPort,
} from "@/lib/episode-unlock";

const USER = "11111111-1111-4111-8111-111111111111";
const EPISODE = "22222222-2222-4222-8222-222222222222";

describe("interpretUnlock (database status → app result)", () => {
  it("returns the balances after a new unlock", () => {
    expect(
      interpretUnlock({
        status: "unlocked",
        method: "coins",
        charged_bonus: 15,
        charged_paid: 5,
        paid_coins: 95,
        bonus_coins: 0,
      }),
    ).toEqual({ unlocked: true, paid_coins: 95, bonus_coins: 0 });
  });

  it("treats a repeated request as unlocked without a charge and returns real balances", () => {
    expect(
      interpretUnlock({
        status: "already_unlocked",
        charged_bonus: 0,
        charged_paid: 0,
        paid_coins: 40,
        bonus_coins: 7,
      }),
    ).toEqual({ unlocked: true, paid_coins: 40, bonus_coins: 7 });
  });

  it("keeps the exact message the Vibe player uses to open the coin shop", () => {
    expect(() => interpretUnlock({ status: "not_enough_coins", cost: 20 })).toThrow(
      "Not enough coins",
    );
    expect(UNLOCK_MESSAGES.not_enough_coins).toBe(
      "Not enough coins. Earn more or buy a coin pack.",
    );
  });

  it.each([
    ["vip_only", UNLOCK_MESSAGES.vip_only],
    ["episode_not_found", UNLOCK_MESSAGES.episode_not_found],
    ["episode_unavailable", UNLOCK_MESSAGES.episode_unavailable],
    ["profile_not_found", UNLOCK_MESSAGES.profile_not_found],
  ])("refuses %s with its own message", (status, message) => {
    expect(() => interpretUnlock({ status })).toThrow(message);
  });

  it.each([
    [null],
    [undefined],
    ["unlocked"],
    [{}],
    [{ status: "invalid" }],
    [{ status: "something_new" }],
    [{ status: "unlocked" }],
    [{ status: "unlocked", paid_coins: "10", bonus_coins: 0 }],
    [{ status: "unlocked", paid_coins: 1.5, bonus_coins: 0 }],
  ])("never reports success for a malformed result: %j", (raw) => {
    expect(() => interpretUnlock(raw)).toThrow(UNLOCK_MESSAGES.failed);
  });
});

describe("unlockWith (one database call per request)", () => {
  it("passes the signed-in user and episode straight to the database", async () => {
    const port = vi.fn<UnlockPort>(async () => ({
      data: { status: "unlocked", paid_coins: 0, bonus_coins: 190 },
      error: null,
    }));
    await expect(unlockWith(port, USER, EPISODE)).resolves.toEqual({
      unlocked: true,
      paid_coins: 0,
      bonus_coins: 190,
    });
    expect(port).toHaveBeenCalledTimes(1);
    expect(port).toHaveBeenCalledWith(USER, EPISODE);
  });

  it("turns a database error into a plain failure without leaking details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const port: UnlockPort = async () => ({
      data: null,
      error: { code: "42501", message: "permission denied for function unlock_episode" },
    });
    await expect(unlockWith(port, USER, EPISODE)).rejects.toThrow(UNLOCK_MESSAGES.failed);
    expect(log).toHaveBeenCalledWith("unlock_episode failed", { episode: EPISODE, code: "42501" });
    log.mockRestore();
  });

  it("does not report success when the database answered with an error and data", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const port: UnlockPort = async () => ({
      data: { status: "unlocked", paid_coins: 1, bonus_coins: 1 },
      error: { code: "XX000" },
    });
    await expect(unlockWith(port, USER, EPISODE)).rejects.toThrow(UNLOCK_MESSAGES.failed);
    vi.restoreAllMocks();
  });
});

describe("unlockEpisode server function (source checks)", () => {
  const src = readFileSync("src/lib/vibe.functions.ts", "utf8");
  const start = src.indexOf("export const unlockEpisode");
  const body = src.slice(start, src.indexOf("});", start));

  it("unlocks only through the atomic database function", () => {
    expect(body.replace(/\s+/g, " ")).toContain(
      'rpc("unlock_episode", { _user: user, _episode: episode })',
    );
    expect(body).toContain("context.userId");
  });

  it("no longer writes unlocks or balances itself", () => {
    expect(body).not.toContain('.from("user_unlocked_episodes")');
    expect(body).not.toContain(".insert(");
    expect(body).not.toContain(".update(");
    expect(body).not.toContain("adminProfiles");
  });
});

describe("migrations 0011/0012 (source checks; executed in db-verify/access)", () => {
  const m11 = readFileSync("drizzle/migrations/0011_server_only_balances_and_unlocks.sql", "utf8");
  const m12 = readFileSync("drizzle/migrations/0012_server_only_unlock_inserts.sql", "utf8");
  const journal = JSON.parse(readFileSync("drizzle/migrations/meta/_journal.json", "utf8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };

  it("removes table-level writes on profiles from browser roles", () => {
    expect(m11).toContain(
      "REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;",
    );
    expect(m11).toContain(
      'DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;',
    );
  });

  it("guards balances and VIP status for browser roles even if a privilege returns", () => {
    expect(m11).toContain("current_user NOT IN ('anon', 'authenticated')");
    expect(m11).toContain("BEFORE INSERT OR UPDATE ON public.profiles");
    for (const col of ["paid_coins", "bonus_coins", "is_vip", "vip_until"]) {
      expect(m11).toContain(`NEW.${col} IS DISTINCT FROM OLD.${col}`);
    }
  });

  it("keeps unlock_episode server-only, locked to the buyer row and with a fixed search path", () => {
    expect(m11).toContain("SECURITY DEFINER\nSET search_path = ''");
    expect(m11).toContain("FOR UPDATE;");
    expect(m11).toContain(
      "REVOKE ALL ON FUNCTION public.unlock_episode(uuid, uuid) FROM PUBLIC, anon, authenticated;",
    );
    expect(m11).toContain(
      "GRANT EXECUTE ON FUNCTION public.unlock_episode(uuid, uuid) TO service_role;",
    );
  });

  it("only adds columns with defaults, so existing unlocks are kept", () => {
    expect(m11).toContain("ADD COLUMN IF NOT EXISTS charged_bonus integer NOT NULL DEFAULT 0");
    expect(m11).toContain("ADD COLUMN IF NOT EXISTS charged_paid integer NOT NULL DEFAULT 0");
    expect(m11).toContain("ADD COLUMN IF NOT EXISTS unlock_method text");
    expect(m11).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(m11).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\s+public\./i);
  });

  it("does not touch unlock inserts in part 1, so it is safe before the code is deployed", () => {
    expect(m11).not.toMatch(/ON public\.user_unlocked_episodes FROM/);
    expect(m11).not.toContain("Users create own unlocks");
  });

  it("part 2 removes browser writes to unlocks but keeps reading own unlocks", () => {
    expect(m12).toContain(
      "REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_unlocked_episodes FROM anon, authenticated;",
    );
    expect(m12).toContain('DROP POLICY IF EXISTS "Users create own unlocks"');
    expect(m12).not.toContain("SELECT");
    expect(m12).not.toContain("Users read own unlocks");
  });

  it("appends both migrations after 0008 in order", () => {
    const tags = journal.entries.map((e) => e.tag);
    expect(tags.slice(-3)).toEqual([
      "0008_generation_provider_check_throttle",
      "0011_server_only_balances_and_unlocks",
      "0012_server_only_unlock_inserts",
    ]);
    const whens = journal.entries.map((e) => e.when);
    expect([...whens].sort((a, b) => a - b)).toEqual(whens);
  });

  it("chains the snapshots 0008 → 0011 → 0012", () => {
    const snap = (n: string) =>
      JSON.parse(readFileSync(`drizzle/migrations/meta/${n}_snapshot.json`, "utf8")) as {
        id: string;
        prevId: string;
      };
    expect(snap("0011").prevId).toBe(snap("0008").id);
    expect(snap("0012").prevId).toBe(snap("0011").id);
  });
});
