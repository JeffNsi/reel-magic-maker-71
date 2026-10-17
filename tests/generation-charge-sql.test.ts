import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("drizzle/migrations/0005_generation_charge_safety.sql", "utf8");
describe("generation safety migration (source checks, not SQL execution)", () => {
  it("limits the unique scene index to queued/processing film jobs", () => {
    expect(sql).toContain("ON public.generations (story_id, scene_number)");
    expect(sql).toContain("WHERE status IN ('queued','processing') AND story_id IS NOT NULL");
  });
  it("claims and credits exact recorded amounts in one statement and rejects missing profiles", () => {
    expect(sql).toContain("AND refunded = false");
    expect(sql).toContain("AND charged_bonus + charged_paid > 0");
    expect(sql).toContain("WITH claimed AS (");
    expect(sql).toContain("), credited AS (");
    expect(sql).toContain("bonus_coins = p.bonus_coins + c.charged_bonus");
    expect(sql).toContain("paid_coins = p.paid_coins + c.charged_paid");
    expect(sql).toContain("IF claimed_count <> credited_count THEN");
  });
  it("keeps the security-definer refund callable only by service_role", () => {
    expect(sql).toContain("SECURITY DEFINER\nSET search_path = public");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.refund_generation(uuid) TO service_role",
    );
  });
});
