import { beforeEach, describe, expect, it, vi } from "vitest";

type Gen = {
  id: string;
  status: string;
  provider_checked_at: string | null;
  video_url: string | null;
};
const db = vi.hoisted(() => ({ gen: null as unknown as Gen }));

function builder() {
  let patch: Partial<Gen> | null = null;
  const filters: ((g: Gen) => boolean)[] = [];
  const b = {
    update(p: Partial<Gen>) {
      patch = p;
      return b;
    },
    select() {
      return b;
    },
    eq(k: keyof Gen, v: unknown) {
      filters.push((g) => g[k] === v);
      return b;
    },
    in(k: keyof Gen, vs: unknown[]) {
      filters.push((g) => vs.includes(g[k]));
      return b;
    },
    or(expr: string) {
      const cutoff = expr.split("lt.")[1];
      filters.push((g) => g.provider_checked_at === null || g.provider_checked_at < cutoff);
      return b;
    },
    then(res: (v: { data: { id: string }[] }) => void) {
      const ok = filters.every((f) => f(db.gen));
      if (ok && patch) Object.assign(db.gen, patch);
      res({ data: ok ? [{ id: db.gen.id }] : [] });
    },
  };
  return b;
}
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => builder() },
}));

import { claimProviderCheck, PROVIDER_CHECK_INTERVAL_MS } from "@/lib/scene-job.server";

beforeEach(() => {
  db.gen = { id: "g", status: "processing", provider_checked_at: null, video_url: null };
});

describe("provider-check throttle", () => {
  it("two polls at the same moment: exactly one may ask the provider", async () => {
    const now = new Date("2026-11-06T19:00:00Z");
    const [a, b] = await Promise.all([claimProviderCheck("g", now), claimProviderCheck("g", now)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });
  it("a new check is allowed again after 10 seconds", async () => {
    const t0 = new Date("2026-11-06T19:00:00Z");
    expect(PROVIDER_CHECK_INTERVAL_MS).toBe(10_000);
    expect(await claimProviderCheck("g", t0)).toBe(true);
    expect(await claimProviderCheck("g", new Date(t0.getTime() + 5_000))).toBe(false);
    expect(await claimProviderCheck("g", new Date(t0.getTime() + 11_000))).toBe(true);
  });
  it("a failed or completed job is never checked", async () => {
    db.gen.status = "failed";
    expect(await claimProviderCheck("g")).toBe(false);
  });
});
