import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, RefreshCw, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FAL_BILLING_URL, getFalBalance } from "@/lib/fal-balance.functions";

/** Shows the fal.ai balance when fal allows reading it, and links to top-up. */
export function FalBalanceCard() {
  const read = useServerFn(getFalBalance);
  const q = useQuery({ queryKey: ["fal-balance"], queryFn: () => read(), retry: false });
  const b = q.data;

  let line: string;
  if (q.isLoading) line = "Reading balance… / Läser saldo…";
  else if (!b || b.status === "unavailable")
    line = "fal.ai did not answer right now. / fal.ai svarade inte just nu.";
  else if (b.status === "ok")
    line = `${b.balance.toFixed(2)} ${b.currency}${b.balance <= 0 ? " — empty, generation is locked / tomt, generering är låst" : ""}`;
  else if (b.status === "no_key") line = "No fal.ai key configured. / Ingen fal.ai-nyckel finns.";
  else
    line =
      "fal.ai only shares the balance with an admin key. Add FAL_ADMIN_KEY to show it here. / fal.ai visar saldot bara för en admin-nyckel. Lägg till FAL_ADMIN_KEY för att se det här.";

  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-label="fal.ai balance">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          fal.ai balance / saldo
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7"
          aria-label="Refresh balance"
          onClick={() => q.refetch()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="mt-2 text-sm">{line}</p>
      <Button asChild size="sm" className="mt-3">
        <a href={FAL_BILLING_URL} target="_blank" rel="noreferrer">
          Top up at fal.ai / Fyll på hos fal.ai <ExternalLink className="ml-2 h-3.5 w-3.5" />
        </a>
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        Payment happens on fal.ai's own page. Press refresh when you're back. / Betalningen sker på
        fal.ais egen sida. Tryck uppdatera när du är tillbaka.
      </p>
    </section>
  );
}
