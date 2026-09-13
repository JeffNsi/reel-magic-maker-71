import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  Film,
  History as HistoryIcon,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Wand2,
} from "lucide-react";

import {
  checkStatus,
  ESTIMATED_SECONDS,
  generateStory,
  generateVideo,
  STYLES,
} from "@/lib/storyreel.functions";
import { getSessionId } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

const MAX_IDEA = 500;

type Phase = "create" | "working" | "done" | "error";

function StoryReel() {
  const [sessionId, setSessionId] = useState("");
  const [idea, setIdea] = useState("");
  const [style, setStyle] = useState<string>("cinematic");
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("create");
  const [statusText, setStatusText] = useState<"queued" | "processing">("queued");
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => setSessionId(getSessionId()), []);

  const start = useServerFn(generateVideo);
  const poll = useServerFn(checkStatus);

  const generate = useMutation({
    mutationFn: () => start({ data: { idea, style, session_id: sessionId } }),
    onSuccess: (result) => {
      setGenerationId(result.generation_id);
      if (result.status === "failed") {
        setErrorMessage(result.error_message ?? "Something went wrong.");
        setPhase("error");
      } else {
        setStatusText("processing");
        setStartedAt(Date.now());
        setPhase("working");
      }
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || "Something went wrong.");
      setPhase("error");
    },
  });

  useQuery({
    queryKey: ["generation", generationId],
    enabled: phase === "working" && !!generationId,
    refetchInterval: 4000,
    queryFn: async () => {
      const result = await poll({
        data: { generation_id: generationId!, session_id: sessionId },
      });
      if (result.status === "completed" && result.video_url) {
        setVideoUrl(result.video_url);
        setPhase("done");
      } else if (result.status === "failed") {
        setErrorMessage(result.error_message ?? "Something went wrong.");
        setPhase("error");
      } else {
        setStatusText(result.status === "queued" ? "queued" : "processing");
        setQueuePosition(result.queue_position ?? null);
        if (result.created_at) setStartedAt(new Date(result.created_at).getTime());
      }
      return result;
    },
  });

  const submit = () => {
    if (!idea.trim()) {
      toast.error("Describe your idea first.");
      return;
    }
    setErrorMessage(null);
    setVideoUrl(null);
    setStatusText("queued");
    setQueuePosition(null);
    generate.mutate();
  };

  const reset = () => {
    setPhase("create");
    setGenerationId(null);
    setVideoUrl(null);
    setErrorMessage(null);
    setStartedAt(null);
    setQueuePosition(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto w-full max-w-2xl px-5 pb-24 pt-10 sm:pt-16">
        {phase === "create" && (
          <>
            <Hero />
            <StoryWriter style={style} onUse={setIdea} />
            <CreateCard
              idea={idea}
              setIdea={setIdea}
              style={style}
              setStyle={setStyle}
              onSubmit={submit}
              pending={generate.isPending || !sessionId}
            />
          </>
        )}

        {phase === "working" && (
          <WorkingState
            statusText={statusText}
            startedAt={startedAt}
            queuePosition={queuePosition}
          />
        )}

        {phase === "done" && videoUrl && (
          <ResultState videoUrl={videoUrl} onReset={reset} generationId={generationId} />
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
        <nav className="flex items-center gap-1">
          <span className="flex items-center gap-2 px-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <Film className="size-4" aria-hidden />
            Create
          </span>
          <Button asChild variant="ghost" className="h-9 rounded-full px-4">
            <Link to="/history" className="text-xs uppercase tracking-[0.2em]">
              <HistoryIcon className="mr-2 size-4" /> My shorts
            </Link>
          </Button>
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

function StoryWriter({ style, onUse }: { style: string; onUse: (idea: string) => void }) {
  const [theme, setTheme] = useState("");
  const write = useServerFn(generateStory);

  const story = useMutation({
    mutationFn: () => write({ data: { theme, style } }),
    onSuccess: (result) => {
      onUse(result.idea);
      toast.success("Story written — edit it or hit Generate.");
    },
    onError: (err: Error) => toast.error(err.message || "The story writer had a hiccup."),
  });

  return (
    <section className="surface-cinema mt-10 rounded-3xl p-5 sm:p-7">
      <h2 className="font-display text-xl text-foreground">Need a story? Give me a theme.</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        A few words is enough — we write the full film description for you.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Input
          value={theme}
          onChange={(e) => setTheme(e.target.value.slice(0, 200))}
          placeholder="Lonely lighthouse keeper"
          className="h-12 rounded-2xl bg-background/60 text-base"
          onKeyDown={(e) => {
            if (e.key === "Enter" && theme.trim() && !story.isPending) story.mutate();
          }}
        />
        <Button
          onClick={() => {
            if (!theme.trim()) {
              toast.error("Give me a theme first.");
              return;
            }
            story.mutate();
          }}
          disabled={story.isPending}
          variant="outline"
          className="h-12 shrink-0 rounded-2xl px-6 text-xs font-semibold uppercase tracking-[0.2em]"
        >
          {story.isPending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Writing
            </>
          ) : (
            <>
              <Wand2 className="mr-2 size-4" /> Write story
            </>
          )}
        </Button>
      </div>
    </section>
  );
}

function CreateCard({
  idea,
  setIdea,
  style,
  setStyle,
  onSubmit,
  pending,
}: {
  idea: string;
  setIdea: (v: string) => void;
  style: string;
  setStyle: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <section className="surface-cinema mt-6 rounded-3xl p-5 sm:p-7">
      <h2 className="font-display text-2xl text-foreground">Describe your story</h2>

      <Textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value.slice(0, MAX_IDEA))}
        rows={5}
        maxLength={MAX_IDEA}
        placeholder="Example: A young filmmaker arrives in Stockholm at midnight with only a suitcase and a dream."
        className="mt-4 min-h-36 resize-none rounded-2xl bg-background/60 text-base leading-relaxed"
      />
      <p className="mt-2 text-right text-xs text-muted-foreground">
        {idea.length}/{MAX_IDEA}
      </p>

      <p className="mt-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">Style</p>
      <Select value={style} onValueChange={setStyle}>
        <SelectTrigger className="mt-3 h-12 rounded-2xl bg-background/60 text-base">
          <SelectValue placeholder="Choose a style" />
        </SelectTrigger>
        <SelectContent>
          {STYLES.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
            <Sparkles className="mr-2 size-4" /> Generate
          </>
        )}
      </Button>
    </section>
  );
}

