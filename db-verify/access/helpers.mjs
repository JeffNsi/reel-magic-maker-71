// Shared helpers for the db-verify/access tests: a live-like Supabase stub,
// the migrations in the order a runner applies them, seeded users and episodes,
// and helpers to act as anon, a signed-in browser or trusted server code.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";

export const repo = new URL("../../", import.meta.url);
export const read = (path) => readFileSync(new URL(path, repo), "utf8");
export const STUB = readFileSync(new URL("./supabase-stub.sql", import.meta.url), "utf8");
export const M0002 = read("drizzle/migrations/0002_atomic_coins.sql");
export const M0011 = read("drizzle/migrations/0011_server_only_balances_and_unlocks.sql");
export const M0012 = read("drizzle/migrations/0012_unlock_fixes_and_atomic_rewards.sql");
// Not a migration: applied by hand after the new app code is published.
export const LOCK = read("ops/post-deploy/server_only_unlock_inserts.sql");
export const STAGES = ["none", "0011", "0012", "lock"];
export const TYPES = read("src/integrations/supabase/types.ts");

export const NORMAL = "00000000-0000-4000-8000-0000000000a1"; // default 210 bonus coins
export const PAYING = "00000000-0000-4000-8000-0000000000a2"; // 5 bonus + 100 paid
export const VIP = "00000000-0000-4000-8000-0000000000a3"; // active VIP, no coins
export const EXPIRED = "00000000-0000-4000-8000-0000000000a4"; // VIP ended yesterday, 30 bonus
export const BROKE = "00000000-0000-4000-8000-0000000000a5"; // 10 paid coins
export const LEGACY = "00000000-0000-4000-8000-0000000000a6"; // existing state before 0011

export const PERMISSION = /permission denied|server-managed|row-level security/;

export async function fresh({ upTo = "lock" } = {}) {
  const stage = STAGES.indexOf(upTo);
  assert.ok(stage >= 0, `unknown stage ${upTo}`);
  const db = new PGlite();
  await db.exec(STUB);
  await db.exec(M0002);
  const ids = await seedBefore(db);
  if (stage >= 1) await db.exec(M0011);
  if (stage >= 2) await db.exec(M0012);
  if (stage >= 3) await db.exec(LOCK);
  return { db, ...ids };
}

/** State that already exists live before the migrations run. */
export async function seedBefore(db) {
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
export async function asUser(db, userId, fn) {
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

export async function asRole(db, role, fn) {
  await db.exec(`SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
  }
}

export const unlock = async (db, user, episode) =>
  asRole(db, "service_role", async () => {
    const { rows } = await db.query("SELECT public.unlock_episode($1, $2) AS r", [user, episode]);
    return rows[0].r;
  });

export const balance = async (db, id) =>
  (
    await db.query(
      "SELECT paid_coins, bonus_coins, is_vip, vip_until FROM public.profiles WHERE id = $1",
      [id],
    )
  ).rows[0];

export const unlocks = async (db, user) =>
  (
    await db.query(
      "SELECT episode_id, charged_bonus, charged_paid, unlock_method FROM public.user_unlocked_episodes WHERE user_id = $1 ORDER BY unlocked_at",
      [user],
    )
  ).rows;
