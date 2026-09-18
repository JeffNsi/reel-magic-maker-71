import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Film, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSharedFilm, type SharedFilm } from "@/lib/share.functions";

/**
 * PUBLIC FILM PAGE — the shareable, read-only face of a film.
 *
 * Anyone with the link can watch the finished clips. There is nothing to
 * approve, render, queue or pay for here, and none of the creator's working
 * material is on the page.
 */

export const Route = createFileRoute("/share/$slug")({
  loader: async ({ params }) => {
    const film = await getSharedFilm({ data: { slug: params.slug } });
    if (!film) throw notFound();
    return film;
  },
  head: ({ loaderData }) => {
    const film = loaderData as SharedFilm | undefined;
    const title = film ? `${film.title} — a short film made with Reel Magic Maker` : "Shared film";
    const description =
      film?.logline ||
      "A cinematic short film developed with an AI Creative Director and shared by its maker.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "video.other" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: SharedFilmPage,
  errorComponent: () => <Missing />,
  notFoundComponent: () => <Missing />,
});

function Missing() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="font-display text-3xl italic text-foreground">This film isn&apos;t shared</h1>
      <p className="text-sm text-muted-foreground">
        The link may have been turned off by its maker, or it never existed.
      </p>
      <Button asChild variant="outline">
        <Link to="/">Make your own film</Link>
      </Button>
    </main>
  );
}

function SharedFilmPage() {
  const film = Route.useLoaderData();
  const ready = film.scenes.filter((scene) => scene.video_url);

  return (
    <main className="min-h-screen bg-background pb-20">
      <div className="mx-auto w-full max-w-3xl px-4 pt-8 sm:px-6">
        <header>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            <Film className="size-3.5" aria-hidden /> Shared film
          </p>
          <h1 className="mt-3 font-display text-4xl italic leading-tight text-foreground sm:text-5xl">
            {film.title}
          </h1>
          {film.logline && (
            <p className="mt-3 max-w-xl text-base font-light leading-relaxed text-muted-foreground">
              {film.logline}
            </p>
          )}
          <p className="mt-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {film.style} · {ready.length} of {film.scene_count} scenes ready
          </p>
        </header>

        {ready.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-border/70 bg-card p-6 text-sm text-muted-foreground">
            The maker hasn&apos;t finished any scenes yet. Check back soon.
          </p>
        ) : (
          <ol className="mt-8 space-y-6">
            {film.scenes.map((scene) => (
              <li
                key={scene.scene_number}
                className="overflow-hidden rounded-2xl border border-border/70 bg-card"
              >
                <div className="flex items-baseline gap-3 px-5 pt-5">
                  <span className="font-display text-lg italic text-primary">
                    {String(scene.scene_number).padStart(2, "0")}
                  </span>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
                    {scene.title || `Scene ${scene.scene_number}`}
                  </h2>
                </div>
                {scene.video_url ? (
                  <video
                    className="mt-4 w-full bg-black"
                    src={scene.video_url}
                    controls
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <p className="px-5 py-5 text-sm text-muted-foreground">
                    This scene hasn&apos;t been filmed yet.
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}

        <section className="mt-12 rounded-3xl border border-border/60 bg-card/60 p-6 text-center">
          <h2 className="font-display text-2xl italic text-foreground">
            You bring the idea. Your AI Director finds the film inside it.
          </h2>
          <Button asChild className="mt-5 rounded-full px-6">
            <Link to="/">
              <Play className="mr-2 size-4" aria-hidden /> Start with an idea
            </Link>
          </Button>
        </section>
      </div>
    </main>
  );
}
