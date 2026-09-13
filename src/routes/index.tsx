import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Clapperboard,
  Coins,
  Film,
  History as HistoryIcon,
  Loader2,
  RotateCcw,
} from "lucide-react";


import {
  checkStatus,
  COIN_COST,
  ESTIMATED_SECONDS,
  generateVideo,
  STYLES,
} from "@/lib/storyreel.functions";
import { getProfile } from "@/lib/dramawave.functions";
import { supabase } from "@/integrations/supabase/client";
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

  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  const fetchProfile = useServerFn(getProfile);
  const { data: profile, refetch: refetchProfile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: fetchProfile,
  });

  const coins = (profile?.paid_coins ?? 0) + (profile?.bonus_coins ?? 0);

  const generate = useMutation({
    mutationFn: () => start({ data: { idea, style, audio, session_id: sessionId } }),
    onSuccess: (result) => {
      setGenerationId(result.generation_id);
      void refetchProfile();
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
    if (!user) {
      toast.error("Sign in to spend coins on a film.");
      navigate({ to: "/auth" });
      return;
    }
    if (coins < COIN_COST) {
      toast.error(`A film costs ${COIN_COST} coins. You have ${coins}.`);
      navigate({ to: "/dramawave/rewards" });
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
            <div id="create" className="scroll-mt-24" />
            <CoinBar signedIn={!!user} coins={coins} />
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
            <LearnHow />
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

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Hero() {
  return (
    <section className="mb-14 text-center">
      <h1 className="font-display text-5xl italic leading-tight text-foreground sm:text-7xl">
        Create Your Own <span className="text-primary">AI Short Film</span>
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-balance text-lg font-light leading-relaxed text-muted-foreground">
        Turn your idea into a cinematic short with AI.
      </p>
      <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button
          onClick={() => scrollTo("create")}
          className="bg-primary text-primary-foreground hover:shadow-[0_0_28px_var(--glow)] h-12 w-full rounded-2xl px-8 text-xs font-semibold uppercase tracking-[0.2em] sm:w-auto"
        >
          Create your film
        </Button>
        <Button
          onClick={() => scrollTo("learn")}
          variant="outline"
          className="h-12 w-full rounded-2xl px-8 text-xs font-semibold uppercase tracking-[0.2em] sm:w-auto"
        >
          Learn how
        </Button>
      </div>
    </section>
  );
}

const LEARN_STEPS = [
  { title: "Create your idea", body: "One sentence is enough — a person, a place, a want." },
  { title: "Build your story", body: "Shape a beginning, a turn and an ending you can film." },
  { title: "Create your characters", body: "Describe faces, clothes and age so they stay the same." },
  { title: "Create your scenes", body: "Split the story into short beats — one moment per shot." },
  { title: "Generate your visuals", body: "Write each shot as a prompt with camera, light and mood." },
  { title: "Add voice and sound", body: "Narration and a music bed lift a silent clip into a film." },
  { title: "Edit your short", body: "Order the shots, trim the dead air, keep the rhythm tight." },
  { title: "Publish your film", body: "Export vertical, add a title card, and share it." },
];

function LearnHow() {
  return (
    <section id="learn" className="mt-20 scroll-mt-24">
      <h2 className="font-display text-3xl italic text-foreground sm:text-4xl">
        How a short film gets made
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Eight steps from a single sentence to a finished film.
      </p>
      <ol className="mt-8 grid gap-3 sm:grid-cols-2">
        {LEARN_STEPS.map((step, i) => (
          <li
            key={step.title}
            className="surface-cinema rounded-2xl p-5 transition-colors hover:border-primary/40"
          >
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Step {i + 1}
            </span>
            <h3 className="mt-2 text-base font-medium text-foreground">{step.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
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

/** Coin balance and price for one generation, with a route to earn more. */
function CoinBar({ signedIn, coins }: { signedIn: boolean; coins: number }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Coins className="size-4 text-primary" />
        {signedIn ? (
          <>
            <strong className="text-foreground">{coins}</strong> coins ·{" "}
            <span>{COIN_COST} per film</span>
          </>
        ) : (
          <>Each film costs {COIN_COST} coins — sign in to use yours.</>
        )}
      </span>
      {signedIn ? (
        <Link
          to="/dramawave/rewards"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Earn coins
        </Link>
      ) : (
        <Link to="/auth" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      )}
    </div>
  );
}
