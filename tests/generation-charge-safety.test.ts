import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GenerationStartError, withCharge, type CoinPort } from "@/lib/coin-charge";
import { startGeneration } from "@/lib/storyreel-core.server";
import { dbCoins, refundGeneration } from "@/lib/coins.server";

const mock = vi.hoisted(() => ({
  from: (_table: string): unknown => { throw new Error("Database not initialized"); },
  rpc: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: mock }));

type Job = {
  id: string;
  story_id: string | null;
  scene_number: number | null;
  status: string;
  refunded: boolean;
  charged_bonus: number;
  charged_paid: number;
};
let jobs: Job[];
let balance: { bonus: number; paid: number };
let refundFails: boolean;
let coinRefundFails: boolean;

beforeEach(async () => {
  // Warm the mocked dynamic module before exercising concurrent starts.
  await import("@/integrations/supabase/client.server");
  vi.clearAllMocks();
  jobs = [];
  balance = { bonus: 10, paid: 90 };
  refundFails = false;
  coinRefundFails = false;
  vi.stubEnv("LOVABLE_API_KEY", "mock-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ id: "mock-provider-job" })),
  );
  mock.rpc.mockImplementation(async (name: string, args: Record<string, number | string>) => {
    if (name === "spend_coins") {
      const cost = Number(args._cost);
      if (balance.bonus + balance.paid < cost) return { data: [], error: null };
      const bonus = Math.min(balance.bonus, cost);
      balance.bonus -= bonus;
      balance.paid -= cost - bonus;
      return { data: [{ bonus_spent: bonus, paid_spent: cost - bonus }], error: null };
    }
    if (name === "refund_coins") {
      if (coinRefundFails) return { error: { code: "mock-refund-error" } };
      balance.bonus += Number(args._bonus);
      balance.paid += Number(args._paid);
      return { error: null };
    }
    if (name !== "refund_generation") throw new Error("Unexpected RPC");
    if (refundFails) return { error: { code: "mock-refund-error" } };
    const row = jobs.find((job) => job.id === args._generation);
    if (!row || row.refunded || row.status !== "failed") return { data: false, error: null };
    row.refunded = true;
    balance.bonus += row.charged_bonus;
    balance.paid += row.charged_paid;
    return { data: true, error: null };
  });
  mock.from = (table: string) => {
    if (table !== "generations") throw new Error("Unexpected table");
    let insertion: Omit<Job, "id" | "refunded"> | undefined;
    let update: Partial<Job> | undefined;
    let id: string | undefined;
    let statuses: string[] | undefined;
    const applyUpdate = () => {
      const row = jobs.find((job) => job.id === id);
      if (row && update && (!statuses || statuses.includes(row.status))) Object.assign(row, update);
      return { error: null };
    };
    const chain = {
      insert: (value: typeof insertion) => {
        insertion = value;
        return chain;
      },
      select: () => chain,
      single: async () => {
        if (!insertion) throw new Error("Missing insert");
        const value = insertion;
        console.info("insert trace", value.story_id, value.scene_number, jobs.map((job) => [job.id, job.status, job.story_id, job.scene_number]));
        if (
          jobs.some(
            (job) =>
              job.story_id === value.story_id &&
              job.scene_number === value.scene_number &&
              ["queued", "processing"].includes(job.status),
          )
        ) {
          return {
            data: null,
            error: {
              code: "23505",
              message:
                'duplicate key violates unique constraint "generations_one_inflight_per_scene"',
            },
          };
        }
        const row = { ...value, id: `generation-${jobs.length + 1}`, refunded: false };
        jobs.push(row);
        return { data: { id: row.id }, error: null };
      },
      update: (value: Partial<Job>) => {
        update = value;
        return chain;
      },
      eq: (_key: string, value: string) => {
        id = value;
        return chain;
      },
      in: (_key: string, value: string[]) => {
        statuses = value;
        return chain;
      },
      then: (resolve: (value: { error: null }) => unknown) =>
        Promise.resolve(applyUpdate()).then(resolve),
    };
    return chain;
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const start = (port: CoinPort = dbCoins) =>
  withCharge(port, "owner", 14, (charge) =>
    startGeneration({
      session_id: "session",
      idea: "scene",
      style: "cinematic",
      prompt: "scene",
      audio: false,
      story_id: "film",
      scene_number: 1,
      user_id: "owner",
      charged_bonus: charge.bonus,
      charged_paid: charge.paid,
    }),
  );

describe("generation charge safety (behavioral, fake database and transport)", () => {
  it("two simultaneous scene starts create one job and one net 14-credit debit", async () => {
    // A serializable ledger port avoids Vitest's concurrent async RPC-mock dispatch.
    const port: CoinPort = {
      ...dbCoins,
      spend: async () => {
        const bonus = Math.min(balance.bonus, 14);
        balance.bonus -= bonus;
        balance.paid -= 14 - bonus;
        return { bonus, paid: 14 - bonus };
      },
    };
    const results = await Promise.allSettled([start(port), start(port)]);
    console.info("result trace", results, jobs);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason.message).toBe(
      "This scene is already rendering. / Scenen renderas redan.",
    );
    expect(jobs).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(balance.bonus + balance.paid).toBe(86);
    expect(mock.rpc.mock.calls.filter(([name]) => name === "refund_coins")).toHaveLength(1);
  });

  it.each(["completed", "failed"])("allows a new job after %s", async (status) => {
    await start();
    const previous = jobs[0];
    if (!previous) throw new Error("Missing job");
    previous.status = status;
    await start();
    expect(jobs).toHaveLength(2);
    expect(jobs[1]?.status).toBe("processing");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("refunds a persisted rejected start only through refund_generation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ message: "Provider rejected" }, { status: 400 })),
    );
    await expect(start()).rejects.toBeInstanceOf(GenerationStartError);
    expect(jobs[0]?.refunded).toBe(true);
    expect(balance).toEqual({ bonus: 10, paid: 90 });
    expect(mock.rpc.mock.calls.some(([name]) => name === "refund_coins")).toBe(false);
  });

  it("two simultaneous refunds restore the exact bonus/paid split once", async () => {
    await start();
    const row = jobs[0];
    if (!row) throw new Error("Missing job");
    row.status = "failed";
    expect(await Promise.all([refundGeneration(row.id), refundGeneration(row.id)])).toEqual([
      true,
      false,
    ]);
    expect(balance).toEqual({ bonus: 10, paid: 90 });
  });

  it("failed generation refund stays unrefunded, surfaces the error, and can be retried", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    refundFails = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({}, { status: 400 })),
    );
    await expect(start()).rejects.toThrow("Credits kunde inte återbetalas");
    expect(jobs[0]?.status).toBe("failed");
    expect(jobs[0]?.refunded).toBe(false);
    expect(balance.bonus + balance.paid).toBe(86);
    expect(log).toHaveBeenCalledWith(
      "refund_generation failed",
      expect.objectContaining({ code: "mock-refund-error" }),
    );
    refundFails = false;
    expect(await refundGeneration(jobs[0]?.id ?? "missing")).toBe(true);
    expect(balance).toEqual({ bonus: 10, paid: 90 });
    log.mockRestore();
  });

  it("an insert-failure refund_coins error is not swallowed", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await start();
    coinRefundFails = true;
    await expect(start()).rejects.toThrow("Credits kunde inte återbetalas");
    expect(log).toHaveBeenCalledWith(
      "refund_coins failed",
      expect.objectContaining({ code: "mock-refund-error" }),
    );
    expect(jobs).toHaveLength(1);
    log.mockRestore();
  });
});
