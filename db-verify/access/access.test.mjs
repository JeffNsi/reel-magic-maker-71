// Executable regression tests for migrations 0011 and 0012 (server-only coin
// balances, VIP status and episode unlocks). Applies them to a real Postgres
// (PGlite) on a stub that mirrors the live Lovable Cloud catalog, then checks
// each rule as the roles the app really uses: anon, authenticated (a signed-in
// browser) and service_role (trusted server code).
// Run: cd db-verify/access && npm ci && npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";

const repo = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, repo), "utf8");
const STUB = readFileSync(new URL("./supabase-stub.sql", import.meta.url), "utf8");
const M0002 = read("drizzle/migrations/0002_atomic_coins.sql");
const M0011 = read("drizzle/migrations/0011_server_only_balances_and_unlocks.sql");
const M0012 = read("drizzle/migrations/0012_server_only_unlock_inserts.sql");
const TYPES = read("src/integrations/supabase/types.ts");

const NORMAL = "00000000-0000-4000-8000-0000000000a1"; // default 210 bonus coins
const PAYING = "00000000-0000-4000-8000-0000000000a2"; // 5 bonus + 100 paid
const VIP = "00000000-0000-4000-8000-0000000000a3"; // active VIP, no coins
const EXPIRED = "00000000-0000-4000-8000-0000000000a4"; // VIP ended yesterday, 30 bonus
const BROKE = "00000000-0000-4000-8000-0000000000a5"; // 10 paid coins
const LEGACY = "00000000-0000-4000-8000-0000000000a6"; // existing state before 0011

const PERMISSION = /permission denied|server-managed|row-level security/;

async function fresh({ upTo = "0012" } = {}) {
  const db = new PGlite();
  await db.exec(STUB);
  await db.exec(M0002);
  const ids = await seedBefore(db);
  if (upTo >= "0011") await db.exec(M0011);
  if (upTo >= "0012") await db.exec(M0012);
  return { db, ...ids };
}

/** State that already exists live before the migrations run. */
async function seedBefore(db) {
  for (const [id, email] of [
    [NORMAL, "normal@example.com"],
    [PAYING, "paying@example.com"],
    [VIP, "vip@example.com"],
    [EXPIRED, "expired@example.com"],
    [BROKE, "broke@example.com"],
    [LEGACY, "legacy@example.com"],
  ]) {
    await db.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [id, email]);
  }
  await db.query("UPDATE public.profiles SET bonus_coins = 5, paid_coins = 100 WHERE id = $1", [
    PAYING,
  ]);
  await db.query(
    "UPDATE public.profiles SET bonus_coins = 0, is_vip = true, vip_until = now() + interval '30 days' WHERE id = $1",
    [VIP],
  );
  await db.query(
    "UPDATE public.profiles SET bonus_coins = 30, is_vip = true, vip_until = now() - interval '1 day' WHERE id = $1",
    [EXPIRED],
  );
  await db.query("UPDATE public.profiles SET bonus_coins = 0, paid_coins = 10 WHERE id = $1", [
    BROKE,
  ]);
  await db.query(
    "UPDATE public.profiles SET bonus_coins = 20, paid_coins = 500, is_vip = true, vip_until = '2026-10-13T16:12:09Z' WHERE id = $1",
    [LEGACY],
  );

  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0].id;
  const drama = await one(
    "INSERT INTO public.dramas (title, cover_url) VALUES ('Series', 'c') RETURNING id",
  );
  const vipDrama = await one(
    "INSERT INTO public.dramas (title, cover_url, is_vip_only) VALUES ('VIP series', 'c', true) RETURNING id",
  );
  const ep = (dramaId, n, cost, free, hidden = false) =>
    one(
      "INSERT INTO public.episodes (drama_id, episode_number, coin_cost, is_free, hidden) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [dramaId, n, cost, free, hidden],
    );
  const ids = {
    free: await ep(drama, 1, 0, true),
    coin: await ep(drama, 2, 20, false),
    coinB: await ep(drama, 3, 20, false),
    hidden: await ep(drama, 4, 20, false, true),
    zero: await ep(drama, 5, 0, false),
    vipCoin: await ep(vipDrama, 1, 20, false),
    vipFree: await ep(vipDrama, 2, 0, true),
  };
  // One unlock that exists before the migrations (as live: 1 row).
  await db.query(
    "INSERT INTO public.user_unlocked_episodes (user_id, episode_id) VALUES ($1, $2)",
    [LEGACY, ids.coin],
  );
  await db.query(
    "INSERT INTO public.user_unlocked_episodes (user_id, episode_id) VALUES ($1, $2)",
    [LEGACY, ids.hidden],
  );
  return ids;
}

