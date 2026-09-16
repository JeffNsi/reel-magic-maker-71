import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, AlertTriangle, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { runSelfTest, type Check, type SelfTestReport } from "@/lib/selftest.functions";

export const Route = createFileRoute("/selftest")({
  head: () => ({
    meta: [
      { title: "Backtest — check every part of your studio | STORYREEL" },
      {
        name: "description",
        content:
          "Run a read-only backtest of the whole studio: database, video storage, engines, credit status and checkout, without spending anything.",
      },
      { property: "og:title", content: "STORYREEL backtest" },
      {
        property: "og:description",
        content: "A read-only sweep of database, storage, engines, credits and checkout.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SelfTest,
});

const ICON = {
  ok: <CheckCircle2 className="size-4 text-primary" />,
  warn: <AlertTriangle className="size-4 text-yellow-500" />,
  fail: <XCircle className="size-4 text-destructive" />,
};

function Row({ check }: { check: Check }) {
  return (
    <div className="flex items-start gap-3 border-t border-border/50 px-4 py-3 first:border-t-0">
      <span className="mt-0.5">{ICON[check.status]}</span>
      <div className="min-w-0">
        <p className="text-sm text-foreground">{check.name}</p>
        <p className="text-xs text-muted-foreground">{check.detail}</p>
      </div>
    </div>
  );
}

function SelfTest() {
  const run = useServerFn(runSelfTest);
  const { mutate, data, isPending, error } = useMutation<SelfTestReport>({
    mutationFn: () => run({ data: { probe_engines: true } }),
  });

  const groups = data
    ? Array.from(new Set(data.checks.map((c) => c.group))).map((g) => ({
        name: g,
        checks: data.checks.filter((c) => c.group === g),
      }))
    : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-5">
          <Link to="/" className="font-display text-2xl italic tracking-tight text-primary">
            STORYREEL
          </Link>
          <Button asChild variant="ghost" className="h-9 rounded-full px-4">
            <Link to="/" className="text-xs uppercase tracking-[0.2em]">
              <ArrowLeft className="mr-2 size-4" /> Create
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 py-10">
        <h1 className="font-display text-3xl italic tracking-tight text-foreground">Backtest</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Checks every part of the studio without making a film, without writing anything and
          without spending credits. Run it whenever something feels broken.
        </p>

        <Button
          onClick={() => mutate()}
          disabled={isPending}
          className="mt-6 h-11 rounded-full px-6 text-xs uppercase tracking-[0.2em]"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Testing
            </>
          ) : (
            "Run backtest"
          )}
        </Button>

        {error ? (
          <p className="mt-6 text-sm text-destructive">
            The backtest itself could not run: {error instanceof Error ? error.message : "unknown error"}
          </p>
        ) : null}

        {data ? (
          <>
            <div className="mt-8 flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em]">
              <span className="rounded-full bg-primary/15 px-3 py-1 text-primary">
                {data.ok} working
              </span>
              <span className="rounded-full bg-yellow-500/15 px-3 py-1 text-yellow-500">
                {data.warn} to watch
              </span>
              <span className="rounded-full bg-destructive/15 px-3 py-1 text-destructive">
                {data.fail} broken
              </span>
            </div>

            {groups.map((group) => (
              <section key={group.name} className="mt-6">
                <h2 className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {group.name}
                </h2>
                <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
                  {group.checks.map((c) => (
                    <Row key={`${c.group}-${c.name}`} check={c} />
                  ))}
                </div>
              </section>
            ))}

            <p className="mt-8 text-xs text-muted-foreground">
              Last run {new Date(data.ran_at).toLocaleString()}
            </p>
          </>
        ) : null}
      </main>
    </div>
  );
}
