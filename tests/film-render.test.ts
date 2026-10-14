import { describe, expect, it, vi } from "vitest";
import { NeedsCreditsError } from "@/lib/coin-charge";
import { orchestrateFilmRender } from "@/lib/film-render";
import type { SceneJobState } from "@/lib/scene-job";

const s = (id: string, status: SceneJobState["status"], has_clip = false): SceneJobState => ({
  scene_id: id,
  status,
  has_clip,
});

describe("orchestrateFilmRender (behavioral, mocked start)", () => {
  it("skips scenes in flight or done and starts the rest", async () => {
    const start = vi.fn(async () => {});
    const out = await orchestrateFilmRender({
      scenes: [s("a", "completed", true), s("b", "processing"), s("c", "idle"), s("d", "failed")],
      balance: 100,
      costPerScene: 14,
      start,
    });
    expect(out.started).toEqual(["c", "d"]);
    expect(out.skipped).toEqual(["a", "b"]);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("is idempotent: a second run with everything in flight starts nothing", async () => {
    const start = vi.fn(async () => {});
    const out = await orchestrateFilmRender({
      scenes: [s("a", "processing"), s("b", "queued")],
      balance: 0,
      costPerScene: 14,
      start,
    });
    expect(out.status).toBe("generating");
    expect(start).not.toHaveBeenCalled();
  });

  it("preflight: balance below remaining × 14 starts nothing", async () => {
    const start = vi.fn(async () => {});
    const out = await orchestrateFilmRender({
      scenes: ["a", "b", "c", "d", "e"].map((id) => s(id, "idle")),
      balance: 69,
      costPerScene: 14,
      start,
    });
    expect(out).toMatchObject({ status: "needs_credits", cost: 70 });
    expect(start).not.toHaveBeenCalled();
  });

  it("exactly 70 for five scenes passes preflight", async () => {
    const start = vi.fn(async () => {});
    const out = await orchestrateFilmRender({
      scenes: ["a", "b", "c", "d", "e"].map((id) => s(id, "idle")),
      balance: 70,
      costPerScene: 14,
      start,
    });
    expect(out.started).toHaveLength(5);
  });

  it("stops cleanly when a debit fails mid-way", async () => {
    let n = 0;
    const out = await orchestrateFilmRender({
      scenes: ["a", "b", "c"].map((id) => s(id, "idle")),
      balance: 42,
      costPerScene: 14,
      start: async () => {
        if (++n === 2) throw new NeedsCreditsError();
      },
    });
    expect(out).toMatchObject({ status: "needs_credits", started: ["a"] });
  });

  it("all clips stored → ready without starting anything", async () => {
    const out = await orchestrateFilmRender({
      scenes: [s("a", "completed", true)],
      balance: 0,
      costPerScene: 14,
      start: async () => {},
    });
    expect(out.status).toBe("ready");
  });
});