/** Run `fn` as a signed-in browser (authenticated + JWT sub), then reset. */
async function asUser(db, userId, fn) {
  await db.exec("SET ROLE authenticated");
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claims', '', false)");
  }
}

async function asRole(db, role, fn) {
  await db.exec(`SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
  }
}

const unlock = async (db, user, episode) =>
  asRole(db, "service_role", async () => {
    const { rows } = await db.query("SELECT public.unlock_episode($1, $2) AS r", [user, episode]);
    return rows[0].r;
  });

const balance = async (db, id) =>
  (
    await db.query(
      "SELECT paid_coins, bonus_coins, is_vip, vip_until FROM public.profiles WHERE id = $1",
      [id],
    )
  ).rows[0];

const unlocks = async (db, user) =>
  (
    await db.query(
      "SELECT episode_id, charged_bonus, charged_paid, unlock_method FROM public.user_unlocked_episodes WHERE user_id = $1 ORDER BY unlocked_at",
      [user],
    )
  ).rows;

describe("migrations apply forward-only and keep every row", () => {
  test("0011 and 0012 apply on the live-like schema and can be re-run", async () => {
    const { db } = await fresh();
    await db.exec(M0011);
    await db.exec(M0012);
    const fn = await db.query(
      "SELECT prosecdef, proconfig FROM pg_proc WHERE oid = 'public.unlock_episode(uuid,uuid)'::regprocedure",
    );
    assert.equal(fn.rows[0].prosecdef, true);
    assert.deepEqual(fn.rows[0].proconfig, ['search_path=""']);
  });

  test("existing balances, VIP dates and unlocks are untouched", async () => {
    const { db, coin, hidden } = await fresh();
    const legacy = await balance(db, LEGACY);
    assert.equal(legacy.paid_coins, 500);
    assert.equal(legacy.bonus_coins, 20);
    assert.equal(legacy.is_vip, true);
    assert.equal(new Date(legacy.vip_until).toISOString(), "2026-10-13T16:12:09.000Z");
    assert.deepEqual(await unlocks(db, LEGACY), [
      { episode_id: coin, charged_bonus: 0, charged_paid: 0, unlock_method: null },
      { episode_id: hidden, charged_bonus: 0, charged_paid: 0, unlock_method: null },
    ]);
  });

  test("the live column-level REVOKE alone does not protect balances (the bug being fixed)", async () => {
    const { db } = await fresh({ upTo: "0000" });
    await asUser(db, NORMAL, () =>
      db.query(
        "UPDATE public.profiles SET paid_coins = 999999, is_vip = true WHERE id = auth.uid()",
      ),
    );
    const after = await balance(db, NORMAL);
    assert.equal(after.paid_coins, 999999);
    assert.equal(after.is_vip, true);
  });

  test("the live insert policy alone lets a browser unlock any episode (the bug being fixed)", async () => {
    const { db, vipCoin } = await fresh({ upTo: "0000" });
    await asUser(db, NORMAL, () =>
      db.query("INSERT INTO public.user_unlocked_episodes (user_id, episode_id) VALUES ($1, $2)", [
        NORMAL,
        vipCoin,
      ]),
    );
    const n = await db.query(
      "SELECT count(*)::int AS n FROM public.user_unlocked_episodes WHERE user_id = $1",
      [NORMAL],
    );
    assert.equal(n.rows[0].n, 1);
  });
});

describe("A: only trusted server code changes coin balances and VIP status", () => {
  for (const [col, value] of [
    ["paid_coins", "999999"],
    ["bonus_coins", "999999"],
    ["is_vip", "true"],
    ["vip_until", "'2099-01-01'"],
  ]) {
    test(`a signed-in user cannot change own ${col}`, async () => {
      const { db } = await fresh({ upTo: "0011" });
      const before = await balance(db, NORMAL);
      await assert.rejects(
        asUser(db, NORMAL, () =>
          db.query(`UPDATE public.profiles SET ${col} = ${value} WHERE id = auth.uid()`),
        ),
        PERMISSION,
      );
      assert.deepEqual(await balance(db, NORMAL), before);
    });
  }

  test("a signed-in user cannot change any profile column, nor insert or delete profiles", async () => {
    const { db } = await fresh({ upTo: "0011" });
    await asUser(db, NORMAL, async () => {
      await assert.rejects(
        db.query("UPDATE public.profiles SET email = 'x@example.com' WHERE id = auth.uid()"),
        PERMISSION,
      );
      await assert.rejects(
        db.query("INSERT INTO public.profiles (id, paid_coins) VALUES (gen_random_uuid(), 5)"),
        PERMISSION,
      );
      await assert.rejects(
        db.query("DELETE FROM public.profiles WHERE id = auth.uid()"),
        PERMISSION,
      );
    });
  });

  test("anonymous visitors cannot change profiles", async () => {
    const { db } = await fresh({ upTo: "0011" });
    await assert.rejects(
      asRole(db, "anon", () => db.query("UPDATE public.profiles SET paid_coins = 1")),
      PERMISSION,
    );
  });

  test("a signed-in user still reads own profile, and only own", async () => {
    const { db } = await fresh({ upTo: "0012" });
    const rows = await asUser(
      db,
      PAYING,
      async () => (await db.query("SELECT id, paid_coins, bonus_coins FROM public.profiles")).rows,
    );
    assert.deepEqual(rows, [{ id: PAYING, paid_coins: 100, bonus_coins: 5 }]);
  });

  test("server code (service role) still credits coins and VIP after a confirmed payment", async () => {
    const { db } = await fresh({ upTo: "0012" });
    await asRole(db, "service_role", () =>
      db.query(
        "UPDATE public.profiles SET paid_coins = paid_coins + 500, is_vip = true, vip_until = now() + interval '30 days' WHERE id = $1",
        [NORMAL],
      ),
    );
    const after = await balance(db, NORMAL);
    assert.equal(after.paid_coins, 500);
    assert.equal(after.is_vip, true);
  });

  test("spend_coins / refund_coins (security definer) still work for the server", async () => {
    const { db } = await fresh({ upTo: "0012" });
    const spent = await asRole(
      db,
      "service_role",
      async () => (await db.query("SELECT * FROM public.spend_coins($1, 15)", [PAYING])).rows[0],
    );
    assert.deepEqual(spent, { bonus_spent: 5, paid_spent: 10 });
    await asRole(db, "service_role", () =>
      db.query("SELECT public.refund_coins($1, 5, 10)", [PAYING]),
    );
    assert.equal((await balance(db, PAYING)).paid_coins, 100);
  });

  test("new sign-ups still get a profile with the default balance", async () => {
    const { db } = await fresh({ upTo: "0012" });
    const id = "00000000-0000-4000-8000-0000000000f1";
    await db.query("INSERT INTO auth.users (id, email) VALUES ($1, 'new@example.com')", [id]);
    const p = await balance(db, id);
    assert.equal(p.bonus_coins, 210);
    assert.equal(p.paid_coins, 0);
    assert.equal(p.is_vip, false);
  });

  test("defence in depth: even if UPDATE is granted again, balances stay server-managed", async () => {
    const { db } = await fresh({ upTo: "0012" });
    await db.exec(`
      GRANT UPDATE ON public.profiles TO authenticated;
      CREATE POLICY "test reopen" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
    `);
    await asUser(db, NORMAL, async () => {
      await assert.rejects(
        db.query("UPDATE public.profiles SET paid_coins = 1 WHERE id = auth.uid()"),
        /server-managed/,
      );
      await assert.rejects(
        db.query("UPDATE public.profiles SET vip_until = '2099-01-01' WHERE id = auth.uid()"),
        /server-managed/,
      );
      // A harmless column still updates, so the guard targets only entitlements.
      await db.query(
        "UPDATE public.profiles SET email = 'still@example.com' WHERE id = auth.uid()",
      );
    });
    assert.equal((await balance(db, NORMAL)).paid_coins, 0);
  });
});

describe("B: unlock_episode decides and charges in one transaction", () => {
  test("free episode: unlocked without a charge", async () => {
    const { db, free } = await fresh();
    const r = await unlock(db, NORMAL, free);
    assert.equal(r.status, "unlocked");
    assert.equal(r.method, "free");
    assert.equal((await balance(db, NORMAL)).bonus_coins, 210);
    assert.deepEqual(await unlocks(db, NORMAL), [
      { episode_id: free, charged_bonus: 0, charged_paid: 0, unlock_method: "free" },
    ]);
  });

  test("normal user: coins are charged once and the cost is recorded", async () => {
    const { db, coin } = await fresh();
    const r = await unlock(db, NORMAL, coin);
    assert.deepEqual(
      {
        status: r.status,
        method: r.method,
        b: r.charged_bonus,
        p: r.charged_paid,
        bonus: r.bonus_coins,
      },
      { status: "unlocked", method: "coins", b: 20, p: 0, bonus: 190 },
    );
    assert.equal((await balance(db, NORMAL)).bonus_coins, 190);
    assert.deepEqual(await unlocks(db, NORMAL), [
      { episode_id: coin, charged_bonus: 20, charged_paid: 0, unlock_method: "coins" },
    ]);
  });

  test("paying user: bonus coins first, then paid coins", async () => {
    const { db, coin } = await fresh();
    const r = await unlock(db, PAYING, coin);
    assert.equal(r.charged_bonus, 5);
    assert.equal(r.charged_paid, 15);
    const b = await balance(db, PAYING);
    assert.deepEqual([b.bonus_coins, b.paid_coins], [0, 85]);
  });

  test("repeated requests never charge twice", async () => {
    const { db, coin } = await fresh();
    await unlock(db, PAYING, coin);
    const again = await unlock(db, PAYING, coin);
    const third = await unlock(db, PAYING, coin);
    assert.equal(again.status, "already_unlocked");
    assert.equal(third.status, "already_unlocked");
    assert.equal(again.charged_paid + again.charged_bonus, 0);
    const b = await balance(db, PAYING);
    assert.deepEqual([b.bonus_coins, b.paid_coins], [0, 85]);
    assert.equal((await unlocks(db, PAYING)).length, 1);
  });

  test("requests for the same user are serialised on the profile row", async () => {
    const src = M0011.slice(M0011.indexOf("CREATE OR REPLACE FUNCTION public.unlock_episode"));
    const lock = src.indexOf("FOR UPDATE;");
    assert.ok(
      lock > 0 && lock < src.indexOf("user_unlocked_episodes"),
      "lock is taken before any check",
    );
  });

  test("a failure after the charge rolls back the charge and the unlock together", async () => {
    const { db, coin } = await fresh();
    await db.exec(`
      CREATE FUNCTION public.test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'simulated failure'; END; $$;
      CREATE TRIGGER test_fail AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.test_fail();
    `);
    await assert.rejects(unlock(db, NORMAL, coin), /simulated failure/);
    assert.equal((await balance(db, NORMAL)).bonus_coins, 210);
    assert.equal((await unlocks(db, NORMAL)).length, 0);
  });

  test("not enough coins: refused, nothing charged, nothing unlocked", async () => {
    const { db, coin } = await fresh();
    const r = await unlock(db, BROKE, coin);
    assert.equal(r.status, "not_enough_coins");
    assert.equal(r.cost, 20);
    assert.equal((await balance(db, BROKE)).paid_coins, 10);
    assert.equal((await unlocks(db, BROKE)).length, 0);
  });

  test("active VIP: unlocks coin and VIP-only episodes without a charge", async () => {
    const { db, coin, vipCoin } = await fresh();
    assert.equal((await unlock(db, VIP, coin)).method, "vip");
    assert.equal((await unlock(db, VIP, vipCoin)).method, "vip");
    const b = await balance(db, VIP);
    assert.deepEqual([b.bonus_coins, b.paid_coins], [0, 0]);
    assert.equal((await unlocks(db, VIP)).length, 2);
  });

  test("expired VIP: pays coins like everyone else and is refused VIP-only series", async () => {
    const { db, coin, vipCoin } = await fresh();
    assert.equal((await unlock(db, EXPIRED, coin)).method, "coins");
    assert.equal((await balance(db, EXPIRED)).bonus_coins, 10);
    assert.equal((await unlock(db, EXPIRED, vipCoin)).status, "vip_only");
    assert.equal((await balance(db, EXPIRED)).bonus_coins, 10);
  });

  test("non-VIP: VIP-only series refused, its free episode still unlocks (as before)", async () => {
    const { db, vipCoin, vipFree } = await fresh();
    assert.equal((await unlock(db, NORMAL, vipCoin)).status, "vip_only");
    assert.equal((await unlock(db, NORMAL, vipFree)).method, "free");
    assert.equal((await balance(db, NORMAL)).bonus_coins, 210);
  });

  test("a non-free episode that costs 0 coins unlocks without a charge", async () => {
    const { db, zero } = await fresh();
    const r = await unlock(db, BROKE, zero);
    assert.equal(r.status, "unlocked");
    assert.equal(r.charged_bonus + r.charged_paid, 0);
  });

  test("hidden episode: no new purchase, existing unlocks are kept", async () => {
    const { db, hidden } = await fresh();
    assert.equal((await unlock(db, NORMAL, hidden)).status, "episode_unavailable");
    assert.equal((await balance(db, NORMAL)).bonus_coins, 210);
    assert.equal((await unlock(db, LEGACY, hidden)).status, "already_unlocked");
  });

  test("unknown episode, unknown user and missing input are refused without changes", async () => {
    const { db, coin } = await fresh();
    assert.equal(
      (await unlock(db, NORMAL, "00000000-0000-4000-8000-00000000dead")).status,
      "episode_not_found",
    );
    assert.equal(
      (await unlock(db, "00000000-0000-4000-8000-00000000beef", coin)).status,
      "profile_not_found",
    );
    assert.equal((await unlock(db, null, coin)).status, "invalid");
    assert.equal((await balance(db, NORMAL)).bonus_coins, 210);
  });

  test("only the server may call unlock_episode", async () => {
    const { db, coin } = await fresh();
    await assert.rejects(
      asUser(db, NORMAL, () => db.query("SELECT public.unlock_episode($1, $2)", [NORMAL, coin])),
      /permission denied/,
    );
    await assert.rejects(
      asRole(db, "anon", () => db.query("SELECT public.unlock_episode($1, $2)", [NORMAL, coin])),
      /permission denied/,
    );
    const grants = await db.query(
      "SELECT has_function_privilege('service_role', 'public.unlock_episode(uuid,uuid)', 'EXECUTE') AS s, has_function_privilege('authenticated', 'public.unlock_episode(uuid,uuid)', 'EXECUTE') AS a, has_function_privilege('anon', 'public.unlock_episode(uuid,uuid)', 'EXECUTE') AS n",
    );
    assert.deepEqual(grants.rows[0], { s: true, a: false, n: false });
  });

  test("the recorded charge must be consistent", async () => {
    const { db, free, coinB } = await fresh();
    await assert.rejects(
      db.query(
        "INSERT INTO public.user_unlocked_episodes (user_id, episode_id, charged_bonus, unlock_method) VALUES ($1, $2, -1, 'coins')",
        [NORMAL, coinB],
      ),
      /user_unlocked_episodes_charge_valid/,
    );
    await assert.rejects(
      db.query(
        "INSERT INTO public.user_unlocked_episodes (user_id, episode_id, charged_paid, unlock_method) VALUES ($1, $2, 5, 'vip')",
        [NORMAL, free],
      ),
      /user_unlocked_episodes_charge_valid/,
    );
  });
});

describe("B: browsers can no longer write unlocks (0012), in the right order", () => {
  test("after 0011 only, the current app's own-unlock insert still works (safe to apply first)", async () => {
    const { db, free } = await fresh({ upTo: "0011" });
    await asUser(db, NORMAL, () =>
      db.query("INSERT INTO public.user_unlocked_episodes (user_id, episode_id) VALUES ($1, $2)", [
        NORMAL,
        free,
      ]),
    );
    assert.equal((await unlocks(db, NORMAL)).length, 1);
  });

  test("after 0012, a signed-in user cannot insert, change or delete unlocks", async () => {
    const { db, vipCoin, coin } = await fresh();
    await asUser(db, LEGACY, async () => {
      await assert.rejects(
        db.query(
          "INSERT INTO public.user_unlocked_episodes (user_id, episode_id) VALUES ($1, $2)",
          [LEGACY, vipCoin],
        ),
        PERMISSION,
      );
      await assert.rejects(
        db.query("UPDATE public.user_unlocked_episodes SET episode_id = $1", [vipCoin]),
        PERMISSION,
      );
      await assert.rejects(db.query("DELETE FROM public.user_unlocked_episodes"), PERMISSION);
    });
    assert.deepEqual((await unlocks(db, LEGACY)).map((u) => u.episode_id).includes(coin), true);
  });

  test("after 0012, a signed-in user still reads own unlocks and only own", async () => {
    const { db, coin } = await fresh();
    await unlock(db, NORMAL, coin);
    const rows = await asUser(
      db,
      NORMAL,
      async () =>
        (await db.query("SELECT user_id, episode_id FROM public.user_unlocked_episodes")).rows,
    );
    assert.deepEqual(rows, [{ user_id: NORMAL, episode_id: coin }]);
  });

  test("anonymous visitors cannot read or write unlocks", async () => {
    const { db, free } = await fresh();
    await assert.rejects(
      asRole(db, "anon", () =>
        db.query(
          "INSERT INTO public.user_unlocked_episodes (user_id, episode_id) VALUES ($1, $2)",
          [NORMAL, free],
        ),
      ),
      PERMISSION,
    );
    const rows = await asRole(
      db,
      "anon",
      async () => (await db.query("SELECT 1 FROM public.user_unlocked_episodes")).rows,
    );
    assert.equal(rows.length, 0);
  });
});

describe("types match the database", () => {
  test("user_unlocked_episodes columns and unlock_episode are in types.ts", async () => {
    const { db } = await fresh();
    const cols = (
      await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_unlocked_episodes' ORDER BY column_name",
      )
    ).rows.map((r) => r.column_name);
    const start = TYPES.indexOf("      user_unlocked_episodes: {");
    const row = TYPES.slice(
      TYPES.indexOf("Row: {", start),
      TYPES.indexOf("}", TYPES.indexOf("Row: {", start)),
    );
    const typed = [...row.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]).sort();
    assert.deepEqual(typed, cols);
    assert.match(
      TYPES,
      /unlock_episode: \{ Args: \{ _episode: string; _user: string \}; Returns: Json \}/,
    );
  });
});
