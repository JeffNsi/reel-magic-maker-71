// Regression tests for migration 0012 (fixes to 0011 and atomic rewards) and
// for the migration order an automatic runner would use. Each finding is shown
// failing on 0011 alone and fixed after 0012.
// Run: cd db-verify/access && npm ci && npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  asRole,
  asUser,
  balance,
  fresh,
  M0011,
  NORMAL,
  PAYING,
  read,
  TYPES,
  unlock,
  unlocks,
  VIP,
} from "./helpers.mjs";

const JOURNAL = JSON.parse(read("drizzle/migrations/meta/_journal.json"));
const LIVE_LAST_APPLIED = 1793991495080; // drizzle.__drizzle_migrations: 0008 is the latest row live

describe("Finding 1: browsers can never create a profile, so no self-granted bonus coins", () => {
  const reopenInsert = `
    GRANT INSERT ON public.profiles TO anon, authenticated;
    CREATE POLICY "test reopen insert" ON public.profiles FOR INSERT TO anon, authenticated WITH CHECK (true);
  `;
  const orphan = "00000000-0000-4000-8000-0000000000c1";

  /** An auth user whose profile row is missing: the only case a browser insert could matter. */
  async function withOrphan(db) {
    await db.exec(reopenInsert);
    await db.exec("ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created");
    await db.query("INSERT INTO auth.users (id, email) VALUES ($1, 'orphan@example.com')", [
      orphan,
    ]);
    await db.exec("ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created");
  }

  test("on 0011 alone, a restored INSERT lets a browser create a profile with extra bonus coins", async () => {
    const { db } = await fresh({ upTo: "0011" });
    await withOrphan(db);
    await asUser(db, orphan, () =>
      db.query("INSERT INTO public.profiles (id, bonus_coins) VALUES (auth.uid(), 999999)"),
    );
    assert.equal((await balance(db, orphan)).bonus_coins, 999999);
  });

  for (const [label, columns, values] of [
    ["extra bonus coins", "id, bonus_coins", "auth.uid(), 999999"],
    ["paid coins", "id, paid_coins", "auth.uid(), 5"],
    ["VIP status", "id, is_vip, vip_until", "auth.uid(), true, '2099-01-01'"],
    ["only the default balance", "id", "auth.uid()"],
  ]) {
    test(`after 0012, even with INSERT restored, a browser cannot create a profile with ${label}`, async () => {
      const { db } = await fresh({ upTo: "0012" });
      await withOrphan(db);
      await assert.rejects(
        asUser(db, orphan, () =>
          db.query(`INSERT INTO public.profiles (${columns}) VALUES (${values})`),
        ),
        /profiles are created by sign-up only/,
      );
      assert.equal(
        (await db.query("SELECT 1 FROM public.profiles WHERE id = $1", [orphan])).rows.length,
        0,
      );
    });
  }

  test("after 0012, an anonymous visitor cannot create a profile either", async () => {
    const { db } = await fresh({ upTo: "0012" });
    await withOrphan(db);
    await assert.rejects(
      asRole(db, "anon", () =>
        db.query("INSERT INTO public.profiles (id, bonus_coins) VALUES ($1, 999999)", [orphan]),
      ),
      /profiles are created by sign-up only/,
    );
  });

  test("sign-up still creates the profile with the default balance (210 bonus, 0 paid, no VIP)", async () => {
    const { db } = await fresh();
    const id = "00000000-0000-4000-8000-0000000000f2";
    await db.query("INSERT INTO auth.users (id, email) VALUES ($1, 'signup@example.com')", [id]);
    const p = await balance(db, id);
    assert.deepEqual(
      { paid: p.paid_coins, bonus: p.bonus_coins, vip: p.is_vip, until: p.vip_until },
      { paid: 0, bonus: 210, vip: false, until: null },
    );
  });

  test("trusted server code may still create a profile (support tooling)", async () => {
    const { db } = await fresh();
    await withOrphan(db);
    await asRole(db, "service_role", () =>
      db.query("INSERT INTO public.profiles (id, email) VALUES ($1, 'orphan@example.com')", [
        orphan,
      ]),
    );
    assert.equal((await balance(db, orphan)).bonus_coins, 210);
  });
});

