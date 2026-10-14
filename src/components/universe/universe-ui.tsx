import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Globe2, Loader2, Lock, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  attachUniverseCarry,
  getUniverse,
  syncUniverseFromFilm,
  type SyncResult,
  type UniverseView,
} from "@/lib/universe.functions";

export function useSignedIn() {
  return useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });
}

export function useUniverse(enabled: boolean) {
  const fetchUniverse = useServerFn(getUniverse);
  return useQuery({
    queryKey: ["universe"],
    enabled,
    queryFn: () => fetchUniverse(),
    retry: false,
  });
}

/** Shown instead of the feature without Creator. */
export function UniverseLocked({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Lock className="size-4 text-primary" aria-hidden /> Universe memory — Creator only
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        With Creator, your Director remembers your characters, places and style between films.
        After every finished film the universe moves on — wardrobe, injuries, relationships, where
        everyone is — so the next film starts where the last one ended.
      </p>
      <Button asChild size="sm" className="mt-4">
        {signedIn ? (
          <Link to="/vibe/profile" search={{ shop: "creator" }}>
            Go Creator
          </Link>
        ) : (
          <Link to="/auth" search={{ plan: "creator" }}>
            Go Creator
          </Link>
        )}
      </Button>
    </div>
  );
}

function Dismissible({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm text-foreground">
      <span>{text}</span>
      <button type="button" aria-label="Dismiss" onClick={onClose}>
        <X className="size-4" />
      </button>
    </div>
  );
}

/**
 * Before the Director starts: "Previously in your universe", then tick what follows.
 * Calls onReady with the chosen ids (empty = start fresh).
 */
export function UniversePicker({
  universe,
  onReady,
}: {
  universe: Extract<UniverseView, { creator: true }>;
  onReady: (chars: string[], locs: string[]) => void;
}) {
  const { snapshot, previously } = universe;
  const [chars, setChars] = useState<string[]>(
    snapshot.characters.filter((c) => c.mutable.status === "alive").map((c) => c.canonical_id),
  );
  const [locs, setLocs] = useState<string[]>(snapshot.locations.map((l) => l.canonical_id));
  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <section className="mx-auto w-full max-w-2xl rounded-2xl border border-border bg-card p-6">
      <h2 className="flex items-center gap-2 font-serif text-2xl italic text-foreground">
        <Globe2 className="size-5 text-primary" aria-hidden /> Previously in your universe
      </h2>
      {previously.length ? (
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
          {previously.map((line) => (
            <li key={line}>• {line}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No events recorded yet.</p>
      )}

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-foreground">Characters who follow</legend>
        <div className="mt-2 space-y-2">
          {snapshot.characters.map((c) => (
            <label key={c.canonical_id} className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-1"
                checked={chars.includes(c.canonical_id)}
                onChange={() => toggle(chars, setChars, c.canonical_id)}
              />
              <span>
                {c.locked.name || c.canonical_id}
                <span className="block text-xs text-muted-foreground">
                  {[
                    c.mutable.status !== "alive" ? `${c.mutable.status} — the Director will ask before using them` : "",
                    c.mutable.wardrobe && `wearing ${c.mutable.wardrobe}`,
                    c.mutable.location && `at ${c.mutable.location}`,
                    c.mutable.injuries.length ? `marked by ${c.mutable.injuries.join(", ")}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {snapshot.locations.length > 0 && (
        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-foreground">Places that follow</legend>
          <div className="mt-2 space-y-2">
            {snapshot.locations.map((l) => (
              <label key={l.canonical_id} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={locs.includes(l.canonical_id)}
                  onChange={() => toggle(locs, setLocs, l.canonical_id)}
                />
                {l.locked.name || l.canonical_id}
                {l.mutable.condition && (
                  <span className="text-xs text-muted-foreground">({l.mutable.condition})</span>
                )}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={() => onReady(chars, locs)}>Start with these</Button>
        <Button variant="ghost" onClick={() => onReady([], [])}>
          Start a fresh film
        </Button>
      </div>
    </section>
  );
}

/** Saves the ticked slice onto the Director session once it exists. */
export function useAttachCarry(sessionId: string) {
  const attach = useServerFn(attachUniverseCarry);
  return async (directorSessionId: string, chars: string[], locs: string[]) => {
    if (!chars.length && !locs.length) return [];
    try {
      const result = await attach({
        data: { director_session_id: directorSessionId, session_id: sessionId, character_ids: chars, location_ids: locs },
      });
      return result.warnings;
    } catch {
      return ["Your universe could not be attached to this film. / Universumet kunde inte kopplas till filmen."];
    }
  };
}

export function CarryWarnings({ warnings }: { warnings: string[] }) {
  const [open, setOpen] = useState(true);
  if (!open || !warnings.length) return null;
  return (
    <div className="mx-auto mb-4 w-full max-w-2xl">
      <Dismissible
        text={`The Director needs your answer: ${warnings.join(" ")} Decide in the interview whether they really return — nothing in your universe changes until you approve it.`}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

/** On a film page: updates the universe automatically when the film is finished. */
export function UniverseFilmCard({ filmId, sessionId }: { filmId: string; sessionId: string }) {
  const { data: user } = useSignedIn();
  const qc = useQueryClient();
  const sync = useServerFn(syncUniverseFromFilm);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const auto = useRef(false);

  const mutation = useMutation({
    mutationFn: (onlyIfFinished: boolean) =>
      sync({ data: { film_id: filmId, session_id: sessionId, only_if_finished: onlyIfFinished } }),
    onSuccess: (r) => {
      setResult(r);
      void qc.invalidateQueries({ queryKey: ["universe"] });
    },
    onError: () => setError("Your universe could not be updated right now. / Universumet kunde inte uppdateras just nu."),
  });

  useEffect(() => {
    if (!user || !sessionId || auto.current) return;
    auto.current = true;
    mutation.mutate(true);
  }, [user, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;
  if (result?.status === "locked") return <UniverseLocked signedIn />;

  const label: Record<string, string> = {
    applied: `Your universe moved on — saved as version ${result && "version" in result ? result.version : ""}.`,
    pending: "This film contradicts your universe. Your Director is waiting for your answer.",
    already_recorded: "Your universe already carries this film.",
    not_finished: "Your universe updates automatically when every scene of this film is finished.",
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Globe2 className="size-4 text-primary" aria-hidden /> Your universe
      </div>
      {error && <div className="mt-3"><Dismissible text={error} onClose={() => setError(null)} /></div>}
      <p className="mt-2 text-sm text-muted-foreground">
        {mutation.isPending ? "Checking…" : result ? label[result.status] : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Button size="sm" variant="secondary" disabled={mutation.isPending} onClick={() => mutation.mutate(false)}>
          {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Update my universe from this film now
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link to="/universe">Open my universe</Link>
        </Button>
      </div>
    </div>
  );
}
