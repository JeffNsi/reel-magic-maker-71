import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Lock, Unlock, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UniverseLocked, useSignedIn, useUniverse } from "@/components/universe/universe-ui";
import { getSessionId } from "@/lib/session";
import {
  resolveUniverseConflict,
  restoreUniverseVersion,
  type UniverseView,
} from "@/lib/universe.functions";

export const Route = createFileRoute("/universe")({
  head: () => ({
    meta: [
      { title: "Your universe — characters and world across films | Shortizereel" },
      {
        name: "description",
        content:
          "Your rolling universe: characters, places, style and a timeline that carry from one film into the next, with every version kept.",
      },
      { property: "og:title", content: "Your universe — Shortizereel" },
      {
        property: "og:description",
        content:
          "Characters, places and events that carry from film to film, with full version history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UniversePage,
});

function UniversePage() {
  const { data: user, isLoading: userLoading } = useSignedIn();
  const { data, isLoading, isError } = useUniverse(!!user);
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  useEffect(() => setSessionId(getSessionId()), []);

  const resolve = useServerFn(resolveUniverseConflict);
  const restore = useServerFn(restoreUniverseVersion);
  const done = (next: UniverseView) => qc.setQueryData(["universe"], next);
  const fail = () =>
    setWarning("That did not go through — nothing changed. / Det gick inte — inget ändrades.");

  const resolveM = useMutation({
    mutationFn: (v: { version: number; decision: "accept" | "reject" }) =>
      resolve({ data: { ...v, session_id: sessionId } }),
    onSuccess: done,
    onError: fail,
  });
  const restoreM = useMutation({
    mutationFn: (version: number) => restore({ data: { version } }),
    onSuccess: done,
    onError: fail,
  });

  return (
    <main className="mx-auto w-full max-w-[1248px] px-4 py-10 sm:px-6">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back
      </Link>
      <h1 className="mt-4 font-serif text-4xl italic text-foreground">Your universe</h1>

      {warning && (
        <div
          role="alert"
          className="mt-4 flex justify-between rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm"
        >
          {warning}
          <button type="button" aria-label="Dismiss" onClick={() => setWarning(null)}>
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="mt-6">
        {userLoading || (user && isLoading) ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !user ? (
          <UniverseLocked signedIn={false} />
        ) : isError ? (
          <p className="text-sm text-muted-foreground">
            Your universe could not be loaded right now. / Universumet kunde inte laddas just nu.
          </p>
        ) : !data || !data.creator ? (
          <UniverseLocked signedIn />
        ) : (
          <Universe
            data={data}
            busy={resolveM.isPending || restoreM.isPending}
            onResolve={resolveM.mutate}
            onRestore={restoreM.mutate}
          />
        )}
      </div>
    </main>
  );
}

function Universe({
  data,
  busy,
  onResolve,
  onRestore,
}: {
  data: Extract<UniverseView, { creator: true }>;
  busy: boolean;
  onResolve: (v: { version: number; decision: "accept" | "reject" }) => void;
  onRestore: (version: number) => void;
}) {
  const { snapshot, versions } = data;
  const pending = versions.filter((v) => v.status === "pending");
  const latestApplied = versions.find((v) => v.status === "applied")?.version;

  return (
    <div className="space-y-8">
      {pending.map((p) => (
        <section key={p.version} className="rounded-2xl border border-primary/50 bg-primary/10 p-5">
          <h2 className="font-medium text-foreground">
            Your Director has a question about “{p.film_title}”
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-foreground">
            {p.conflicts.map((c, i) => (
              <li key={i}>
                {c.kind === "dead_returns"
                  ? `${c.name} is dead in your universe, but appears in this film. Do they really return?`
                  : `${c.name}: the film says ${c.field} is “${c.film_value}”, your universe locks “${c.universe_value}”. The locked value is kept.`}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => onResolve({ version: p.version, decision: "accept" })}
            >
              Yes, they return — update my universe
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onResolve({ version: p.version, decision: "reject" })}
            >
              No, leave my universe as it is
            </Button>
          </div>
        </section>
      ))}

      <section>
        <h2 className="font-serif text-2xl italic text-foreground">Characters</h2>
        {!snapshot.characters.length && (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing yet. Finish a film and its characters arrive here automatically.
          </p>
        )}
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {snapshot.characters.map((c) => (
            <article key={c.canonical_id} className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-medium text-foreground">
                {c.locked.name || c.canonical_id}{" "}
                <span className="text-xs text-muted-foreground">
                  {c.canonical_id} · {c.mutable.status}
                </span>
              </h3>
              <p className="mt-2 flex items-center gap-1 text-xs font-medium text-foreground">
                <Lock className="size-3" /> Locked
              </p>
              <p className="text-xs text-muted-foreground">
                {(["face", "hair", "skin", "body", "height", "build"] as const)
                  .filter((f) => c.locked[f])
                  .map((f) => `${f}: ${c.locked[f]}`)
                  .join(" · ") || "No locked traits yet"}
                {" · "}
                {c.reference_assets.length} reference images
              </p>
              <p className="mt-2 flex items-center gap-1 text-xs font-medium text-foreground">
                <Unlock className="size-3" /> Now
              </p>
              <p className="text-xs text-muted-foreground">
                {[
                  c.mutable.wardrobe && `wearing ${c.mutable.wardrobe}`,
                  c.mutable.location && `at ${c.mutable.location}`,
                  c.mutable.injuries.length ? `injuries: ${c.mutable.injuries.join(", ")}` : "",
                  c.mutable.relationships.length
                    ? `relationships: ${c.mutable.relationships.join(", ")}`
                    : "",
                  c.mutable.knowledge.length ? `knows: ${c.mutable.knowledge.join(", ")}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || "No state recorded yet"}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-serif text-2xl italic text-foreground">Places</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {snapshot.locations.map((l) => (
            <li key={l.canonical_id}>
              <span className="text-foreground">{l.locked.name || l.canonical_id}</span>
              {l.mutable.condition && ` — ${l.mutable.condition}`} · {l.reference_assets.length}{" "}
              reference images
            </li>
          ))}
          {!snapshot.locations.length && <li>Nothing yet.</li>}
        </ul>
      </section>

      <section>
        <h2 className="font-serif text-2xl italic text-foreground">Timeline</h2>
        <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
          {snapshot.timeline.map((e, i) => (
            <li key={i}>
              <span className="text-foreground">{e.film_title}</span>
              {e.scene_number != null && ` · scene ${e.scene_number}`}: {e.description}
            </li>
          ))}
          {!snapshot.timeline.length && <li>Nothing has happened yet.</li>}
        </ol>
      </section>

      <section>
        <h2 className="font-serif text-2xl italic text-foreground">History</h2>
        <ul className="mt-2 space-y-2">
          {versions.map((v) => (
            <li
              key={v.version}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm"
            >
              <span className="text-foreground">
                v{v.version} · {v.film_title || "—"} ·{" "}
                <span className="text-muted-foreground">
                  {v.note} ({v.status})
                </span>
              </span>
              {v.status === "applied" && v.version !== latestApplied && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => onRestore(v.version)}
                >
                  Go back to this version
                </Button>
              )}
            </li>
          ))}
          {!versions.length && <li className="text-sm text-muted-foreground">No versions yet.</li>}
        </ul>
      </section>
    </div>
  );
}
