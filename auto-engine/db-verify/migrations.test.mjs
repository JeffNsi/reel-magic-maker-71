// Executable regression tests for the Auto Engine migrations.
// Applies 0009 (as already live in Lovable Cloud) and then 0010 to a real
// Postgres (PGlite) on a Supabase-like stub, and checks every security and
// data-integrity rule behind the 11 findings of the PR #1 review (F1–F11).
// Run: cd auto-engine/db-verify && npm ci && npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";

const repo = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, repo), "utf8");
const STUB = readFileSync(new URL("./supabase-stub.sql", import.meta.url), "utf8");
const M0009 = read("drizzle/migrations/0009_auto_engine_step1.sql");
const M0010 = read("drizzle/migrations/0010_auto_engine_review_fixes.sql");
const PATHS = JSON.parse(read("tests/fixtures/auto-engine-paths.json")).cases;
const TYPES = read("src/integrations/supabase/types.ts");
const TABLES = ["post_jobs", "film_exports", "teaser_candidates"];

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const MEMBER = "00000000-0000-4000-8000-0000000000b2";
const hex = (c) => c.repeat(64);

async function freshDb({ with0010 = true } = {}) {
  const db = new PGlite();
  await db.exec(STUB);
  await db.exec(M0009);
  if (with0010) await db.exec(M0010);
  return db;
}

async function seed(db) {
  await db.query(
    "INSERT INTO auth.users (id, email) VALUES ($1, 'admin@example.com'), ($2, 'member@example.com')",
    [ADMIN, MEMBER],
  );
  await db.query("INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin')", [ADMIN]);
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0].id;
  return {
    story: await one("INSERT INTO public.stories (title) VALUES ('QA Homecoming') RETURNING id"),
    other: await one(
      "INSERT INTO public.stories (title) VALUES ('The Vanishing Tide') RETURNING id",
    ),
    drama: await one("INSERT INTO public.dramas (title) VALUES ('Series') RETURNING id"),
  };
}

async function insert(db, table, values) {
  const cols = Object.keys(values);
  const sql = `INSERT INTO public.${table} (${cols.join(", ")}) VALUES (${cols
    .map((_, i) => `$${i + 1}`)
    .join(", ")}) RETURNING *`;
  return (await db.query(sql, Object.values(values))).rows[0];
}

const filmJob = (ids, extra = {}) => ({
  kind: "assemble",
  subject_type: "film",
  story_id: ids.story,
  manifest: '{"manifest_version":2}',
  manifest_hash: hex("a"),
  idempotency_key: `assemble:${Math.random().toString(16).slice(2)}`,
  ...extra,
});

const filmExport = (ids, extra = {}) => ({
  subject_type: "film",
  story_id: ids.story,
  version: 1,
  manifest: '{"manifest_version":2}',
  manifest_hash: hex("a"),
  storage_prefix: `exports/${ids.story}/v1/`,
  video_vertical_path: `exports/${ids.story}/v1/film_9x16.mp4`,
  duration_ms: 25000,
  size_bytes: 12345678,
  sha256: hex("b"),
  ...extra,
});

async function as(db, role, sub, fn) {
  await db.exec(`SET ROLE ${role}`);
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [sub ?? ""]);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
  }
}

const refused = (promise, pattern, message) => assert.rejects(promise, pattern, message);

