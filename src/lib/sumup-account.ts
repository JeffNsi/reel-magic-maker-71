/** Pure helpers for the owner-only SumUp overview. No network, no secrets. */
export type SumUpTx = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  timestamp: string;
  paymentType: string | null;
  description: string | null;
  code: string | null;
};

export type SumUpPayout = {
  id: string;
  amount: number;
  fee: number;
  currency: string;
  date: string;
  status: string;
  type: string | null;
};

const dayKey = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));

/** Totals of SUCCESSFUL sales today and this month in the given timezone. */
export function summarizeSales(items: SumUpTx[], now: Date, timeZone = "Europe/Stockholm") {
  const today = dayKey(now.toISOString(), timeZone);
  const month = today.slice(0, 7);
  let todaySum = 0;
  let monthSum = 0;
  let monthCount = 0;
  for (const tx of items) {
    if (tx.status !== "SUCCESSFUL") continue;
    const key = dayKey(tx.timestamp, timeZone);
    if (key.slice(0, 7) === month) {
      monthSum += tx.amount;
      monthCount += 1;
      if (key === today) todaySum += tx.amount;
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { today: round(todaySum), month: round(monthSum), monthCount };
}

export function mapTx(raw: Record<string, unknown>): SumUpTx {
  return {
    id: String(raw["id"] ?? raw["transaction_id"] ?? ""),
    amount: Number(raw["amount"] ?? 0),
    currency: String(raw["currency"] ?? "SEK"),
    status: String(raw["status"] ?? ""),
    timestamp: String(raw["timestamp"] ?? ""),
    paymentType: typeof raw["payment_type"] === "string" ? raw["payment_type"] : null,
    description: typeof raw["product_summary"] === "string" ? raw["product_summary"] : null,
    code: typeof raw["transaction_code"] === "string" ? raw["transaction_code"] : null,
  };
}

export function mapPayout(raw: Record<string, unknown>): SumUpPayout {
  return {
    id: String(raw["id"] ?? ""),
    amount: Number(raw["amount"] ?? 0),
    fee: Number(raw["fee"] ?? 0),
    currency: String(raw["currency"] ?? "SEK"),
    date: String(raw["date"] ?? ""),
    status: String(raw["status"] ?? ""),
    type: typeof raw["type"] === "string" ? raw["type"] : null,
  };
}