describe("Finding 2: VIP expiry uses the wall clock after the profile lock", () => {
  /**
   * One transaction that starts while VIP is still valid and calls
   * unlock_episode after VIP has ended — the situation of a request that waited
   * for the profile lock across the expiry moment. now() stays at the
   * transaction start; the wall clock moves on.
   */
  async function unlockAcrossExpiry(db, episode) {
    await db.exec("BEGIN");
    try {
      await db.query(
        "UPDATE public.profiles SET is_vip = true, vip_until = now() + interval '300 milliseconds', bonus_coins = 0, paid_coins = 0 WHERE id = $1",
        [NORMAL],
      );
      await db.query("SELECT pg_sleep(0.6)");
      await db.exec("SET LOCAL ROLE service_role");
      const { rows } = await db.query("SELECT public.unlock_episode($1, $2) AS r", [
        NORMAL,
        episode,
      ]);
      await db.exec("COMMIT");
      return rows[0].r;
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }

  test("on 0011 alone, an expired VIP still unlocks a VIP-only episode for free", async () => {
    const { db, vipCoin } = await fresh({ upTo: "0011" });
    const r = await unlockAcrossExpiry(db, vipCoin);
    assert.deepEqual([r.status, r.method], ["unlocked", "vip"]);
  });

  test("after 0012, the same request is refused as VIP-only and nothing is unlocked", async () => {
    const { db, vipCoin } = await fresh({ upTo: "0012" });
    const r = await unlockAcrossExpiry(db, vipCoin);
    assert.equal(r.status, "vip_only");
    assert.equal((await unlocks(db, NORMAL)).length, 0);
  });

  test("after 0012, a coin episode across the expiry is charged as coins, not given as VIP", async () => {
    const { db, coin } = await fresh({ upTo: "0012" });
    const r = await unlockAcrossExpiry(db, coin);
    assert.equal(r.status, "not_enough_coins");
  });

  test("after 0012, a VIP that is still valid keeps unlocking without a charge", async () => {
    const { db, vipCoin } = await fresh();
    const r = await unlock(db, VIP, vipCoin);
    assert.deepEqual([r.status, r.method], ["unlocked", "vip"]);
  });
});

describe("Finding 3: a negative balance never blocks free or VIP access", () => {
  const goNegative = (db, id) =>
    db.query("UPDATE public.profiles SET bonus_coins = -5, paid_coins = 0 WHERE id = $1", [id]);

  test("on 0011 alone, a negative balance blocks a free episode", async () => {
    const { db, free } = await fresh({ upTo: "0011" });
    await goNegative(db, NORMAL);
    assert.equal((await unlock(db, NORMAL, free)).status, "not_enough_coins");
  });

  test("after 0012, a negative balance still unlocks a free episode, without a charge", async () => {
    const { db, free } = await fresh({ upTo: "0012" });
    await goNegative(db, NORMAL);
    const r = await unlock(db, NORMAL, free);
    assert.deepEqual(
      [r.status, r.method, r.charged_bonus, r.charged_paid],
      ["unlocked", "free", 0, 0],
    );
    assert.equal((await balance(db, NORMAL)).bonus_coins, -5);
  });

  test("after 0012, an active VIP with a negative balance still unlocks, without a charge", async () => {
    const { db, coin, vipCoin } = await fresh({ upTo: "0012" });
    await goNegative(db, VIP);
    assert.equal((await unlock(db, VIP, coin)).method, "vip");
    assert.equal((await unlock(db, VIP, vipCoin)).method, "vip");
    assert.equal((await balance(db, VIP)).bonus_coins, -5);
  });

  test("after 0012, a negative balance is still refused for a positive coin price", async () => {
    const { db, coin } = await fresh({ upTo: "0012" });
    await goNegative(db, NORMAL);
    assert.equal((await unlock(db, NORMAL, coin)).status, "not_enough_coins");
    assert.equal((await balance(db, NORMAL)).bonus_coins, -5);
    assert.equal((await unlocks(db, NORMAL)).length, 0);
  });

  test("after 0012, a non-free episode priced at 0 coins unlocks even with a negative balance", async () => {
    const { db, zero } = await fresh({ upTo: "0012" });
    await goNegative(db, NORMAL);
    assert.equal((await unlock(db, NORMAL, zero)).status, "unlocked");
  });
});

describe("Daily check-in: atomic, once per day, replay-proof (0012)", () => {
  const REWARDS = [20, 60, 80, 100, 100, 100, 100];
  const claim = (db, user, rewards = REWARDS) =>
    asRole(db, "service_role", async () => {
      const { rows } = await db.query("SELECT public.claim_daily_checkin($1, $2::int[]) AS r", [
        user,
        rewards,
      ]);
      return rows[0].r;
    });
  const today = async (db) =>
    (await db.query("SELECT ((clock_timestamp() AT TIME ZONE 'UTC')::date)::text AS d")).rows[0].d;
  const events = async (db, user) =>
    (
      await db.query(
        "SELECT source, event_id, bonus_coins FROM public.reward_events WHERE user_id = $1 ORDER BY created_at",
        [user],
      )
    ).rows;
  const setStreak = (db, daysAgo, streak) =>
    db.query(
      "UPDATE public.profiles SET last_checkin_date = (clock_timestamp() AT TIME ZONE 'UTC')::date - $2::int, checkin_streak = $3 WHERE id = $1",
      [NORMAL, daysAgo, streak],
    );

  test("first claim: day-1 reward, streak 1, one recorded event", async () => {
    const { db } = await fresh();
    const r = await claim(db, NORMAL);
    assert.equal(r.status, "claimed");
    assert.equal(r.reward, 20);
    assert.equal(r.profile.bonus_coins, 230);
    assert.equal(r.profile.checkin_streak, 1);
    assert.equal(r.profile.last_checkin_date, await today(db));
    assert.deepEqual(await events(db, NORMAL), [
      { source: "daily_checkin", event_id: await today(db), bonus_coins: 20 },
    ]);
  });

  test("duplicate requests the same day credit nothing more", async () => {
    const { db } = await fresh();
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push((await claim(db, NORMAL)).status);
    assert.deepEqual(results, ["claimed", ...Array(4).fill("already_claimed")]);
    assert.equal((await balance(db, NORMAL)).bonus_coins, 230);
    assert.equal((await events(db, NORMAL)).length, 1);
  });

  test("concurrent requests are serialised on the profile row: lock taken before any check", async () => {
    const fn = read("drizzle/migrations/0012_unlock_fixes_and_atomic_rewards.sql");
    const body = fn.slice(fn.indexOf("FUNCTION public.claim_daily_checkin"));
    const lock = body.indexOf("FOR UPDATE;");
    assert.ok(lock > 0 && lock < body.indexOf("already_claimed"));
    assert.ok(lock < body.indexOf("INSERT INTO public.reward_events"));
  });

  test("replay protection holds even if the date on the profile is reset", async () => {
    const { db } = await fresh();
    await claim(db, NORMAL);
    await db.query("UPDATE public.profiles SET last_checkin_date = NULL WHERE id = $1", [NORMAL]);
    assert.equal((await claim(db, NORMAL)).status, "already_claimed");
    assert.equal((await balance(db, NORMAL)).bonus_coins, 230);
  });

  test("a streak continues after yesterday and is capped at day 7", async () => {
    const { db } = await fresh();
    await setStreak(db, 1, 3);
    const r = await claim(db, NORMAL);
    assert.deepEqual([r.reward, r.profile.checkin_streak], [100, 4]);
    const { db: db2 } = await fresh();
    await setStreak(db2, 1, 7);
    const r2 = await claim(db2, NORMAL);
    assert.deepEqual([r2.reward, r2.profile.checkin_streak], [100, 7]);
  });

  test("a missed day restarts the streak at day 1", async () => {
    const { db } = await fresh();
    await setStreak(db, 2, 5);
    const r = await claim(db, NORMAL);
    assert.deepEqual([r.reward, r.profile.checkin_streak], [20, 1]);
  });

  test("the credit is an increment, so a balance change in between is never overwritten", async () => {
    // The old pattern: read the balance, something else changes it, write read + reward.
    const { db: oldDb } = await fresh();
    const stale = (await balance(oldDb, PAYING)).bonus_coins; // 5
    await oldDb.query("UPDATE public.profiles SET bonus_coins = bonus_coins + 500 WHERE id = $1", [
      PAYING,
    ]);
    await oldDb.query("UPDATE public.profiles SET bonus_coins = $2 WHERE id = $1", [
      PAYING,
      stale + 20,
    ]);
    assert.equal((await balance(oldDb, PAYING)).bonus_coins, 25, "the old pattern loses the +500");

    const { db } = await fresh();
    await db.query("UPDATE public.profiles SET bonus_coins = bonus_coins + 500 WHERE id = $1", [
      PAYING,
    ]);
    await claim(db, PAYING);
    assert.equal((await balance(db, PAYING)).bonus_coins, 525);
  });

  test("a failure after the credit rolls back the credit and the event together", async () => {
    const { db } = await fresh();
    await db.exec(`
      CREATE FUNCTION public.test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'simulated failure'; END; $$;
      CREATE TRIGGER test_fail AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.test_fail();
    `);
    await assert.rejects(claim(db, NORMAL), /simulated failure/);
    assert.equal((await balance(db, NORMAL)).bonus_coins, 210);
    assert.equal((await events(db, NORMAL)).length, 0);
  });

  test("invalid input and unknown users change nothing", async () => {
    const { db } = await fresh();
    for (const rewards of [[], [20, -1], [20, null]]) {
      assert.equal((await claim(db, NORMAL, rewards)).status, "invalid");
    }
    assert.equal(
      (await claim(db, "00000000-0000-4000-8000-00000000beef")).status,
      "profile_not_found",
    );
    assert.equal((await balance(db, NORMAL)).bonus_coins, 210);
  });

  test("only the server may claim; browsers cannot read or write reward events", async () => {
    const { db } = await fresh();
    await assert.rejects(
      asUser(db, NORMAL, () =>
        db.query("SELECT public.claim_daily_checkin($1, ARRAY[20])", [NORMAL]),
      ),
      /permission denied/,
    );
    await assert.rejects(
      asRole(db, "anon", () =>
        db.query("SELECT public.claim_daily_checkin($1, ARRAY[20])", [NORMAL]),
      ),
      /permission denied/,
    );
    await asUser(db, NORMAL, async () => {
      await assert.rejects(db.query("SELECT * FROM public.reward_events"), /permission denied/);
      await assert.rejects(
        db.query(
          "INSERT INTO public.reward_events (user_id, source, event_id, bonus_coins) VALUES (auth.uid(), 'daily_checkin', 'x', 1)",
        ),
        /permission denied/,
      );
    });
  });

  test("there is no source for ad rewards, and values are validated", async () => {
    const { db } = await fresh();
    const insert = (source, event, amount) =>
      db.query(
        "INSERT INTO public.reward_events (user_id, source, event_id, bonus_coins) VALUES ($1, $2, $3, $4)",
        [NORMAL, source, event, amount],
      );
    await assert.rejects(insert("ad", "provider-event-1", 15), /reward_events_source_valid/);
    await assert.rejects(insert("daily_checkin", "", 5), /reward_events_event_id_valid/);
    await assert.rejects(insert("daily_checkin", "d", -5), /reward_events_amount_valid/);
  });
});

describe("Migration order: what an automatic runner applies is safe before the new code is live", () => {
  /** drizzle-orm's rule: run journal entries in order whose `when` is newer than the last applied row. */
  const pending = (lastApplied) =>
    JOURNAL.entries.filter((e) => e.when > lastApplied).map((e) => e.tag);

  test("against the live history, a runner would apply exactly 0011 and 0012, in that order", () => {
    assert.deepEqual(pending(LIVE_LAST_APPLIED), [
      "0011_server_only_balances_and_unlocks",
      "0012_unlock_fixes_and_atomic_rewards",
    ]);
  });

  test("the post-deploy unlock lock is not reachable by any runner", () => {
    const tags = JOURNAL.entries.map((e) => e.tag).join("\n");
    assert.doesNotMatch(tags, /unlock_inserts/);
    for (const e of JOURNAL.entries) {
      const sql = read(`drizzle/migrations/${e.tag}.sql`);
      assert.doesNotMatch(sql, /REVOKE[^;]*ON public\.user_unlocked_episodes FROM/i, e.tag);
      assert.doesNotMatch(sql, /DROP POLICY[^;]*"Users create own unlocks"/i, e.tag);
    }
  });

  test("runner on the live state (0011 already applied by hand): 0011 re-runs as a no-op, then 0012", async () => {
    const { db, coin, free } = await fresh({ upTo: "0011" });
    for (const tag of pending(LIVE_LAST_APPLIED)) {
      await db.exec(read(`drizzle/migrations/${tag}.sql`));
    }
    // The currently published app keeps working after the runner:
    // its own-unlock insert (free path) ...
    await asUser(db, NORMAL, () =>
      db.query("INSERT INTO public.user_unlocked_episodes (user_id, episode_id) VALUES ($1, $2)", [
        NORMAL,
        free,
      ]),
    );
    // ... its coin path (server balance update + own-unlock insert) ...
    await asRole(db, "service_role", () =>
      db.query("UPDATE public.profiles SET bonus_coins = 190 WHERE id = $1", [NORMAL]),
    );
    await asUser(db, NORMAL, () =>
      db.query("INSERT INTO public.user_unlocked_episodes (user_id, episode_id) VALUES ($1, $2)", [
        NORMAL,
        coin,
      ]),
    );
    // ... and its server check-in.
    await asRole(db, "service_role", () =>
      db.query(
        "UPDATE public.profiles SET last_checkin_date = CURRENT_DATE, checkin_streak = 1, bonus_coins = 210 WHERE id = $1",
        [NORMAL],
      ),
    );
    assert.equal((await unlocks(db, NORMAL)).length, 2);
    assert.equal((await balance(db, NORMAL)).bonus_coins, 210);
  });

  test("runner on a fresh history: 0011 then 0012 in one go gives the same end state", async () => {
    const { db } = await fresh({ upTo: "none" });
    for (const tag of pending(LIVE_LAST_APPLIED)) {
      await db.exec(read(`drizzle/migrations/${tag}.sql`));
    }
    const fn = await db.query(
      "SELECT md5(prosrc) AS h FROM pg_proc WHERE oid = 'public.unlock_episode(uuid,uuid)'::regprocedure",
    );
    const { db: ref } = await fresh({ upTo: "0012" });
    const refFn = await ref.query(
      "SELECT md5(prosrc) AS h FROM pg_proc WHERE oid = 'public.unlock_episode(uuid,uuid)'::regprocedure",
    );
    assert.equal(fn.rows[0].h, refFn.rows[0].h);
  });

  test("0012 replaces both 0011 functions without editing 0011", () => {
    assert.match(M0011, /prof\.vip_until > now\(\)/);
    const m12 = read("drizzle/migrations/0012_unlock_fixes_and_atomic_rewards.sql");
    assert.match(
      m12,
      /CREATE OR REPLACE FUNCTION public\.unlock_episode\(_user uuid, _episode uuid\)/,
    );
    assert.match(m12, /CREATE OR REPLACE FUNCTION public\.guard_profile_entitlements\(\)/);
    assert.match(m12, /checked_at := clock_timestamp\(\);/);
  });
});

describe("types match the database (0012)", () => {
  test("reward_events and claim_daily_checkin are in types.ts", async () => {
    const { db } = await fresh();
    const cols = (
      await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reward_events' ORDER BY column_name",
      )
    ).rows.map((r) => r.column_name);
    const start = TYPES.indexOf("      reward_events: {");
    assert.ok(start > 0, "reward_events is typed");
    const rowStart = TYPES.indexOf("Row: {", start);
    const row = TYPES.slice(rowStart, TYPES.indexOf("}", rowStart));
    assert.deepEqual([...row.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]).sort(), cols);
    assert.match(
      TYPES,
      /claim_daily_checkin: \{\s+Args: \{ _rewards: number\[\]; _user: string \}\s+Returns: Json\s+\}/,
    );
  });
});
