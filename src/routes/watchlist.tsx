import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, BookmarkCheck, Coins, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSessionId } from "@/lib/session";
import { listFilms } from "@/lib/film.functions";

export const Route = createFileRoute("/watchlist")({
  head: () => ({
    meta: [
      { title: "Watchlist — your saved films and scene queue | STORYREEL" },
      {
        name: "description",
        content:
          "Every film you built with the director, with its scene count, credit budget and how many shots are already rendered.",
      },
      { property: "og:title", content: "Your STORYREEL watchlist" },
      {
        property: "og:description",
        content: "Saved films, scene budgets and rendering progress in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Watchlist,
});

function Watchlist() {
  const [sessionId, setSessionId] = useState("");
  const [savedOnly, setSavedOnly] = useState(true);
  useEffect(() => setSessionId(getSessionId()), []);

  const fetchFilms = useServerFn(listFilms);
  const filmsQuery = useQuery({
    queryKey: ["films", sessionId, savedOnly],
    enabled: !!sessionId,
    queryFn: () => fetchFilms({ data: { session_id: sessionId, saved_only: savedOnly } }),
  });

  const films = filmsQuery.data ?? [];

  return (
    <main className="min-h-screen bg-background pb-20">
      <div className="mx-auto w-full max-w-3xl px-4 pt-8 sm:px-6">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Create
          </Link>
        </Button>

        <header className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-primary">
            Watchlist
          </p>
          <h1 className="mt-3 font-display text-4xl italic leading-tight text-foreground">
            Your films
          </h1>
          <div className="mt-5 flex gap-2">
            <Button
              size="sm"
              variant={savedOnly ? "default" : "outline"}
              onClick={() => setSavedOnly(true)}
            >
              Saved
            </Button>
            <Button
              size="sm"
              variant={savedOnly ? "outline" : "default"}
              onClick={() => setSavedOnly(false)}
            >
              All films
            </Button>
          </div>
        </header>

        {filmsQuery.isLoading || !sessionId ? (
          <div className="mt-16 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : films.length === 0 ? (
          <p className="mt-12 text-sm leading-relaxed text-muted-foreground">
            {savedOnly
              ? "Nothing saved yet. Open a film and tap Save film to keep it here."
              : "No films yet. Describe a story on the create page and build the full film."}
          </p>
        ) : (
          <ul className="mt-8 space-y-4">
            {films.map((film) => (
              <li key={film.id}>
                <Link
                  to="/film/$filmId"
                  params={{ filmId: film.id }}
                  className="block rounded-2xl border border-border/70 bg-card p-5 transition hover:border-primary/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-2xl italic text-foreground">{film.title}</h2>
                    {film.saved && <BookmarkCheck className="h-4 w-4 shrink-0 text-primary" />}
                  </div>
                  {film.logline && (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {film.logline}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {film.rendered_count} of {film.scene_count} shots filmed
                    </span>
                    <span className="flex items-center gap-1">
                      <Coins className="h-3.5 w-3.5 text-primary" />
                      {film.total_cost} credits for the full film
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
