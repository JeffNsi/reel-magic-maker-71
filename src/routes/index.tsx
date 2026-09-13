import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Film, Loader2, Play, RotateCcw, Sparkles } from "lucide-react";

import { createShort, getShortStatus, STYLES } from "@/lib/storyreel.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "STORYREEL — Turn your idea into a short film" },
      {
        name: "description",
        content:
          "Write one idea, pick a style, and STORYREEL generates a vertical cinematic AI short you can watch and download.",
      },
      { property: "og:title", content: "STORYREEL — Cinematic AI shorts from a single idea" },
      {
        property: "og:description",
        content:
          "Write one idea, pick a style, and STORYREEL generates a vertical cinematic AI short you can watch and download.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StoryReel,
});

type Phase = "create" | "working" | "done" | "error";

function StoryReel() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<string>("cinematic");
  const [shortId, setShortId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("create");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const start = useServerFn(createShort);
  const check = useServerFn(getShortStatus);

  const generate = useMutation({
    mutationFn: () => start({ data: { prompt, style } }),
    onSuccess: (result) => {
      setShortId(result.id);
      if (result.status === "failed") {
        setPhase("error");
        setErrorMessage(result.errorMessage ?? "Something went wrong.");
      } else {
        setPhase("working");
      }
    },
    onError: (err: Error) => {
      setPhase("error");
      setErrorMessage(err.message || "Something went wrong.");
    },
  });

  useQuery({
    queryKey: ["short", shortId],
    enabled: phase === "working" && !!shortId,
    refetchInterval: 6000,
    queryFn: async () => {
      const result = await check({ data: { id: shortId! } });
      if (result.status === "completed" && result.videoUrl) {
        setVideoUrl(result.videoUrl);
        setPhase("done");
      } else if (result.status === "failed") {
        setErrorMessage(result.errorMessage ?? "Something went wrong.");
        setPhase("error");
      }
      return result;
    },
  });

  const submit = () => {
    if (prompt.trim().length < 10) {
      toast.error("Describe your story first — a sentence is enough.");
      return;
    }
    setErrorMessage(null);
    setVideoUrl(null);
    generate.mutate();
  };

  const reset = () => {
    setPhase("create");
    setShortId(null);
    setVideoUrl(null);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto w-full max-w-2xl px-5 pb-24 pt-10 sm:pt-16">
        {phase === "create" && (
          <>
            <Hero />
            <CreateCard
              prompt={prompt}
              setPrompt={setPrompt}
              style={style}
              setStyle={setStyle}
              onSubmit={submit}
              pending={generate.isPending}
            />
          </>
        )}

        {phase === "working" && <WorkingState />}

        {phase === "done" && videoUrl && (
          <ResultState videoUrl={videoUrl} onReset={reset} shortId={shortId} />
        )}

        {phase === "error" && (
          <ErrorState message={errorMessage ?? "Something went wrong."} onRetry={reset} />
        )}
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-5">
        <span className="font-display text-2xl tracking-wide text-gold">STORYREEL</span>
        <nav className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <Film className="size-4" aria-hidden />
          <span>Create</span>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <div className="text-center">
      <h1 className="font-display text-4xl leading-tight text-foreground sm:text-5xl">
        Turn your idea into a short film.
      </h1>
      <p className="mx-auto mt-4 max-w-md text-balance text-muted-foreground">
        Create cinematic AI videos from a simple idea.
      </p>
    </div>
  );
}

function CreateCard({
  prompt,
  setPrompt,
  style,
  setStyle,
  onSubmit,
  pending,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  style: string;
  setStyle: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <section className="surface-cinema mt-10 rounded-3xl p-5 sm:p-7">
      <h2 className="font-display text-2xl text-foreground">Describe your story</h2>

      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={5}
        maxLength={1500}
        placeholder="Example: A young filmmaker arrives in Stockholm at midnight with only a suitcase and a dream."
        className="mt-4 min-h-36 resize-none rounded-2xl bg-background/60 text-base leading-relaxed"
      />

      <p className="mt-6 text-xs uppercase tracking-[0.2em] text-muted-foreground">Style</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {STYLES.map((option) => {
          const active = option.value === style;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setStyle(option.value)}
              aria-pressed={active}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                active
                  ? "border-transparent bg-gradient-gold text-background"
                  : "border-border bg-background/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Format</p>
          <p className="mt-1 text-sm text-foreground">9:16 vertical</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Duration</p>
          <p className="mt-1 text-sm text-foreground">5 seconds</p>
        </div>
      </div>

      <Button
        onClick={onSubmit}
        disabled={pending}
        className="btn-gold mt-8 h-14 w-full rounded-2xl text-sm font-semibold uppercase tracking-[0.2em]"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" /> Starting
          </>
        ) : (
          <>
            <Sparkles className="mr-2 size-4" /> Generate short
          </>
        )}
      </Button>
    </section>
  );
}

function WorkingState() {
  return (
    <section className="surface-cinema mt-6 rounded-3xl p-8 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-border/70">
        <Film className="size-7 animate-reel text-gold" aria-hidden />
      </div>
      <h2 className="mt-6 font-display text-3xl text-foreground">Creating your short film...</h2>
      <p className="mt-3 text-sm text-muted-foreground">
        This usually takes a couple of minutes. Keep this page open.
      </p>
      <div
        role="status"
        aria-label="Creating your short film"
        className="mx-auto mt-8 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-border/60"
      >
        <div className="animate-reel-sweep h-full w-1/3 rounded-full bg-gradient-gold" />
      </div>
    </section>
  );
}

function ResultState({
  videoUrl,
  onReset,
  shortId,
}: {
  videoUrl: string;
  onReset: () => void;
  shortId: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <section className="mt-6 text-center">
      <h2 className="font-display text-3xl text-foreground sm:text-4xl">Your short is ready.</h2>

      <div className="surface-cinema mx-auto mt-6 w-full max-w-sm overflow-hidden rounded-3xl p-2">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          playsInline
          className="aspect-[9/16] w-full rounded-2xl bg-black object-cover"
        />
      </div>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button
          onClick={() => videoRef.current?.play()}
          className="btn-gold h-12 rounded-2xl px-8 text-xs font-semibold uppercase tracking-[0.2em]"
        >
          <Play className="mr-2 size-4" /> Play
        </Button>
        <Button asChild variant="outline" className="h-12 rounded-2xl px-8">
          <a
            href={videoUrl}
            download={`storyreel-${shortId ?? "short"}.mp4`}
            className="text-xs font-semibold uppercase tracking-[0.2em]"
          >
            <Download className="mr-2 size-4" /> Download
          </a>
        </Button>
        <Button
          onClick={onReset}
          variant="ghost"
          className="h-12 rounded-2xl px-8 text-xs font-semibold uppercase tracking-[0.2em]"
        >
          <RotateCcw className="mr-2 size-4" /> Create another
        </Button>
      </div>
    </section>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="surface-cinema mt-6 rounded-3xl p-8 text-center">
      <h2 className="font-display text-3xl text-foreground">Something went wrong.</h2>
      <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">{message}</p>
      <Button
        onClick={onRetry}
        className="btn-gold mt-8 h-12 rounded-2xl px-8 text-xs font-semibold uppercase tracking-[0.2em]"
      >
        <RotateCcw className="mr-2 size-4" /> Try again
      </Button>
    </section>
  );
}
