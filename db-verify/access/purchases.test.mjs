// Regression tests for migration 0014: exactly-once, atomic crediting of coin
// and VIP purchases (public.credit_coin_purchase).
// Run: cd db-verify/access && npm ci && npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  asRole,
  asUser,
  balance,
  fresh,
  LEGACY,
  M0011,
  M0012,
  M0014,
  NORMAL,
  PAYING,
  read,
  TYPES,
  unlock,
  VIP,
} from "./helpers.mjs";

// The pack table the server passes (src/lib/coin-packs.ts).
const PACKS = {
  small: { amount: 49, paid: 500, bonus: 0, vip: 0 },
  medium: { amount: 99, paid: 1000, bonus: 500, vip: 0 },
  large: { amount: 249, paid: 3000, bonus: 2000, vip: 0 },
  vip: { amount: 149, paid: 0, bonus: 0, vip: 30 },
};
const DAY = 86_400_000;

const credit = (db, user, reference, pack = "small", over = {}) => {
  const p = PACKS[pack];
  const a = {
    amount: p.amount,
    paid: p.paid,
    bonus: p.bonus,
    vip: p.vip,
    provider: "sumup",
    ...over,
  };
  return asRole(db, "service_role", async () => {
    const { rows } = await db.query(
      "SELECT public.credit_coin_purchase($1, $2, $3, $4, $5, 'SEK', 'live', $6, $7, $8) AS r",
      [user, reference, a.provider, pack, a.amount, a.paid, a.bonus, a.vip],
    );
    return rows[0].r;
  });
};
const purchases = async (db, user) =>
  (
    await db.query(
      "SELECT reference, status, pack, amount::int AS amount, credited_paid, credited_bonus, vip_until_after FROM public.coin_purchases WHERE user_id = $1 ORDER BY created_at",
      [user],
    )
  ).rows;
const failNextProfileUpdate = (db) =>
  db.exec(`
    CREATE OR REPLACE FUNCTION public.test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'simulated failure'; END; $$;
    CREATE TRIGGER test_fail AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.test_fail();
  `);

describe("0014 applies forward-only and changes no balance", () => {
  test("existing balances and purchase rows are untouched; new columns are empty for old rows", async () => {
    const { db } = await fresh({ upTo: "lock" });
    await db.query(
      "INSERT INTO public.coin_purchases (user_id, reference, provider, pack, amount, status, environment) VALUES ($1, 'legacy-ref', 'stripe', 'small', 0, 'paid', 'sandbox')",
      [LEGACY],
    );
    const before = (
      await db.query(
        "SELECT id, paid_coins, bonus_coins, is_vip, vip_until FROM public.profiles ORDER BY id",
      )
    ).rows;
    await db.exec(M0014);
    await db.exec(M0014); // idempotent
    const after = (
      await db.query(
        "SELECT id, paid_coins, bonus_coins, is_vip, vip_until FROM public.profiles ORDER BY id",
      )
    ).rows;
    assert.deepEqual(after, before);
    assert.deepEqual(await purchases(db, LEGACY), [
      {
        reference: "legacy-ref",
        status: "paid",
        pack: "small",
        amount: 0,
        credited_paid: null,
        credited_bonus: null,
        vip_until_after: null,
      },
    ]);
  });

  test("the currently published code keeps working after 0014 (and after 0011 + 0012 + 0014 from a runner)", async () => {
    const { db } = await fresh({ upTo: "0011" });
    for (const sql of [M0011, M0012, M0014]) await db.exec(sql);
    // Old fulfillPurchase: claim the row as service role, then an absolute balance write.
    await asRole(db, "service_role", async () => {
      await db.query(
        "INSERT INTO public.coin_purchases (user_id, reference, provider, pack, amount, status, environment) VALUES ($1, 'old-ref', 'sumup', 'small', 49, 'paid', 'live') ON CONFLICT (reference) DO NOTHING",
        [NORMAL],
      );
      await db.query("UPDATE public.profiles SET paid_coins = 0 + 500 WHERE id = $1", [NORMAL]);
    });
    assert.equal((await balance(db, NORMAL)).paid_coins, 500);
  });
});

