import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Clapperboard,
  Film,
  History as HistoryIcon,
  Loader2,
  RotateCcw,
} from "lucide-react";


import { checkStatus, ESTIMATED_SECONDS, generateVideo, STYLES } from "@/lib/storyreel.functions";
import { narrateGeneration } from "@/lib/story.functions";
import { getSessionId } from "@/lib/session";
import { FilmPlayer } from "@/components/film-player";
import { StoryPack } from "@/components/story-pack";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  const [audio, setAudio] = useState(false);
  const [theme, setTheme] = useState("");
  const navigate = useNavigate();
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
    mutationFn: () => start({ data: { idea, style, audio, session_id: sessionId } }),
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
    <div className="min-h-screen bg-background selection:bg-primary/30">
      <Header />
      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 sm:px-6 lg:pt-16">
        {phase === "create" && (
          <>
            <Hero />
            <div className="mb-8">
              <StoryPack
                style={style}
                sessionId={sessionId}
                theme={theme}
                setTheme={setTheme}
                onUsePrompt={setIdea}
                onOpenStudio={(id) => navigate({ to: "/studio", search: { story: id } })}
              />
            </div>
            <CreateCard
              idea={idea}
              setIdea={setIdea}
              style={style}
              setStyle={setStyle}
              audio={audio}
              setAudio={setAudio}
              onSubmit={submit}
              pending={generate.isPending || !sessionId}
            />
            <p className="mt-8 text-center text-xs text-muted-foreground/70">
              Vertical 9:16 · 5 seconds · {audio ? "with sound" : "silent"} · estimated render time
              2–3 minutes
            </p>
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
          <ResultState
            videoUrl={videoUrl}
            onReset={reset}
            generationId={generationId}
            sessionId={sessionId}
            idea={idea}
          />
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
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          to="/"
          className="font-display text-2xl italic tracking-tight text-primary transition-opacity hover:opacity-80"
        >
          STORYREEL
        </Link>
        <nav className="flex items-center gap-6">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Film className="size-4" aria-hidden />
            Create
          </span>
          <Link
            to="/history"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <HistoryIcon className="size-4" aria-hidden /> My shorts
          </Link>
          <Link
            to="/studio"
            search={{ story: undefined }}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Clapperboard className="size-4" aria-hidden /> Scene editor
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="mb-14 text-center">
      <h1 className="font-display text-5xl italic leading-tight text-foreground sm:text-7xl">
        Turn your idea into a <span className="text-primary">short film.</span>
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-balance text-lg font-light leading-relaxed text-muted-foreground">
        Write a prompt, choose your aesthetic, and let the AI director bring your vision to the
        screen.
      </p>
    </section>
  );
}


function CreateCard({
  idea,
  setIdea,
  style,
  setStyle,
  audio,
  setAudio,
  onSubmit,
  pending,
}: {
  idea: string;
  setIdea: (v: string) => void;
  style: string;
  setStyle: (v: string) => void;
  audio: boolean;
  setAudio: (v: boolean) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-cinema)] sm:p-8">
      <div className="pointer-events-none absolute -mr-16 -mt-16 right-0 top-0 size-64 rounded-full bg-primary/10 blur-[100px]" />

      <div className="relative space-y-8">
        <div>
          <div className="mb-3 flex items-end justify-between">
            <label
              htmlFor="idea"
              className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Your script / prompt
            </label>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
              {idea.length} / {MAX_IDEA}
            </span>
          </div>
          <Textarea
            id="idea"
            value={idea}
            onChange={(e) => setIdea(e.target.value.slice(0, MAX_IDEA))}
            rows={5}
            maxLength={MAX_IDEA}
            placeholder="Describe the scene, the characters, and the atmosphere..."
            className="min-h-40 resize-none rounded-xl border-border bg-background/50 p-4 text-base leading-relaxed focus-visible:border-primary/50"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Visual style
            </p>
            <Select value={style} onValueChange={setStyle}>
              <SelectTrigger className="h-[50px] w-full rounded-xl border-border bg-background/50 text-base">
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

            <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-background/50 px-4 py-3">
              <label htmlFor="audio" className="text-sm text-muted-foreground">
                Sound
              </label>
              <Switch id="audio" checked={audio} onCheckedChange={setAudio} />
            </div>
          </div>

          <div className="flex items-end">
            <Button
              onClick={onSubmit}
              disabled={pending}
              className="group h-[50px] w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-all hover:shadow-[0_0_24px_var(--glow)] active:scale-[0.98]"
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Starting
                </>
              ) : (
                <>
                  Generate film
                  <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
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
        <Film className="size-7 animate-reel text-primary" aria-hidden />
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
  sessionId,
  idea,
}: {
  videoUrl: string;
  onReset: () => void;
  generationId: string | null;
  sessionId: string;
  idea: string;
}) {
  const narrate = useServerFn(narrateGeneration);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);

  const narration = useMutation({
    mutationFn: (input: { text: string; voice: string; music: string }) =>
      narrate({
        data: {
          session_id: sessionId,
          generation_id: generationId!,
          text: input.text,
          voice: input.voice,
          music: input.music,
        },
      }),
    onSuccess: (result) => {
      setVoiceUrl(result.voice_url);
      toast.success("Voice-over added — press Play film.");
    },
    onError: (err: Error) => toast.error(err.message || "Could not record the voice-over."),
  });

  return (
    <section className="mt-6">
      <h2 className="text-center font-display text-3xl text-foreground sm:text-4xl">
        Your short is ready.
      </h2>

      <div className="mt-7">
        <FilmPlayer
          videoUrl={videoUrl}
          voiceUrl={voiceUrl}
          narration={idea.slice(0, 200)}
          generationId={generationId}
          onNarrate={generationId ? (input) => narration.mutate(input) : undefined}
          narrating={narration.isPending}
        />
      </div>

      <div className="mt-7 flex justify-center">
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
          className="bg-primary text-primary-foreground hover:shadow-[0_0_24px_var(--glow)] h-12 rounded-2xl px-8 text-xs font-semibold uppercase tracking-[0.2em]"
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
