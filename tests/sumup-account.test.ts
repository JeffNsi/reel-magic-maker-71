import { describe, expect, it } from "vitest";
import { summarizeSales, type SumUpTx } from "@/lib/sumup-account";

const tx = (amount: number, timestamp: string, status = "SUCCESSFUL"): SumUpTx => ({
  id: `${amount}-${timestamp}`,
  amount,
  currency: "SEK",
  status,
  timestamp,
  paymentType: "ECOM",
  description: null,
  code: null,
});

describe("summarizeSales", () => {
  const now = new Date("2026-10-17T16:00:00Z");

  it("counts only successful payments", () => {
    const r = summarizeSales(
      [tx(49, "2026-10-17T10:00:00Z"), tx(99, "2026-10-17T11:00:00Z", "FAILED")],
      now,
    );
    expect(r.today).toBe(49);
    expect(r.month).toBe(49);
    expect(r.monthCount).toBe(1);
  });

  it("uses Stockholm time for today and month", () => {
    // 22:30 UTC on Oct 16 is 00:30 on Oct 17 in Stockholm -> counts as today.
    const r = summarizeSales([tx(29, "2026-10-16T22:30:00Z"), tx(29, "2026-09-30T21:00:00Z")], now);
    expect(r.today).toBe(29);
    expect(r.month).toBe(29);
  });
});