describe("a confirmed payment credits the right amount exactly once", () => {
  for (const pack of ["small", "medium", "large"]) {
    test(`${pack} pack: credited once, recorded with what it credited`, async () => {
      const { db } = await fresh({ upTo: "0014" });
      const before = await balance(db, PAYING);
      const r = await credit(db, PAYING, `${PAYING}:${pack}:1`, pack);
      assert.equal(r.status, "credited");
      const after = await balance(db, PAYING);
      assert.equal(after.paid_coins - before.paid_coins, PACKS[pack].paid);
      assert.equal(after.bonus_coins - before.bonus_coins, PACKS[pack].bonus);
      assert.deepEqual(await purchases(db, PAYING), [
        {
          reference: `${PAYING}:${pack}:1`,
          status: "paid",
          pack,
          amount: PACKS[pack].amount,
          credited_paid: PACKS[pack].paid,
          credited_bonus: PACKS[pack].bonus,
          vip_until_after: null,
        },
      ]);
    });
  }

  test("repeated confirmations and repeated webhooks credit nothing more", async () => {
    const { db } = await fresh({ upTo: "0014" });
    const ref = "stripe:cs_test_123";
    const results = [];
    for (let i = 0; i < 5; i += 1)
      results.push((await credit(db, NORMAL, ref, "medium", { provider: "stripe" })).status);
    assert.deepEqual(results, ["credited", ...Array(4).fill("already_credited")]);
    const b = await balance(db, NORMAL);
    assert.deepEqual([b.paid_coins, b.bonus_coins], [1000, 710]);
    assert.equal((await purchases(db, NORMAL)).length, 1);
  });

  test("two different payments for the same pack are two credits", async () => {
    const { db } = await fresh({ upTo: "0014" });
    await credit(db, NORMAL, "ref-a");
    await credit(db, NORMAL, "ref-b");
    assert.equal((await balance(db, NORMAL)).paid_coins, 1000);
  });

  test("concurrent work is serialised on the profile row: lock before any check", () => {
    const fn = M0014.slice(M0014.indexOf("FUNCTION public.credit_coin_purchase"));
    const lock = fn.indexOf("FOR UPDATE;");
    assert.ok(lock > 0 && lock < fn.indexOf("FROM public.coin_purchases"));
  });
});

describe("balances are incremented, never overwritten", () => {
  test("an unlock and a check-in between reading and crediting are kept", async () => {
    // The old pattern: read balance, other changes happen, write read + pack.
    const { db: oldDb, coin } = await fresh({ upTo: "0014" });
    const stale = await balance(oldDb, PAYING); // 5 bonus, 100 paid
    await unlock(oldDb, PAYING, coin); // takes 5 bonus + 15 paid
    await oldDb.query(
      "UPDATE public.profiles SET paid_coins = $2, bonus_coins = $3 WHERE id = $1",
      [PAYING, stale.paid_coins + 500, stale.bonus_coins],
    );
    const lost = await balance(oldDb, PAYING);
    assert.deepEqual(
      [lost.paid_coins, lost.bonus_coins],
      [600, 5],
      "the old pattern undoes the unlock charge",
    );

    const { db, coin: coin2 } = await fresh({ upTo: "0014" });
    await unlock(db, PAYING, coin2);
    await credit(db, PAYING, "ref-1");
    const kept = await balance(db, PAYING);
    assert.deepEqual([kept.paid_coins, kept.bonus_coins], [585, 0]);
  });
});

