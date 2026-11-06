import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Auto Engine migrations 0009 + 0010 (source checks). Their behaviour is
 * executed against a real Postgres in auto-engine/db-verify (npm test there);
 * these checks keep the guarantees and the migration history from regressing
 * in the main suite.
 */
const read = (path: string) => readFileSync(path, "utf8");
const strip = (sql: string) =>
  sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

const M0009_PATH = "drizzle/migrations/0009_auto_engine_step1.sql";
const M0010_PATH = "drizzle/migrations/0010_auto_engine_review_fixes.sql";
const m0009 = strip(read(M0009_PATH));
const m0010 = strip(read(M0010_PATH));
const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json")) as {
  entries: { idx: number; tag: string; when: number }[];
};
const snapshot = (n: string) =>
  JSON.parse(read(`drizzle/migrations/meta/${n}_snapshot.json`)) as { id: string; prevId: string };
const TABLES = ["post_jobs", "film_exports", "teaser_candidates"];
const TABLE_RE = TABLES.join("|");

/** Every migration file in the repository, in both migration folders. */
const allMigrations = [
  ...readdirSync("supabase/migrations").map((f) => `supabase/migrations/${f}`),
  ...readdirSync("drizzle/migrations")
    .filter((f) => f.endsWith(".sql"))
    .map((f) => `drizzle/migrations/${f}`),
].map((path) => ({ path, sql: strip(read(path)) }));

describe("migration history", () => {
  it("0009 is applied in Lovable Cloud and stays byte-for-byte unchanged", () => {
    const sha = createHash("sha256").update(read(M0009_PATH)).digest("hex");
    expect(sha).toBe("f11d361e970d9fc6d3f5e0cc77e8c1b786f518e47e7e857cb7945fa2ee64e697");
  });

  it("0010 is the next migration, chained after 0009", () => {
    expect(journal.entries.map((e) => e.idx)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(journal.entries.at(-2)).toMatchObject({ idx: 9, tag: "0009_auto_engine_step1" });
    expect(journal.entries.at(-1)).toMatchObject({ idx: 10, tag: "0010_auto_engine_review_fixes" });
    const whens = journal.entries.map((e) => e.when);
    expect([...whens].sort((a, b) => a - b)).toEqual(whens);
    expect(snapshot("0010").prevId).toBe(snapshot("0009").id);
    expect(snapshot("0009").prevId).toBe(snapshot("0008").id);
  });
});

describe("0010 is forward-only and safe on the live database", () => {
  it("never creates or drops tables and only alters the three Auto Engine tables", () => {
    expect(m0010).not.toMatch(/\bCREATE TABLE\b|\bDROP TABLE\b|\bTRUNCATE\b|\bDROP COLUMN\b/);
    expect(m0010).not.toMatch(/\bDELETE FROM\b|\bUPDATE public\.|\bINSERT INTO\b/);
    for (const m of m0010.matchAll(/ALTER TABLE public\.(\w+)/g)) {
      expect(TABLES).toContain(m[1]);
    }
  });

  it("only defines its own auto_engine_* functions, never replacing existing ones", () => {
    const fns = [...m0010.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)].map((m) => m[1]);
    expect(fns.length).toBeGreaterThan(0);
    for (const fn of fns) expect(fn).toMatch(/^auto_engine_/);
  });

  it("is idempotent: every constraint, trigger and index can be re-created", () => {
    for (const m of m0010.matchAll(/ADD CONSTRAINT (\w+)/g)) {
      expect(m0010).toContain(`DROP CONSTRAINT IF EXISTS ${m[1]};`);
    }
    for (const m of m0010.matchAll(/CREATE TRIGGER (\w+)/g)) {
      expect(m0010).toContain(`DROP TRIGGER IF EXISTS ${m[1]} `);
    }
    expect(m0010.match(/ADD COLUMN (?!IF NOT EXISTS)/g)).toBeNull();
    expect(m0010.match(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/g)).toBeNull();
  });
});

