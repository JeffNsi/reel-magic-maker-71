import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { readMigrationFiles } from "drizzle-orm/migrator";
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

describe("migrations and the post-deploy step (source checks; executed in db-verify/access)", () => {
  const m11 = readFileSync("drizzle/migrations/0011_server_only_balances_and_unlocks.sql", "utf8");
  const m12 = readFileSync("drizzle/migrations/0012_unlock_fixes_and_atomic_rewards.sql", "utf8");
  const lock = readFileSync("ops/post-deploy/server_only_unlock_inserts.sql", "utf8");
  const journal = JSON.parse(readFileSync("drizzle/migrations/meta/_journal.json", "utf8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };
  const snap = (n: string) =>
    JSON.parse(readFileSync(`drizzle/migrations/meta/${n}_snapshot.json`, "utf8")) as {
      id: string;
      prevId: string;
    };

  // PR #1 (Auto Engine) owns journal idx 9 and 10; its 0010 snapshot id and time:
  const PR1_0010_SNAPSHOT_ID = "95602718-eb4b-434a-b263-88c1a1175fb1";
  const PR1_0010_WHEN = 1793994488393;

  it("keeps 0011 byte-for-byte as applied to the live database", () => {
    expect(createHash("sha256").update(m11).digest("hex")).toBe(
      "d1b22bd7db32b60b77fc6107871829b9a89b08e98502c5f8faa571010415545b",
    );
  });

  it("removes table-level writes on profiles from browser roles", () => {
    expect(m11).toContain(
      "REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;",
    );
    expect(m11).toContain(
      'DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;',
    );
  });

  it("guards balances and VIP status for browser roles even if a privilege returns", () => {
    expect(m12).toContain("current_user NOT IN ('anon', 'authenticated')");
    expect(m11).toContain("BEFORE INSERT OR UPDATE ON public.profiles");
    for (const col of ["paid_coins", "bonus_coins", "is_vip", "vip_until"]) {
      expect(m12).toContain(`NEW.${col} IS DISTINCT FROM OLD.${col}`);
    }
  });

  it("0012 refuses every profile created by a browser role (bonus coins included)", () => {
    const guard = m12.slice(m12.indexOf("FUNCTION public.guard_profile_entitlements"));
    const from = guard.indexOf("IF TG_OP = 'INSERT' THEN");
    const insertBranch = guard.slice(from, guard.indexOf("END IF;", from));
    expect(insertBranch).toContain("RAISE EXCEPTION 'profiles are created by sign-up only'");
    expect(insertBranch).not.toContain("NEW.");
  });

  it("0012 checks VIP expiry with the wall clock after the lock", () => {
    const fn = m12.slice(m12.indexOf("FUNCTION public.unlock_episode"));
    expect(fn.indexOf("FOR UPDATE;")).toBeLessThan(fn.indexOf("checked_at := clock_timestamp();"));
    expect(fn).toContain("prof.vip_until > checked_at");
    expect(fn).not.toContain("> now()");
  });

  it("0012 refuses for lack of coins only for a positive coin price", () => {
    expect(m12).toContain(
      "IF method = 'coins' AND cost > 0 AND prof.bonus_coins + prof.paid_coins < cost THEN",
    );
  });

  it("keeps unlock_episode and claim_daily_checkin server-only with a fixed search path", () => {
    for (const fn of ["unlock_episode(uuid, uuid)", "claim_daily_checkin(uuid, integer[])"]) {
      expect(m12).toContain(
        `REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon, authenticated;`,
      );
      expect(m12).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role;`);
    }
    expect(m12.match(/SECURITY DEFINER\nSET search_path = ''/g)).toHaveLength(2);
  });

  it("only adds columns and tables, so existing rows are kept", () => {
    for (const sql of [m11, m12]) {
      expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
      expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\s+public\./i);
    }
    expect(m12).toContain("CREATE TABLE IF NOT EXISTS public.reward_events");
  });

  it("the unlock lock is a post-deploy step, not a migration any runner can apply", () => {
    expect(lock).toContain(
      "REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_unlocked_episodes FROM anon, authenticated;",
    );
    expect(lock).toContain('DROP POLICY IF EXISTS "Users create own unlocks"');
    expect(lock).not.toContain("Users read own unlocks");
    expect(readdirSync("drizzle/migrations").filter((f) => f.includes("unlock_inserts"))).toEqual(
      [],
    );
    expect(journal.entries.map((e) => e.tag).join(" ")).not.toContain("unlock_inserts");
    for (const migration of readMigrationFiles({ migrationsFolder: "drizzle/migrations" })) {
      const sql = migration.sql.join("");
      expect(sql).not.toMatch(/ON public\.user_unlocked_episodes FROM/);
      expect(sql).not.toMatch(/DROP POLICY[^;]*"Users create own unlocks"/);
    }
  });

  it("every journal entry resolves to a file, in idx and time order", () => {
    expect(readMigrationFiles({ migrationsFolder: "drizzle/migrations" })).toHaveLength(
      journal.entries.length,
    );
    const idx = journal.entries.map((e) => e.idx);
    const whens = journal.entries.map((e) => e.when);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(new Set(idx).size).toBe(idx.length);
    expect([...whens].sort((a, b) => a - b)).toEqual(whens);
  });

  it("leaves idx 9 and 10 to PR #1 and sorts after it in the combined history", () => {
    const at = (i: number) => journal.entries.find((e) => e.idx === i)?.tag;
    // Before PR #1 is merged idx 9-10 are free; after, they are PR #1's.
    expect([undefined, "0009_auto_engine_step1"]).toContain(at(9));
    expect([undefined, "0010_auto_engine_review_fixes"]).toContain(at(10));
    expect(journal.entries.slice(-2).map((e) => [e.idx, e.tag])).toEqual([
      [11, "0011_server_only_balances_and_unlocks"],
      [12, "0012_unlock_fixes_and_atomic_rewards"],
    ]);
    for (const e of journal.entries.slice(-2)) expect(e.when).toBeGreaterThan(PR1_0010_WHEN);
  });

  it("chains the snapshots after PR #1: 0010 → 0011 → 0012, with no fork at 0008", () => {
    expect(snap("0011").prevId).toBe(PR1_0010_SNAPSHOT_ID);
    expect(snap("0012").prevId).toBe(snap("0011").id);
    const prevIds = readdirSync("drizzle/migrations/meta")
      .filter((f) => f.endsWith("_snapshot.json"))
      .map((f) => snap(f.replace("_snapshot.json", "")).prevId);
    expect(new Set(prevIds).size).toBe(prevIds.length);
  });
});