describe("migration safety (0009 is live; 0010 builds on it)", () => {
  test("0010 applies on top of 0009 and can be applied again", async () => {
    const db = await freshDb();
    await db.exec(M0010);
  });

  test("a migrator replaying 0009 and then 0010 weakens nothing", async () => {
    const db = await freshDb();
    await db.exec(M0009);
    await db.exec(M0010);
    const ids = await seed(db);
    await assert.rejects(
      insert(
        db,
        "film_exports",
        filmExport(ids, { video_vertical_path: `exports/${ids.story}/v1/../../x.mp4` }),
      ),
      /film_exports_paths_contained/,
    );
    const { rows } = await db.query(
      "SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1)",
      [TABLES],
    );
    assert.equal(rows[0].n, 3);
  });

  test("0010 keeps valid rows that already exist under 0009", async () => {
    const db = await freshDb({ with0010: false });
    const ids = await seed(db);
    const job = await insert(db, "post_jobs", filmJob(ids));
    const exp = await insert(db, "film_exports", filmExport(ids));
    await db.exec(M0010);
    const { rows } = await db.query(
      "SELECT (SELECT count(*)::int FROM public.post_jobs WHERE id = $1) AS jobs, (SELECT count(*)::int FROM public.film_exports WHERE id = $2) AS exports",
      [job.id, exp.id],
    );
    assert.deepEqual(rows[0], { jobs: 1, exports: 1 });
  });

  test("0010 refuses to apply over a row that breaks the new rules", async () => {
    const db = await freshDb({ with0010: false });
    const ids = await seed(db);
    await insert(
      db,
      "film_exports",
      filmExport(ids, {
        storage_prefix: "exports/x/../../v1/",
        video_vertical_path: "exports/x/../../v1/a.mp4",
      }),
    );
    await refused(db.exec(M0010), /film_exports_paths_contained/);
  });
});

describe("F1 storage paths stay inside their folder", () => {
  test("SQL path rule matches the shared corpus", async () => {
    const db = await freshDb();
    for (const c of PATHS) {
      const { rows } = await db.query("SELECT public.auto_engine_is_safe_path($1, $2) AS ok", [
        c.path,
        c.root,
      ]);
      assert.equal(rows[0].ok, c.ok, `${c.root} ${c.path}`);
    }
  });

  test("an export path with '..' or outside its own folder is refused", async () => {
    const db = await freshDb();
    const ids = await seed(db);
    const p = `exports/${ids.story}/v1/`;
    for (const bad of [
      { video_vertical_path: `${p}../../../videos/clip.mp4` },
      { video_vertical_path: `exports/${ids.other}/v1/film.mp4` },
      { video_vertical_path: p },
      { video_landscape_path: `exports/${ids.other}/v9/x.mp4` },
      { thumbnail_path: "exports/../thumb.jpg" },
      { subtitles_path: `${p}.hidden.srt` },
      { storage_prefix: "exports//", video_vertical_path: "exports//a.mp4" },
      {
        storage_prefix: `exports/${ids.story}/v1`,
        video_vertical_path: `exports/${ids.story}/v1/a.mp4`,
      },
    ]) {
      await refused(
        insert(db, "film_exports", filmExport(ids, bad)),
        /film_exports_paths_contained/,
        JSON.stringify(bad),
      );
    }
    await insert(
      db,
      "film_exports",
      filmExport(ids, {
        thumbnail_path: `${p}thumb.jpg`,
        video_landscape_path: `${p}film_16x9.mp4`,
      }),
    );
  });

  test("a teaser file must live in teasers/<its export>/", async () => {
    const db = await freshDb();
    const ids = await seed(db);
    const exp = await insert(db, "film_exports", filmExport(ids));
    const base = { export_id: exp.id, kind: "hook", start_ms: 0, end_ms: 5000 };
    await refused(
      insert(db, "teaser_candidates", { ...base, storage_path: "teasers/other-export/t.mp4" }),
      /path_contained/,
    );
    await refused(
      insert(db, "teaser_candidates", { ...base, storage_path: `teasers/${exp.id}/../x.mp4` }),
      /path_contained/,
    );
    await refused(
      insert(db, "teaser_candidates", { ...base, storage_path: `teasers/${exp.id}/` }),
      /path_contained/,
    );
    await insert(db, "teaser_candidates", {
      ...base,
      storage_path: `teasers/${exp.id}/hook-r1.mp4`,
    });
  });
});

