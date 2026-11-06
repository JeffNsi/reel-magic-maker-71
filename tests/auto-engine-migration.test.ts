import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Auto Engine step 1 migration (source checks, not SQL execution). It was also
 * executed twice against a local Postgres with RLS during development; these
 * checks keep its guarantees from regressing.
 */
const sql = readFileSync("drizzle/migrations/0009_auto_engine_step1.sql", "utf8");
const journal = JSON.parse(readFileSync("drizzle/migrations/meta/_journal.json", "utf8")) as {
  entries: { idx: number; tag: string }[];
};
const TABLES = ["post_jobs", "film_exports", "teaser_candidates"];
const code = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("auto engine migration 0009", () => {
  it("is registered as the next migration in the journal", () => {
    const last = journal.entries.at(-1);
    expect(last).toMatchObject({ idx: 9, tag: "0009_auto_engine_step1" });
    expect(journal.entries.map((e) => e.idx)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("is additive: it never alters, drops or truncates an existing table", () => {
    expect(code).not.toMatch(/\bALTER TABLE public\.(?!post_jobs|film_exports|teaser_candidates)/);
    expect(code).not.toMatch(
      /\bDROP TABLE\b|\bTRUNCATE\b|\bDROP COLUMN\b|\bDELETE FROM\b|\bUPDATE public\./,
    );
    expect(code).not.toMatch(/CREATE OR REPLACE FUNCTION/);
  });

  it("is idempotent, so applying it twice is safe", () => {
    for (const t of TABLES) {
      expect(code).toContain(`CREATE TABLE IF NOT EXISTS public.${t} (`);
      expect(code).toContain(`DROP TRIGGER IF EXISTS ${t}_set_updated_at ON public.${t};`);
    }
    expect(code.match(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/g)).toBeNull();
    expect(code.match(/CREATE POLICY/g)?.length).toBe(code.match(/DROP POLICY IF EXISTS/g)?.length);
  });

  it("lets admins read and nobody in a browser write", () => {
    for (const t of TABLES) {
      expect(code).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
    }
    expect(code).toContain(
      "REVOKE ALL ON public.post_jobs, public.film_exports, public.teaser_candidates FROM anon, authenticated;",
    );
    expect(code).toContain(
      "GRANT SELECT ON public.post_jobs, public.film_exports, public.teaser_candidates TO authenticated;",
    );
    expect(code.match(/USING \(public\.has_role\(auth\.uid\(\), 'admin'\)\)/g)).toHaveLength(3);
    expect(code).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/);
    expect(code).not.toMatch(/TO anon/);
  });

  it("never reports a job as done without proof, and never queues the same input twice", () => {
    expect(code).toContain(
      "status <> 'succeeded' OR (progress = 100 AND result IS NOT NULL AND finished_at IS NOT NULL)",
    );
    expect(code).toContain("CHECK (status <> 'failed' OR error_message IS NOT NULL)");
    expect(code).toContain("WHERE status IN ('queued', 'running', 'succeeded');");
    expect(code).toContain("size_bytes bigint NOT NULL CHECK (size_bytes > 0)");
    expect(code).toContain("sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$')");
  });

  it("keeps exports away from the original clips and teasers behind the reveal gate", () => {
    expect(code).toContain(
      "video_vertical_path text NOT NULL CHECK (video_vertical_path LIKE 'exports/%')",
    );
    expect(code).toContain(
      "NOT includes_reveal OR status IN ('candidate', 'rejected') OR reveal_approved_at IS NOT NULL",
    );
  });

  it("supports both single films and multi-film episodes", () => {
    expect(
      code.match(/subject_type text NOT NULL CHECK \(subject_type IN \('film', 'episode'\)\)/g),
    ).toHaveLength(2);
    expect(code).toContain(
      "ON public.film_exports (drama_id, episode_number, version) WHERE subject_type = 'episode';",
    );
  });
});