function formatRemaining(seconds: number) {
  if (seconds <= 0) return "any moment now";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `about ${secs}s left`;
  return `about ${mins}m ${String(secs).padStart(2, "0")}s left`;
}

function WorkingState({
  statusText,
  startedAt,
  queuePosition,
}: {
  statusText: "queued" | "processing";
  startedAt: number | null;
  queuePosition: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  // Real elapsed time against a typical render length, held below 99% until the video lands.
  const percent = Math.min(99, Math.round((elapsed / ESTIMATED_SECONDS) * 100));
  const remaining = Math.max(0, ESTIMATED_SECONDS - elapsed);

  return (
    <section className="surface-cinema mt-6 rounded-3xl p-8 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-border/70">
        <Film className="size-7 animate-reel text-gold" aria-hidden />
      </div>
      <h2 className="mt-6 font-display text-3xl text-foreground">Creating your short film...</h2>
      <p className="mt-3 text-sm text-muted-foreground">
        {statusText === "queued"
          ? queuePosition !== null
            ? `Waiting in line — ${queuePosition} ahead of you`
            : "Waiting in line"
          : "Filming your scene"}{" "}
        — keep this page open.
      </p>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Generation progress"
        className="mx-auto mt-8 h-2 w-full max-w-xs overflow-hidden rounded-full bg-border/60"
      >
        <div
          className="h-full rounded-full bg-gradient-gold transition-[width] duration-1000 ease-linear"
          style={{ width: `${Math.max(3, percent)}%` }}
        />
      </div>

      <div className="mx-auto mt-3 flex w-full max-w-xs items-center justify-between text-xs text-muted-foreground">
        <span>{percent}%</span>
        <span>{formatRemaining(remaining)}</span>
      </div>

      {remaining === 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Taking a little longer than usual — still working.
        </p>
      )}
    </section>
  );
}

function ResultState({
  videoUrl,
  onReset,
  generationId,
}: {
  videoUrl: string;
  onReset: () => void;
  generationId: string | null;
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
            download={`storyreel-${generationId ?? "short"}.mp4`}
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
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Button
          onClick={onRetry}
          className="btn-gold h-12 rounded-2xl px-8 text-xs font-semibold uppercase tracking-[0.2em]"
        >
          <RotateCcw className="mr-2 size-4" /> Try again
        </Button>
        <Button asChild variant="ghost" className="h-12 rounded-2xl px-8">
          <Link to="/history" className="text-xs font-semibold uppercase tracking-[0.2em]">
            <HistoryIcon className="mr-2 size-4" /> My shorts
          </Link>
        </Button>
      </div>
    </section>
  );
}
