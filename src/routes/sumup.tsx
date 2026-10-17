import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Lock, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSumUpAccount } from "@/lib/sumup-account.functions";
import { summarizeSales } from "@/lib/sumup-account";
import { useLocale } from "@/hooks/use-locale";

export const Route = createFileRoute("/sumup")({
  head: () => ({
    meta: [
      { title: "SumUp sales — Shortizereel" },
      { name: "description", content: "Owner-only overview of SumUp sales and payouts." },
      { property: "og:title", content: "SumUp sales — Shortizereel" },
      { property: "og:description", content: "Owner-only overview of SumUp sales and payouts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SumUpPage,
});

const money = (n: number, cur: string) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: cur || "SEK" }).format(n);
const when = (iso: string) =>
  iso ? new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : "—";

function SumUpPage() {
  const { t } = useLocale();
  const fetchAccount = useServerFn(getSumUpAccount);
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });
  const account = useQuery({
    queryKey: ["sumup-account", user?.id],
    enabled: !!user,
    queryFn: () => fetchAccount(),
    refetchInterval: 60_000,
  });

  const shell = (body: React.ReactNode) => (
    <div className="min-h-screen bg-dw-background px-5 pb-24 pt-6 text-dw-foreground">
      <div className="mx-auto max-w-2xl">{body}</div>
    </div>
  );

  if (!userLoading && !user) {
    return shell(
      <div className="mt-20 text-center">
        <Lock className="mx-auto size-8 text-dw-muted" aria-hidden />
        <p className="mt-3 text-sm text-dw-muted">{t("Sign in as the owner.", "Logga in som ägare.")}</p>
        <Link to="/auth" className="mt-4 inline-block text-sm underline">
          {t("Sign in", "Logga in")}
        </Link>
      </div>,
    );
  }
  if (userLoading || account.isLoading || !account.data) {
    return shell(<p className="mt-20 text-center text-sm text-dw-muted">{t("Loading…", "Laddar…")}</p>);
  }
  const data = account.data;
  if (!data.allowed) {
    return shell(
      <div className="mt-20 text-center">
        <Lock className="mx-auto size-8 text-dw-muted" aria-hidden />
        <p className="mt-3 text-sm text-dw-muted">
          {t("Only the owner can see this page.", "Bara ägaren kan se den här sidan.")}
        </p>
      </div>,
    );
  }
  if ("error" in data) {
    return shell(
      <div role="alert" className="mt-10 rounded-2xl border border-dw-border bg-dw-card p-4 text-sm">
        {data.error}
        <button onClick={() => account.refetch()} className="ml-3 underline">
          {t("Try again", "Försök igen")}
        </button>
      </div>,
    );
  }

  const totals = summarizeSales(data.transactions, new Date());
  return shell(
    <>
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Wallet className="size-6 text-dw-primary" aria-hidden /> SumUp
        </h1>
        <button
          onClick={() => account.refetch()}
          aria-label={t("Refresh", "Uppdatera")}
          className="rounded-full p-2 text-dw-muted hover:text-dw-foreground"
        >
          <RefreshCw className={`size-5 ${account.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>
      <p className="mt-1 text-xs text-dw-muted">
        {data.merchantName ?? ""} · {t("Updated", "Uppdaterad")} {when(data.fetchedAt)}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Stat label={t("Today", "Idag")} value={money(totals.today, data.currency)} />
        <Stat
          label={t("This month", "Denna månad")}
          value={money(totals.month, data.currency)}
          sub={t(`${totals.monthCount} payments`, `${totals.monthCount} betalningar`)}
        />
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-dw-muted">
        {t("Latest payments", "Senaste betalningar")}
      </h2>
      <ul className="mt-3 divide-y divide-dw-border rounded-2xl border border-dw-border bg-dw-card">
        {data.transactions.length === 0 && (
          <li className="p-4 text-sm text-dw-muted">{t("No payments this month.", "Inga betalningar denna månad.")}</li>
        )}
        {data.transactions.slice(0, 30).map((tx) => (
          <li key={tx.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{tx.description || tx.code || tx.id}</p>
              <p className="text-xs text-dw-muted">
                {when(tx.timestamp)} · {tx.paymentType ?? "—"} · {tx.status}
              </p>
            </div>
            <span className={`text-sm font-bold ${tx.status === "SUCCESSFUL" ? "" : "text-dw-muted line-through"}`}>
              {money(tx.amount, tx.currency)}
            </span>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-dw-muted">
        {t("Payouts to your bank", "Utbetalningar till din bank")}
      </h2>
      <ul className="mt-3 divide-y divide-dw-border rounded-2xl border border-dw-border bg-dw-card">
        {data.payouts.length === 0 && (
          <li className="p-4 text-sm text-dw-muted">{t("No payouts in the last 90 days.", "Inga utbetalningar de senaste 90 dagarna.")}</li>
        )}
        {data.payouts.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium">{p.date}</p>
              <p className="text-xs text-dw-muted">
                {p.status}
                {p.fee ? ` · ${t("fee", "avgift")} ${money(p.fee, p.currency)}` : ""}
              </p>
            </div>
            <span className="text-sm font-bold">{money(p.amount, p.currency)}</span>
          </li>
        ))}
      </ul>
    </>,
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-dw-border bg-dw-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-dw-muted">{label}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
      {sub && <p className="text-xs text-dw-muted">{sub}</p>}
    </div>
  );
}
