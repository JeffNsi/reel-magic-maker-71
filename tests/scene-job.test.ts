import { describe, expect, it } from "vitest";
import {
  MAX_SCENE_RETRIES,
  canRetry,
  deadlineFrom,
  filmReady,
  shouldRefund,
  tickAction,
  type JobRow,
} from "@/lib/scene-job";

const now = new Date("2026-10-14T12:00:00Z");
const row = (p: Partial<JobRow>): JobRow => ({
  status: "processing",
  deadline_at: null,
  attempts: 1,
  video_url: null,
  refunded: false,
  charged_bonus: 4,
  charged_paid: 10,
  ...p,
});

describe("scene job policy (behavioral, pure)", () => {
  it("deadline is 30 minutes", () => {
    expect(deadlineFrom(now)).toBe("2026-10-14T12:30:00.000Z");
  });
  it("polls before the deadline and expires after it", () => {
    expect(tickAction(row({ deadline_at: "2026-10-14T12:10:00Z" }), now)).toBe("poll");
    expect(tickAction(row({ deadline_at: "2026-10-14T11:59:00Z" }), now)).toBe("expire");
    expect(tickAction(row({ status: "completed" }), now)).toBe("done");
    expect(tickAction(row({ status: "failed" }), now)).toBe("settled");
  });
  it("at most 2 retries after the first attempt", () => {
    expect(MAX_SCENE_RETRIES).toBe(2);
    expect(canRetry({ attempts: 1 })).toBe(true);
    expect(canRetry({ attempts: 2 })).toBe(true);
    expect(canRetry({ attempts: 3 })).toBe(false);
  });
  it("refunds only charged, unrefunded jobs without a clip", () => {
    expect(shouldRefund(row({}))).toBe(true);
    expect(shouldRefund(row({ refunded: true }))).toBe(false);
    expect(shouldRefund(row({ video_url: "x.mp4" }))).toBe(false);
    expect(shouldRefund(row({ charged_bonus: 0, charged_paid: 0 }))).toBe(false);
  });
  it("film ready only when every scene has a completed, stored clip", () => {
    expect(filmReady([])).toBe(false);
    expect(
      filmReady([
        { scene_id: "a", status: "completed", has_clip: true },
        { scene_id: "b", status: "completed", has_clip: false },
      ]),
    ).toBe(false);
    expect(filmReady([{ scene_id: "a", status: "completed", has_clip: true }])).toBe(true);
  });
});
