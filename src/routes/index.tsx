import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Clapperboard, Download, Film, Loader2, RotateCcw } from "lucide-react";

import { createFilm, getFilmStatus } from "@/lib/films.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "J-Town — Turn a prompt into an AI short film" },
      {
        name: "description",
        content:
          "Write an idea, pick a look and a length, and J-Town generates a cinematic AI short film you can watch and download.",
      },
      { property: "og:title", content: "J-Town — AI short films from a single prompt" },
      {
        property: "og:description",
        content:
          "Write an idea, pick a look and a length, and J-Town generates a cinematic AI short film you can watch and download.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const STYLES = [
  { value: "cinematic", label: "Cinematic" },
  { value: "noir", label: "Film noir" },
  { value: "anime", label: "Anime" },
  { value: "documentary", label: "Documentary" },
  { value: "dreamlike", label: "Dreamlike" },
] as const;

const DURATIONS = [5, 8, 10] as const;

type StyleValue = (typeof STYLES)[number]["value"];
type Duration = (typeof DURATIONS)[number];

function Index() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<StyleValue>("cinematic");
  const [duration, setDuration] = useState<Duration>(5);
  const [filmId, setFilmId] = useState<string | null>(null);

  const create = useServerFn(createFilm);
  const status = useServerFn(getFilmStatus);

  const generate = useMutation({
    mutationFn: (input: { prompt: string; style: StyleValue; duration: Duration }) =>
      create({ data: input }),
    onSuccess: (result) => setFilmId(result.id),
    onError: (error: Error) =>
      toast.error(error.message || "Your film could not be started."),
  });

  const film = useQuery({
    queryKey: ["film", filmId],
    queryFn: () => status({ data: { id: filmId! } }),
    enabled: !!filmId,
    refetchInterval: (query) =>
      query.state.data?.status === "completed" || query.state.data?.status === "failed"
        ? false
        : 6000,
  });

  const isWorking = generate.isPending || (!!filmId && film.data?.status !== "completed" && film.data?.status !== "failed");

  const reset = () => {
    setFilmId(null);
    generate.reset();
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-5 pb-16 pt-10">
      <header className="flex items-center gap-2">
        <Clapperboard className="size-5 text-primary" aria-hidden="true" />
        <span className="text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
          J-Town
        </span>
      </header>

      <h1 className="mt-8 text-4xl leading-tight sm:text-5xl">
        Turn one idea into a <span className="text-gold">short film</span>.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Describe your scene, choose a look and a length. We&rsquo;ll shoot it for you.
      </p>

      {!filmId && (
        <section className="surface-cinema mt-8 space-y-6 p-5">
          <div className="space-y-2">
            <Label htmlFor="prompt" className="text-xs uppercase tracking-widest text-muted-foreground">
              Your story
            </Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="A lone astronaut steps onto a rain-soaked neon street and looks up as the sky splits open."
              rows={5}
              maxLength={1500}
              className="resize-none bg-background/40 text-base"
            />
          </div>

          <div className="space-y-3">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Visual style
            </span>
            <div className="flex flex-wrap gap-2">
              {STYLES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStyle(option.value)}
                  aria-pressed={style === option.value}
                  className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                    style === option.value
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Length
            </span>
            <div className="flex gap-2">
              {DURATIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDuration(value)}
                  aria-pressed={duration === value}
                  className={`flex-1 rounded-xl border py-3 text-sm transition-colors ${
                    duration === value
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {value}s
                </button>
              ))}
            </div>
          </div>

          <Button
            size="lg"
            className="btn-gold w-full text-base hover:opacity-90"
            disabled={prompt.trim().length < 10 || generate.isPending}
            onClick={() => generate.mutate({ prompt: prompt.trim(), style, duration })}
          >
            {generate.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Film className="size-4" aria-hidden="true" />
            )}
            Generate film
          </Button>
          {prompt.trim().length > 0 && prompt.trim().length < 10 && (
            <p className="text-xs text-muted-foreground">
              Add a little more detail to your story.
            </p>
          )}
        </section>
      )}

      {filmId && isWorking && (
        <section className="surface-cinema mt-8 overflow-hidden p-5">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-background/60">
            <div className="animate-reel absolute inset-y-0 w-1/3 bg-primary/10" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Generating your film…</p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            This usually takes one to three minutes. Keep this page open.
          </p>
        </section>
      )}

      {film.data?.status === "failed" && (
        <section className="surface-cinema mt-8 space-y-4 p-5">
          <h2 className="text-2xl">Something interrupted the shoot</h2>
          <p className="text-sm text-muted-foreground">
            {film.data.error ?? "The film could not be generated. Try a different idea."}
          </p>
          <Button variant="secondary" onClick={reset}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Try again
          </Button>
        </section>
      )}

      {film.data?.status === "completed" && film.data.videoUrl && (
        <section className="surface-cinema mt-8 space-y-4 p-5">
          <h2 className="text-2xl">Your film is ready</h2>
          <video
            src={film.data.videoUrl}
            controls
            autoPlay
            playsInline
            className="aspect-video w-full rounded-xl bg-black"
          />
          <p className="text-sm text-muted-foreground">{film.data.prompt}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="btn-gold flex-1 hover:opacity-90">
              <a href={film.data.videoUrl} download={`j-town-${film.data.id}.mp4`}>
                <Download className="size-4" aria-hidden="true" />
                Download
              </a>
            </Button>
            <Button variant="secondary" className="flex-1" onClick={reset}>
              <RotateCcw className="size-4" aria-hidden="true" />
              New film
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