describe("F2 episodes are never tied to one film", () => {
  test("an episode job or export with a story_id is refused", async () => {
    const db = await freshDb();
    const ids = await seed(db);
    const episode = {
      subject_type: "episode",
      story_id: ids.story,
      drama_id: ids.drama,
      episode_number: 1,
    };
    await refused(insert(db, "post_jobs", filmJob(ids, episode)), /post_jobs_subject_shape/);
    await refused(
      insert(db, "film_exports", filmExport(ids, episode)),
      /film_exports_subject_shape/,
    );
  });

  test("deleting a film leaves episode jobs and exports intact", async () => {
    const db = await freshDb();
    const ids = await seed(db);
    const episode = {
      subject_type: "episode",
      story_id: null,
      drama_id: ids.drama,
      episode_number: 1,
    };
    await insert(db, "post_jobs", filmJob(ids, episode));
    await insert(
      db,
      "film_exports",
      filmExport(ids, {
        ...episode,
        storage_prefix: "exports/ep1/v1/",
        video_vertical_path: "exports/ep1/v1/e.mp4",
      }),
    );
    await db.query("DELETE FROM public.stories WHERE id = $1", [ids.story]);
    const { rows } = await db.query(
      "SELECT (SELECT count(*)::int FROM public.post_jobs) AS jobs, (SELECT count(*)::int FROM public.film_exports) AS exports",
    );
    assert.deepEqual(rows[0], { jobs: 1, exports: 1 });
  });
});