describe("a failure records nothing, so the purchase is never 'paid' without coins", () => {
  test("if crediting fails, no purchase row is left behind, and a retry credits once", async () => {
    const { db } = await fresh({ upTo: "0014" });
    await failNextProfileUpdate(db);
    await assert.rejects(credit(db, NORMAL, "ref-fail"), /simulated failure/);
    assert.equal((await purchases(db, NORMAL)).length, 0);
    assert.equal((await balance(db, NORMAL)).paid_coins, 0);
    await db.exec("DROP TRIGGER test_fail ON public.profiles");
    assert.equal((await credit(db, NORMAL, "ref-fail")).status, "credited");
    assert.equal((await credit(db, NORMAL, "ref-fail")).status, "already_credited");
    assert.equal((await balance(db, NORMAL)).paid_coins, 500);
  });

  test("on the old code path, a failed credit leaves a 'paid' row and a retry gives nothing (the bug)", async () => {
    const { db } = await fresh({ upTo: "0014" });
    await asRole(db, "service_role", () =>
      db.query(
        "INSERT INTO public.coin_purchases (user_id, reference, provider, pack, amount, status, environment) VALUES ($1, 'ref-old', 'sumup', 'small', 49, 'paid', 'live') ON CONFLICT (reference) DO NOTHING",
        [NORMAL],
      ),
    );
    // ... the balance write fails here; the retry finds the row and stops:
    assert.equal((await credit(db, NORMAL, "ref-old")).status, "already_credited");
    assert.equal((await balance(db, NORMAL)).paid_coins, 0);
  });

  test("a pending purchase (created when a checkout starts) is settled and credited once", async () => {
    const { db } = await fresh({ upTo: "0014" });
    await db.query(
      "INSERT INTO public.coin_purchases (user_id, reference, provider, pack, amount, status, environment) VALUES ($1, 'ref-pending', 'sumup', 'small', 49, 'pending', 'live')",
      [NORMAL],
    );
    assert.equal((await credit(db, NORMAL, "ref-pending")).status, "credited");
    assert.equal((await credit(db, NORMAL, "ref-pending")).status, "already_credited");
    const [row] = await purchases(db, NORMAL);
    assert.deepEqual([row.status, row.credited_paid], ["paid", 500]);
    assert.equal((await balance(db, NORMAL)).paid_coins, 500);
  });

  test("a purchase in any other state is not credited", async () => {
    const { db } = await fresh({ upTo: "0014" });
    await db.query(
      "INSERT INTO public.coin_purchases (user_id, reference, provider, pack, amount, status, environment) VALUES ($1, 'ref-refunded', 'sumup', 'small', 49, 'refunded', 'live')",
      [NORMAL],
    );
    assert.equal((await credit(db, NORMAL, "ref-refunded")).status, "not_creditable");
    assert.equal((await balance(db, NORMAL)).paid_coins, 0);
  });
});

describe("VIP is extended from the later of now and the current end date", () => {
  const until = async (db, id) => new Date((await balance(db, id)).vip_until).getTime();

  test("no VIP: 30 days from now", async () => {
    const { db } = await fresh({ upTo: "0014" });
    const t0 = Date.now();
    assert.equal((await credit(db, NORMAL, "vip-1", "vip")).status, "credited");
    const b = await balance(db, NORMAL);
    assert.equal(b.is_vip, true);
    assert.ok(Math.abs((await until(db, NORMAL)) - (t0 + 30 * DAY)) < 60_000);
    assert.deepEqual([b.paid_coins, b.bonus_coins], [0, 210], "a VIP pass credits no coins");
  });

  test("active VIP ending in 10 days: extended to 40 days from now", async () => {
    const { db } = await fresh({ upTo: "0014" });
    await db.query(
      "UPDATE public.profiles SET vip_until = now() + interval '10 days' WHERE id = $1",
      [VIP],
    );
    const end = await until(db, VIP);
    await credit(db, VIP, "vip-2", "vip");
    assert.ok(Math.abs((await until(db, VIP)) - (end + 30 * DAY)) < 1_000);
  });

  test("VIP that ended yesterday: 30 days from now, not from the old date", async () => {
    const { db } = await fresh({ upTo: "0014" });
    await db.query(
      "UPDATE public.profiles SET is_vip = true, vip_until = now() - interval '1 day' WHERE id = $1",
      [NORMAL],
    );
    const t0 = Date.now();
    await credit(db, NORMAL, "vip-3", "vip");
    assert.ok(Math.abs((await until(db, NORMAL)) - (t0 + 30 * DAY)) < 60_000);
  });

  test("VIP without an end date keeps no end date", async () => {
    const { db } = await fresh({ upTo: "0014" });
    await db.query("UPDATE public.profiles SET is_vip = true, vip_until = NULL WHERE id = $1", [
      NORMAL,
    ]);
    await credit(db, NORMAL, "vip-4", "vip");
    const b = await balance(db, NORMAL);
    assert.deepEqual([b.is_vip, b.vip_until], [true, null]);
  });

  test("the purchase row records the new end date", async () => {
    const { db } = await fresh({ upTo: "0014" });
    await credit(db, NORMAL, "vip-5", "vip");
    const [row] = await purchases(db, NORMAL);
    assert.equal(new Date(row.vip_until_after).getTime(), await until(db, NORMAL));
  });
});

