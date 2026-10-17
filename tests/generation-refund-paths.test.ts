import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  progress: vi.fn(),
  render: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: mocks }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/vibe.functions", () => ({ STORYREEL_DRAMA_ID: "drama" }));
vi.mock("@/lib/storyreel-core.server", () => ({
  providerProgress: mocks.progress,
  BUCKET: "videos",
}));
vi.mock("@/lib/film.functions", () => ({ renderSceneCore: mocks.render }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      inputValidator: () => chain,
      handler: (fn: (args: unknown) => unknown) => fn,
    };
    return chain;
  },
}));

import { checkStatus } from "@/lib/storyreel.functions";
import { runFilmTick } from "@/lib/scene-job.server";

let row: {
  id: string;
  story_id: string;
  status: string;
  error_message: string | null;
  video_url: null;
  refunded: boolean;
  user_id: string;
  charged_bonus: number;
  charged_paid: number;
  attempts: number;
  deadline_at: string;
  fal_request_id: string;
};
let refundFails: boolean;
let credited: number;
let updates: Record<string, unknown>[];
let cron: boolean;
let retryAvailable: boolean;

beforeEach(() => {
  vi.clearAllMocks();
  refundFails = false;
  credited = 0;
  updates = [];
  cron = false;
  retryAvailable = false;
  row = {
    id: "generation",
    story_id: "film",
    user_id: "owner",
    status: "processing",
    error_message: null,
    video_url: null,
    refunded: false,
    charged_bonus: 4,
    charged_paid: 10,
    attempts: 1,
    deadline_at: "2026-10-17T12:00:00Z",
    fal_request_id: "job",
  };
  mocks.progress.mockResolvedValue({ state: "failed", message: "Provider failed" });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name !== "refund_generation") throw new Error("Unexpected RPC");
    if (refundFails) return { data: null, error: { code: "mock-failure" } };
    if (row.refunded || row.status !== "failed") return { data: false, error: null };
    row.refunded = true;
    credited += 14;
    return { data: true, error: null };
  });
  mocks.from.mockImplementation((table: string) => {
    let update: Record<string, unknown> | undefined;
    let statuses: string[] | undefined;
    let refundFilter = false;
    const result = () => {
      if (update) {
        updates.push(update);
        if (!statuses || statuses.includes(row.status)) {
          Object.assign(row, update);
          return { data: [{ id: row.id }], error: null };
        }
        return { data: [], error: null };
      }
      if (table === "story_scenes")
        return { data: retryAvailable ? { id: "scene" } : null, error: null };
      if (table === "stories")
        return {
          data: retryAvailable ? { id: "film", session_id: "session", user_id: "owner" } : null,
          error: null,
        };
      if (refundFilter)
        return {
          data: row.status === "failed" && !row.refunded ? [{ id: row.id }] : [],
          error: null,
        };
      if (statuses) return { data: statuses.includes(row.status) ? [{ ...row }] : [], error: null };
      return { data: cron ? [] : { ...row }, error: null };
    };
    const chain = {
      select: () => chain,
      update: (value: Record<string, unknown>) => {
        update = value;
        return chain;
      },
      eq: (key: string, value: unknown) => {
        if (key === "refunded" && value === false) refundFilter = true;
        return chain;
      },
      in: (_key: string, value: string[]) => {
        statuses = value;
        return chain;
      },
      not: () => chain,
      is: () => chain,
      or: () => chain,
      order: () => chain,
      limit: () => chain,
      single: async () => result(),
      maybeSingle: async () => result(),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) =>
        Promise.resolve(result()).then(resolve),
    };
    return chain;
  });
});

const poll = () =>
  (checkStatus as unknown as (args: unknown) => Promise<{ error_message: string }>)({
    data: { generation_id: row.id, session_id: "session" },
  });

describe("refund failure paths (behavioral, mocked database only)", () => {
  it("checkStatus conditionally fails then atomically refunds, never premarks refunded", async () => {
    await poll();
    expect(row.status).toBe("failed");
    expect(row.refunded).toBe(true);
    expect(credited).toBe(14);
    expect(updates).toEqual([{ status: "failed", error_message: "Provider failed" }]);
    await poll();
    expect(credited).toBe(14);
  });

  it("checkStatus shows a failed refund and retries it on the next failed-job poll", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    refundFails = true;
    expect((await poll()).error_message).toContain("Credits kunde inte återbetalas");
    expect(row.refunded).toBe(false);
    expect(credited).toBe(0);
    refundFails = false;
    await poll();
    expect(row.refunded).toBe(true);
    expect(credited).toBe(14);
    log.mockRestore();
  });

  it("cron settles an expired job through refund_generation without premarking refunded", async () => {
    cron = true;
    await runFilmTick(new Date("2026-10-17T12:30:00Z"));
    expect(row.refunded).toBe(true);
    expect(credited).toBe(14);
    expect(updates.every((update) => !("refunded" in update))).toBe(true);
    expect(mocks.progress).not.toHaveBeenCalled();
  });

  it("cron refund error is surfaced and the next tick can refund the failed row", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    cron = true;
    refundFails = true;
    await expect(runFilmTick(new Date("2026-10-17T12:30:00Z"))).rejects.toThrow(
      "Credits kunde inte återbetalas",
    );
    expect(row.status).toBe("failed");
    expect(row.refunded).toBe(false);
    expect(mocks.render).not.toHaveBeenCalled();
    refundFails = false;
    await runFilmTick();
    expect(row.refunded).toBe(true);
    expect(credited).toBe(14);
    log.mockRestore();
  });

  it("cron can retry after the old row is failed and refunded", async () => {
    cron = true;
    retryAvailable = true;
    mocks.render.mockImplementation(async () => {
      expect(row.status).toBe("failed");
      expect(row.refunded).toBe(true);
    });
    const report = await runFilmTick(new Date("2026-10-17T12:30:00Z"));
    expect(report.retried).toBe(1);
    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({ scene_id: "scene", attempt: 2 }),
    );
  });
});
