import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RunRow } from "@/lib/generation-run.functions";

function ratio(value: string) {
  const [w, h] = value.split(":");
  return w && h ? `${w} / ${h}` : "9 / 16";
}

/** A result the platform no longer serves: an honest gap plus a re-run. */
function ExpiredTile({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
      <p className="text-xs text-muted-foreground">
        The platform no longer serves this result. Run it again to get a fresh copy.
      </p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        Run again
      </Button>
    </div>
  );
}

function Tile({
  run,
  onRetry,
  onFavourite,
}: {
  run: RunRow;
  onRetry: (run: RunRow) => void;
  onFavourite: (run: RunRow) => void;
}) {
  const [expired, setExpired] = useState(false);
  const still = run.images[0] ?? null;

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border/70 bg-card"
      style={{ aspectRatio: ratio(run.aspect_ratio) }}
    >
      {run.status === "queued" || run.status === "processing" ? (
        <div className="flex h-full animate-pulse flex-col items-center justify-center gap-2 bg-muted/40 p-4 text-center">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {run.status === "queued" ? "Queued" : "Rendering"}
          </p>
          <p className="text-xs text-muted-foreground">{run.model_label}</p>
          {run.queue_position != null && (
            <p className="text-[10px] text-muted-foreground">Position {run.queue_position}</p>
          )}
        </div>
      ) : run.status === "failed" ? (
        <div className="flex h-full flex-col justify-between p-3">
          <Badge variant="outline" className="w-fit border-primary/50 text-primary">
            Failed
          </Badge>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {run.error_message ?? "The platform gave no reason."}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => onRetry(run)}>
            Retry with the same setup
          </Button>
        </div>
      ) : expired ? (
        <ExpiredTile onRetry={() => onRetry(run)} />
      ) : run.video_url ? (
        <video
          src={run.video_url}
          controls
          playsInline
          className="h-full w-full bg-black object-cover"
          onError={() => setExpired(true)}
        />
      ) : still ? (
        <img
          src={still}
          alt={`${run.model_label} result`}
          className="h-full w-full bg-black object-cover"
          onError={() => setExpired(true)}
        />
      ) : (
        <ExpiredTile onRetry={() => onRetry(run)} />
      )}

      {run.status === "completed" && !expired && (
        <button
          type="button"
          onClick={() => onFavourite(run)}
          aria-label={run.favourite ? "Remove from favourites" : "Mark as favourite"}
          className={`absolute right-2 top-2 rounded-full border px-2 py-0.5 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            run.favourite
              ? "border-primary bg-primary/20 text-primary"
              : "border-border/70 bg-background/70 text-muted-foreground hover:text-foreground"
          }`}
        >
          {run.favourite ? "Favourite" : "Save"}
        </button>
      )}
    </div>
  );
}

export function RunGrid({
  runs,
  onRetry,
  onFavourite,
}: {
  runs: RunRow[];
  onRetry: (run: RunRow) => void;
  onFavourite: (run: RunRow) => void;
}) {
  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 p-8 text-center">
        <p className="font-serif text-2xl italic text-foreground">Nothing rendered yet</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Pick a model, write one sentence about the shot you want, and press generate. Up to four
          results per press, each landing on its own clock.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {runs.map((run) => (
        <Tile key={run.id} run={run} onRetry={onRetry} onFavourite={onFavourite} />
      ))}
    </div>
  );
}