describe("refusals change nothing", () => {
  test("a payment reference that belongs to another account", async () => {
    const { db } = await fresh({ upTo: "0014" });
    await credit(db, PAYING, "shared-ref");
    assert.equal((await credit(db, NORMAL, "shared-ref")).status, "reference_conflict");
    assert.equal((await balance(db, NORMAL)).paid_coins, 0);
  });

  test("unknown user and invalid input", async () => {
    const { db } = await fresh({ upTo: "0014" });
    assert.equal(
      (await credit(db, "00000000-0000-4000-8000-00000000beef", "ref-x")).status,
      "profile_not_found",
    );
    for (const over of [
      { paid: -1 },
      { bonus: -1 },
      { vip: -1 },
      { amount: -1 },
      { paid: 0, bonus: 0, vip: 0 },
    ]) {
      assert.equal((await credit(db, NORMAL, "ref-y", "small", over)).status, "invalid");
    }
    assert.equal((await credit(db, NORMAL, "", "small")).status, "invalid");
    assert.equal((await purchases(db, NORMAL)).length, 0);
    assert.equal((await balance(db, NORMAL)).paid_coins, 0);
  });
});

describe("only the server may credit; browsers only read their own purchases", () => {
  test("browsers and anonymous visitors cannot call credit_coin_purchase", async () => {
    const { db } = await fresh({ upTo: "0014" });
    const call =
      "SELECT public.credit_coin_purchase($1, 'r', 'sumup', 'small', 49, 'SEK', 'live', 500, 0, 0)";
    await assert.rejects(
      asUser(db, NORMAL, () => db.query(call, [NORMAL])),
      /permission denied/,
    );
    await assert.rejects(
      asRole(db, "anon", () => db.query(call, [NORMAL])),
      /permission denied/,
    );
  });

  test("browsers cannot write purchase rows, and read only their own", async () => {
    const { db } = await fresh({ upTo: "0014" });
    await credit(db, NORMAL, "mine");
    await credit(db, PAYING, "theirs");
    await asUser(db, NORMAL, async () => {
      await assert.rejects(
        db.query(
          "INSERT INTO public.coin_purchases (user_id, reference, provider, pack, amount, status) VALUES (auth.uid(), 'fake', 'sumup', 'large', 0, 'paid')",
        ),
        /permission denied/,
      );
      await assert.rejects(
        db.query("UPDATE public.coin_purchases SET status = 'pending'"),
        /permission denied/,
      );
      const rows = (await db.query("SELECT reference FROM public.coin_purchases")).rows;
      assert.deepEqual(rows, [{ reference: "mine" }]);
    });
  });
});

describe("types match the database (0014)", () => {
  test("coin_purchases columns and credit_coin_purchase are in types.ts", async () => {
    const { db } = await fresh({ upTo: "0014" });
    const cols = (
      await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'coin_purchases' ORDER BY column_name",
      )
    ).rows.map((r) => r.column_name);
    const start = TYPES.indexOf("      coin_purchases: {");
    const rowStart = TYPES.indexOf("Row: {", start);
    const row = TYPES.slice(rowStart, TYPES.indexOf("}", rowStart));
    assert.deepEqual([...row.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]).sort(), cols);
    const fnStart = TYPES.indexOf("      credit_coin_purchase: {");
    assert.ok(fnStart > 0);
    const args = TYPES.slice(
      TYPES.indexOf("Args: {", fnStart),
      TYPES.indexOf("}", TYPES.indexOf("Args: {", fnStart)),
    );
    const fnArgs = (
      await db.query(
        "SELECT unnest(proargnames) AS a FROM pg_proc WHERE proname = 'credit_coin_purchase' ORDER BY 1",
      )
    ).rows.map((r) => r.a);
    assert.deepEqual([...args.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]).sort(), fnArgs);
  });

  test("the pack table in this test matches src/lib/coin-packs.ts", () => {
    const src = read("src/lib/coin-packs.ts");
    for (const [pack, p] of Object.entries(PACKS)) {
      const block = src.slice(
        src.indexOf(`  ${pack}: {`),
        src.indexOf("},", src.indexOf(`  ${pack}: {`)),
      );
      assert.match(block, new RegExp(`amountSek: ${p.amount},`));
      assert.match(block, new RegExp(`paid: ${p.paid},`));
      assert.match(block, new RegExp(`bonus: ${p.bonus},`));
      assert.match(block, p.vip ? /vipDays: VIP_DAYS,/ : /vipDays: 0,/);
    }
    assert.match(src, /export const VIP_DAYS = 30;/);
  });
});