describe("F3 access across every migration in the repository", () => {
  it("the three tables have exactly the three admin-only SELECT policies", () => {
    const policies = allMigrations.flatMap(({ path, sql }) =>
      [
        ...sql.matchAll(
          new RegExp(`CREATE POLICY "([^"]+)"\\s+ON public\\.(${TABLE_RE})\\s+([^;]+);`, "g"),
        ),
      ].map((m) => ({ path, name: m[1], table: m[2], body: m[3]?.replace(/\s+/g, " ").trim() })),
    );
    expect(policies.map((p) => `${p.table}: ${p.name} | ${p.body}`).sort()).toEqual([
      "film_exports: Admins can read film exports | FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'))",
      "post_jobs: Admins can read post jobs | FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'))",
      "teaser_candidates: Admins can read teaser candidates | FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'))",
    ]);
  });

  it("no migration loosens them: no policy changes, RLS switches or browser write grants", () => {
    for (const { path, sql } of allMigrations) {
      const where = { path };
      expect({
        ...where,
        hit: sql.match(new RegExp(`ALTER POLICY [^;]+ON public\\.(${TABLE_RE})\\b`)),
      }).toEqual({ ...where, hit: null });
      expect({
        ...where,
        hit: sql.match(new RegExp(`public\\.(${TABLE_RE}) (DISABLE|NO FORCE) ROW LEVEL SECURITY`)),
      }).toEqual({ ...where, hit: null });
      for (const grant of sql.matchAll(/GRANT ([^;]+) ON ([^;]+) TO ([^;]+);/g)) {
        const [, what = "", on = "", to = ""] = grant;
        if (!new RegExp(`public\\.(${TABLE_RE})\\b`).test(on)) continue;
        if (/\banon\b/.test(to)) throw new Error(`${path}: grants ${what} to anon`);
        if (/\bauthenticated\b/.test(to))
          expect({ path, what: what.trim() }).toEqual({ path, what: "SELECT" });
      }
    }
  });

  it("the server-only source function can not be called from a browser", () => {
    expect(m0010).toContain("LANGUAGE sql STABLE SECURITY DEFINER\nSET search_path = ''");
    expect(m0010).toContain(
      "REVOKE ALL ON FUNCTION public.auto_engine_film_source(uuid) FROM PUBLIC, anon, authenticated;",
    );
    expect(m0010).toContain(
      "GRANT EXECUTE ON FUNCTION public.auto_engine_film_source(uuid) TO service_role;",
    );
    expect(m0010.match(/SECURITY DEFINER/g)).toHaveLength(1);
    expect(m0010).not.toMatch(/GRANT EXECUTE ON FUNCTION [^;]+ TO [^;]*(anon|authenticated)/);
  });
});

describe("0010 rules for each review finding", () => {
  it("F1 paths: no '..', strict segments, files inside their folder", () => {
    expect(m0010).toContain("AND position('..' IN _path) = 0");
    expect(m0010).toContain("(/[A-Za-z0-9_][A-Za-z0-9._-]{0,127})+/?$");
    expect(m0010).toContain("ADD CONSTRAINT film_exports_paths_contained CHECK");
    expect(m0010).toContain("starts_with(storage_path, 'teasers/' || export_id::text || '/')");
  });

  it("F2 an episode's story_id must be NULL in jobs and exports", () => {
    expect(
      m0010.match(
        /subject_type = 'episode' AND story_id IS NULL AND drama_id IS NOT NULL AND episode_number IS NOT NULL/g,
      ),
    ).toHaveLength(2);
  });

  it("F4 live-job uniqueness is on the input identity computed by the database", () => {
    expect(m0010).toContain(
      "ADD COLUMN IF NOT EXISTS input_identity text\n  GENERATED ALWAYS AS (",
    );
    expect(m0010).toContain("|| ':' || md5(options::text)");
    expect(m0010).toContain(
      "ON public.post_jobs (input_identity)\n  WHERE status IN ('queued', 'running', 'succeeded');",
    );
  });

  it("F8 F9 approvals are bound to the content they cover and attributed to an admin", () => {
    expect(m0010).toContain("approved_sha256 = sha256");
    expect(m0010).toContain("approved_manifest_hash = manifest_hash");
    expect(m0010).toContain("approved_revision = content_revision");
    expect(m0010).toContain("reveal_approved_revision = content_revision");
    expect(m0010.match(/public\.has_role\(NEW\.\w+, 'admin'::public\.app_role\)/g)).toHaveLength(3);
    expect(m0010).toContain("DROP CONSTRAINT IF EXISTS film_exports_approved_by_fkey;");
    expect(m0010).toContain("DROP CONSTRAINT IF EXISTS teaser_candidates_reveal_approved_by_fkey;");
    expect(m0010).toContain("A film export is immutable; record a new version instead.");
  });

  it("F10 a teaser must end inside its export", () => {
    expect(m0010).toContain("IF NEW.end_ms > export_ms THEN");
  });

  it("0009 itself still creates the three tables with RLS (unchanged history)", () => {
    for (const t of TABLES) {
      expect(m0009).toContain(`CREATE TABLE IF NOT EXISTS public.${t} (`);
      expect(m0009).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
    }
  });
});