describe("F3 RLS: admins read, nobody else does, no browser writes", () => {
  const EXPECTED = {
    post_jobs: "Admins can read post jobs",
    film_exports: "Admins can read film exports",
    teaser_candidates: "Admins can read teaser candidates",
  };

  async function policyViolations(db) {
    const { rows } = await db.query(
      `SELECT tablename, policyname, cmd, roles::text AS roles, permissive, qual, with_check
         FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [TABLES],
    );
    const problems = [];
    for (const t of TABLES) {
      const mine = rows.filter((r) => r.tablename === t);
      if (mine.length !== 1) problems.push(`${t}: expected exactly 1 policy, found ${mine.length}`);
      for (const r of mine) {
        if (r.policyname !== EXPECTED[t])
          problems.push(`${t}: unexpected policy "${r.policyname}"`);
        if (r.cmd !== "SELECT") problems.push(`${t}: policy allows ${r.cmd}`);
        if (r.roles !== "{authenticated}") problems.push(`${t}: policy applies to ${r.roles}`);
        if (r.permissive !== "PERMISSIVE") problems.push(`${t}: policy is ${r.permissive}`);
        if (!/^has_role\(auth\.uid\(\), 'admin'::app_role\)$/.test(r.qual ?? ""))
          problems.push(`${t}: condition is ${r.qual}`);
        if (r.with_check !== null) problems.push(`${t}: policy has WITH CHECK`);
      }
    }
    return problems;
  }

  test("exactly one admin-only SELECT policy per table", async () => {
    const db = await freshDb();
    assert.deepEqual(await policyViolations(db), []);
  });

  test("an extra permissive policy is detected (and would leak rows)", async () => {
    const db = await freshDb();
    const ids = await seed(db);
    await insert(db, "post_jobs", filmJob(ids));
    await db.exec(
      `CREATE POLICY "Anyone signed in" ON public.post_jobs FOR SELECT TO authenticated USING (true)`,
    );
    assert.ok((await policyViolations(db)).some((p) => p.includes("Anyone signed in")));
    const leaked = await as(
      db,
      "authenticated",
      MEMBER,
      async () => (await db.query("SELECT count(*)::int n FROM public.post_jobs")).rows[0].n,
    );
    assert.equal(leaked, 1);
  });

  test("RLS is on, non-admins and visitors see nothing, browsers can not write", async () => {
    const db = await freshDb();
    const ids = await seed(db);
    const exp = await insert(db, "film_exports", filmExport(ids));
    await insert(db, "post_jobs", filmJob(ids));
    await insert(db, "teaser_candidates", {
      export_id: exp.id,
      kind: "hook",
      start_ms: 0,
      end_ms: 5000,
    });
    const { rows } = await db.query(
      "SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY($1) ORDER BY relname",
      [TABLES],
    );
    assert.ok(rows.every((r) => r.relrowsecurity === true));
    for (const t of TABLES) {
      const count = async (role, sub) =>
        as(
          db,
          role,
          sub,
          async () => (await db.query(`SELECT count(*)::int n FROM public.${t}`)).rows[0].n,
        );
      assert.equal(await count("authenticated", ADMIN), 1, `${t}: admin reads`);
      assert.equal(await count("authenticated", MEMBER), 0, `${t}: member sees nothing`);
      await refused(count("anon", null), /permission denied/);
      for (const op of [`DELETE FROM public.${t}`, `UPDATE public.${t} SET updated_at = now()`]) {
        await refused(
          as(db, "authenticated", ADMIN, () => db.query(op)),
          /permission denied/,
        );
      }
      const priv = (
        await db.query(
          `SELECT has_table_privilege('anon', $1, 'SELECT') a_sel, has_table_privilege('authenticated', $1, 'INSERT') u_ins,
                has_table_privilege('authenticated', $1, 'UPDATE') u_upd, has_table_privilege('authenticated', $1, 'DELETE') u_del,
                has_table_privilege('authenticated', $1, 'SELECT') u_sel`,
          [`public.${t}`],
        )
      ).rows[0];
      assert.deepEqual(
        priv,
        { a_sel: false, u_ins: false, u_upd: false, u_del: false, u_sel: true },
        t,
      );
    }
  });

  test("the new functions are callable by the server only", async () => {
    const db = await freshDb();
    for (const fn of [
      "public.auto_engine_film_source(uuid)",
      "public.auto_engine_is_safe_path(text, text)",
      "public.auto_engine_is_export_file(text, text)",
      "public.auto_engine_guard_film_export()",
      "public.auto_engine_guard_teaser()",
    ]) {
      const { rows } = await db.query(
        "SELECT has_function_privilege('anon', $1, 'EXECUTE') a, has_function_privilege('authenticated', $1, 'EXECUTE') u",
        [fn],
      );
      assert.deepEqual(rows[0], { a: false, u: false }, fn);
    }
    await refused(
      as(db, "authenticated", ADMIN, () =>
        db.query("SELECT public.auto_engine_film_source(gen_random_uuid())"),
      ),
      /permission denied/,
    );
    await as(db, "service_role", null, () =>
      db.query("SELECT public.auto_engine_film_source(gen_random_uuid())"),
    );
  });
});

describe("F4 the same cut can only be live once", () => {
  test("same manifest and options with a different key is refused", async () => {
    const db = await freshDb();
    const ids = await seed(db);
    await insert(db, "post_jobs", filmJob(ids, { options: '{"aspect":"9:16","music":"dread"}' }));
    await refused(
      insert(db, "post_jobs", filmJob(ids, { options: '{"music":"dread","aspect":"9:16"}' })),
      /post_jobs_one_live_per_input/,
    );
  });

  test("different options or a different subject is a different cut", async () => {
    const db = await freshDb();
    const ids = await seed(db);
    await insert(db, "post_jobs", filmJob(ids, { options: '{"music":"dread"}' }));
    await insert(db, "post_jobs", filmJob(ids, { options: '{"music":"hope"}' }));
    await insert(
      db,
      "post_jobs",
      filmJob(ids, { story_id: ids.other, options: '{"music":"dread"}' }),
    );
  });

  test("a failed job frees its input for a deliberate retry", async () => {
    const db = await freshDb();
    const ids = await seed(db);
    const job = await insert(db, "post_jobs", filmJob(ids));
    await db.query(
      "UPDATE public.post_jobs SET status = 'failed', error_message = 'ffprobe: no video stream' WHERE id = $1",
      [job.id],
    );
    await insert(db, "post_jobs", filmJob(ids));
  });

  test("input_identity is computed by the database, not by the caller", async () => {
    const db = await freshDb();
    const ids = await seed(db);
    await refused(
      insert(db, "post_jobs", filmJob(ids, { input_identity: "forged" })),
      /non-DEFAULT value into column "input_identity"/,
    );
  });
});

describe("F5 F6 F7 one consistent read of a film's sources", () => {
  async function film(db) {
    const ids = await seed(db);
    const gen = async (story, extra = {}) =>
      (await insert(db, "generations", { story_id: story, status: "completed", ...extra })).id;
    const g1 = await gen(ids.story);
    const g2 = await gen(ids.story);
    const foreign = await gen(ids.other);
    await db.query("UPDATE public.generations SET video_url = id || '.mp4'");
    await db.query(
      "UPDATE public.generations SET voiceover_url = id || '-voice.mp3', narration = 'Spoken words.' WHERE id = $1",
      [g1],
    );
    await db.query("UPDATE public.generations SET narration = 'Never spoken.' WHERE id = $1", [g2]);
    await db.query(
      `INSERT INTO storage.objects (bucket_id, name, metadata, version)
       SELECT 'videos', g.video_url, jsonb_build_object('eTag', '"e-' || g.id || '"', 'size', 2000000), 'v1-' || g.id FROM public.generations g
       UNION ALL
       SELECT 'videos', g.voiceover_url, jsonb_build_object('eTag', '"voice-a"', 'size', 99000), 'voice-v1' FROM public.generations g WHERE g.voiceover_url IS NOT NULL`,
    );
    for (const [n, g] of [
      [1, g1],
      [2, g2],
      [3, foreign],
    ]) {
      await db.query(
        "INSERT INTO public.story_scenes (story_id, scene_number, title, narration, generation_id) VALUES ($1, $2, $3, $4, $5)",
        [ids.story, n, `S${n}`, `Scene text ${n}`, g],
      );
    }
    return { ...ids, g1, g2, foreign };
  }
  const source = async (db, story) =>
    as(
      db,
      "service_role",
      null,
      async () =>
        (await db.query("SELECT public.auto_engine_film_source($1) AS s", [story])).rows[0].s,
    );

  test("returns story, scenes in order and exactly the linked clips in one call", async () => {
    const db = await freshDb();
    const f = await film(db);
    const s = await source(db, f.story);
    assert.equal(s.story.title, "QA Homecoming");
    assert.deepEqual(
      s.scenes.map((x) => x.scene_number),
      [1, 2, 3],
    );
    assert.deepEqual(new Set(s.generations.map((g) => g.id)), new Set([f.g1, f.g2, f.foreign]));
    assert.equal(s.generations.find((g) => g.id === f.foreign).story_id, f.other);
    assert.equal(await source(db, "00000000-0000-4000-8000-000000000000"), null);
  });

  test("F6 spoken text is the voice-over's own text, and only when there is a voice-over", async () => {
    const db = await freshDb();
    const f = await film(db);
    const s = await source(db, f.story);
    assert.equal(s.generations.find((g) => g.id === f.g1).spoken_text, "Spoken words.");
    assert.equal(s.generations.find((g) => g.id === f.g2).spoken_text, null);
  });

  test("F7 a re-recorded voice-over changes its revision", async () => {
    const db = await freshDb();
    const f = await film(db);
    const before = (await source(db, f.story)).generations.find((g) => g.id === f.g1).voice_object;
    await db.query(
      "UPDATE storage.objects SET version = 'voice-v2', metadata = jsonb_set(metadata, '{eTag}', '\"voice-b\"'), updated_at = now() WHERE name LIKE '%-voice.mp3'",
    );
    const after = (await source(db, f.story)).generations.find((g) => g.id === f.g1).voice_object;
    assert.equal(before.version, "voice-v1");
    assert.equal(after.version, "voice-v2");
    assert.notEqual(after.etag, before.etag);
    const clip = (await source(db, f.story)).generations.find((g) => g.id === f.g1).clip_object;
    assert.equal(clip.size, 2000000);
  });

  test("a deleted or missing storage object is reported as missing", async () => {
    const db = await freshDb();
    const f = await film(db);
    await db.query("UPDATE storage.objects SET is_delete_marker = true WHERE name = $1", [
      `${f.g2}.mp4`,
    ]);
    const g2 = (await source(db, f.story)).generations.find((g) => g.id === f.g2);
    assert.equal(g2.clip_object, null);
  });
});

describe("F8 F9 film exports: immutable content, bound and attributed approvals", () => {
  test("recorded export content can not change", async () => {
    const db = await freshDb();
    const ids = await seed(db);
    const e = await insert(db, "film_exports", filmExport(ids));
    for (const change of [
      "manifest_hash = repeat('c', 64)",
      "sha256 = repeat('d', 64)",
      "duration_ms = 1000",
      `video_vertical_path = 'exports/${ids.story}/v1/other.mp4'`,
      "manifest = '{\"manifest_version\":3}'",
    ]) {
      await refused(
        db.query(`UPDATE public.film_exports SET ${change} WHERE id = $1`, [e.id]),
        /immutable/,
      );
    }
    await db.query("UPDATE public.film_exports SET status = 'rejected' WHERE id = $1", [e.id]);
  });

  test("approval needs an admin approver and is bound to the exact file and manifest", async () => {
    const db = await freshDb();
    const ids = await seed(db);
    const e = await insert(db, "film_exports", filmExport(ids));
    const approve = (by, sha, hash) =>
      db.query(
        "UPDATE public.film_exports SET status = 'approved', approved_at = now(), approved_by = $2, approved_sha256 = $3, approved_manifest_hash = $4 WHERE id = $1",
        [e.id, by, sha, hash],
      );
    await refused(approve(null, hex("b"), hex("a")), /Only an admin/);
    await refused(approve(MEMBER, hex("b"), hex("a")), /Only an admin/);
    await refused(approve(ADMIN, hex("f"), hex("a")), /approval_bound/);
    await refused(approve(ADMIN, hex("b"), hex("f")), /approval_bound/);
    await approve(ADMIN, hex("b"), hex("a"));
    await refused(
      db.query("UPDATE public.film_exports SET approved_by = $2 WHERE id = $1", [e.id, MEMBER]),
      /can not be rewritten/,
    );
  });

  test("approval details can not be recorded without an approval", async () => {
    const db = await freshDb();
    const ids = await seed(db);
    await refused(
      insert(
        db,
        "film_exports",
        filmExport(ids, { approved_by: ADMIN, approved_at: new Date().toISOString() }),
      ),
      /only recorded together/,
    );
  });

  test("deleting the approver's account keeps who approved", async () => {
    const db = await freshDb();
    const ids = await seed(db);
    const e = await insert(db, "film_exports", filmExport(ids));
    await db.query(
      "UPDATE public.film_exports SET status = 'approved', approved_at = now(), approved_by = $2, approved_by_label = 'admin@example.com', approved_sha256 = sha256, approved_manifest_hash = manifest_hash WHERE id = $1",
      [e.id, ADMIN],
    );
    await db.query("DELETE FROM auth.users WHERE id = $1", [ADMIN]);
    const { rows } = await db.query(
      "SELECT approved_by, approved_by_label, status FROM public.film_exports WHERE id = $1",
      [e.id],
    );
    assert.deepEqual(rows[0], {
      approved_by: ADMIN,
      approved_by_label: "admin@example.com",
      status: "approved",
    });
  });
});

describe("F8 F9 F10 teasers: revisions, reveal gate, range", () => {
  async function teaserDb() {
    const db = await freshDb();
    const ids = await seed(db);
    const exp = await insert(db, "film_exports", filmExport(ids));
    return { db, ids, exp };
  }

  test("every content change is a new revision; status changes are not", async () => {
    const { db, exp } = await teaserDb();
    const t = await insert(db, "teaser_candidates", {
      export_id: exp.id,
      kind: "hook",
      start_ms: 0,
      end_ms: 5000,
      content_revision: 9,
    });
    assert.equal(t.content_revision, 1);
    const rev = async (sql) =>
      (
        await db.query(
          `UPDATE public.teaser_candidates SET ${sql} WHERE id = $1 RETURNING content_revision`,
          [t.id],
        )
      ).rows[0].content_revision;
    assert.equal(await rev("end_ms = 6000"), 2);
    assert.equal(await rev("caption = 'New caption'"), 3);
    assert.equal(await rev("hashtags = ARRAY['#drama']"), 4);
    assert.equal(await rev("status = 'rejected'"), 4);
    assert.equal(await rev("content_revision = 1"), 4);
  });

  test("an approved teaser can not be edited; re-approval must cover the new revision", async () => {
    const { db, exp } = await teaserDb();
    const t = await insert(db, "teaser_candidates", {
      export_id: exp.id,
      kind: "hook",
      start_ms: 0,
      end_ms: 5000,
    });
    await refused(
      db.query("UPDATE public.teaser_candidates SET status = 'approved' WHERE id = $1", [t.id]),
      /approval_bound/,
    );
    await refused(
      db.query(
        "UPDATE public.teaser_candidates SET status = 'approved', approved_at = now(), approved_by = $2, approved_revision = 1 WHERE id = $1",
        [t.id, MEMBER],
      ),
      /Only an admin/,
    );
    await db.query(
      "UPDATE public.teaser_candidates SET status = 'approved', approved_at = now(), approved_by = $2, approved_revision = 1 WHERE id = $1",
      [t.id, ADMIN],
    );
    await refused(
      db.query("UPDATE public.teaser_candidates SET end_ms = 7000 WHERE id = $1", [t.id]),
      /approval_bound/,
    );
    await refused(
      db.query("UPDATE public.teaser_candidates SET approved_by = $2 WHERE id = $1", [
        t.id,
        MEMBER,
      ]),
      /can not be rewritten/,
    );
    await db.query(
      "UPDATE public.teaser_candidates SET status = 'candidate', end_ms = 7000 WHERE id = $1",
      [t.id],
    );
    await refused(
      db.query("UPDATE public.teaser_candidates SET status = 'approved' WHERE id = $1", [t.id]),
      /approval_bound/,
    );
    await db.query(
      "UPDATE public.teaser_candidates SET status = 'approved', approved_at = now(), approved_by = $2, approved_revision = 2 WHERE id = $1",
      [t.id, ADMIN],
    );
  });

  test("a reveal teaser needs an admin reveal approval for its current revision", async () => {
    const { db, exp } = await teaserDb();
    const t = await insert(db, "teaser_candidates", {
      export_id: exp.id,
      kind: "cliffhanger",
      start_ms: 0,
      end_ms: 9000,
      includes_reveal: true,
    });
    const approveCut = (rev) =>
      `status = 'approved', approved_at = now(), approved_by = '${ADMIN}', approved_revision = ${rev}`;
    await refused(
      db.query(`UPDATE public.teaser_candidates SET ${approveCut(1)} WHERE id = $1`, [t.id]),
      /reveal_bound/,
    );
    await refused(
      db.query(
        `UPDATE public.teaser_candidates SET ${approveCut(1)}, reveal_approved_at = now(), reveal_approved_by = $2, reveal_approved_revision = 1 WHERE id = $1`,
        [t.id, MEMBER],
      ),
      /Only an admin/,
    );
    await db.query(
      `UPDATE public.teaser_candidates SET ${approveCut(1)}, reveal_approved_at = now(), reveal_approved_by = $2, reveal_approved_revision = 1 WHERE id = $1`,
      [t.id, ADMIN],
    );
    await db.query(
      "UPDATE public.teaser_candidates SET status = 'candidate', start_ms = 1000 WHERE id = $1",
      [t.id],
    );
    await refused(
      db.query(`UPDATE public.teaser_candidates SET ${approveCut(2)} WHERE id = $1`, [t.id]),
      /reveal_bound/,
    );
  });

  test("deleting the approver's account keeps who approved the reveal", async () => {
    const { db, exp } = await teaserDb();
    const t = await insert(db, "teaser_candidates", {
      export_id: exp.id,
      kind: "cliffhanger",
      start_ms: 0,
      end_ms: 9000,
      includes_reveal: true,
    });
    await db.query(
      "UPDATE public.teaser_candidates SET reveal_approved_at = now(), reveal_approved_by = $2, reveal_approved_by_label = 'admin@example.com', reveal_approved_revision = 1 WHERE id = $1",
      [t.id, ADMIN],
    );
    await db.query("DELETE FROM auth.users WHERE id = $1", [ADMIN]);
    const { rows } = await db.query(
      "SELECT reveal_approved_by, reveal_approved_by_label FROM public.teaser_candidates WHERE id = $1",
      [t.id],
    );
    assert.deepEqual(rows[0], {
      reveal_approved_by: ADMIN,
      reveal_approved_by_label: "admin@example.com",
    });
  });

  test("F10 a cut must end inside its export, on insert and on update", async () => {
    const { db, exp } = await teaserDb();
    await refused(
      insert(db, "teaser_candidates", {
        export_id: exp.id,
        kind: "hook",
        start_ms: 0,
        end_ms: 25001,
      }),
      /after its export ends/,
    );
    await refused(
      insert(db, "teaser_candidates", {
        export_id: exp.id,
        kind: "hook",
        start_ms: 30000,
        end_ms: 31000,
      }),
      /after its export ends/,
    );
    const t = await insert(db, "teaser_candidates", {
      export_id: exp.id,
      kind: "hook",
      start_ms: 20000,
      end_ms: 25000,
    });
    await refused(
      db.query("UPDATE public.teaser_candidates SET end_ms = 26000 WHERE id = $1", [t.id]),
      /after its export ends/,
    );
  });
});

describe("F11 generated Supabase types match the database", () => {
  function block(source, startMarker) {
    const start = source.indexOf(startMarker);
    assert.ok(start >= 0, `missing ${startMarker.trim()}`);
    let depth = 0;
    for (let i = source.indexOf("{", start); i < source.length; i++) {
      if (source[i] === "{") depth++;
      if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
    }
    throw new Error("unbalanced");
  }
  const keys = (text) => [...text.matchAll(/^\s+([a-z_0-9]+)\??: /gm)].map((m) => m[1]);

  test("every column of the three tables is typed, with the generated column read-only", async () => {
    const db = await freshDb();
    for (const t of TABLES) {
      const table = block(TYPES, `      ${t}: {`);
      const row = keys(block(table, "        Row: {")).filter((k) => k !== "Row");
      const insertBlock = block(table, "        Insert: {");
      const { rows } = await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY column_name",
        [t],
      );
      assert.deepEqual(
        row,
        rows.map((r) => r.column_name),
        `${t} Row`,
      );
      if (t === "post_jobs") {
        assert.match(insertBlock, /input_identity\?: never/);
        assert.match(block(table, "        Update: {"), /input_identity\?: never/);
      }
    }
  });

  test("the server-only source function is typed", () => {
    const fns = block(TYPES, "    Functions: {");
    assert.match(
      fns,
      /auto_engine_film_source: \{ Args: \{ _story_id: string \}; Returns: Json \}/,
    );
  });
});
