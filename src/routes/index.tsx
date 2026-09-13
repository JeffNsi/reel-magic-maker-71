import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
} from "@/lib/storyreel.functions";
import { getProfile } from "@/lib/dramawave.functions";
import { supabase } from "@/integrations/supabase/client";
import { narrateGeneration } from "@/lib/story.functions";
import { getSessionId } from "@/lib/session";
import { FilmPlayer } from "@/components/film-player";
import { StoryPack } from "@/components/story-pack";
import { StylePicker } from "@/components/landing/style-picker";
import { Reveal } from "@/components/landing/reveal";
import { Gallery } from "@/components/landing/gallery";
import { Faq, HowItWorks, Pricing, SiteFooter, SocialProof } from "@/components/landing/sections";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Jeje Inc Vibe — Turn your idea into a short film" },
      {
        name: "description",
        content:
          "Write one idea, pick a style, and Jeje Inc Vibe generates a vertical cinematic AI short you can watch and download.",
      },
      { property: "og:title", content: "Jeje Inc Vibe — Cinematic AI shorts from a single idea" },
      {
        property: "og:description",
        content:
          "Write one idea, pick a style, and Jeje Inc Vibe generates a vertical cinematic AI short you can watch and download.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StoryReel,
});

const MAX_IDEA = 500;

const EXAMPLE_PROMPTS = [
  "A lone astronaut on a desert planet at sunset",
  "A neon-soaked Tokyo alley in the rain",
  "A dragon circling a medieval castle at dawn",
  "An old lighthouse in a storm, cinematic wide shot",
];

const FORMATS = [
  { value: "9:16", label: "9:16", available: true },
  { value: "1:1", label: "1:1", available: false },
  { value: "16:9", label: "16:9", available: false },
];

type Phase = "create" | "working" | "done" | "error";

function StoryReel() {
  const [sessionId, setSessionId] = useState("");
  const [idea, setIdea] = useState("");
  const [style, setStyle] = useState<string>("cinematic");
  const [audio, setAudio] = useState(true);
  const [engine, setEngine] = useState<"lovable" | "fal">("lovable");
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
    mutationFn: () => start({ data: { idea, style, audio, engine, session_id: sessionId } }),
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
    <div id="top" className="min-h-screen bg-background selection:bg-primary/30">
      <a
        href="#create"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to the generator
      </a>
      <Header />
      <main className="mx-auto w-full max-w-3xl px-4 pb-8 pt-0 sm:px-6">
        {(phase === "create" || phase === "working") && (
          <>
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
              </>
            )}
            <div id="create" className="scroll-mt-24" />
            <CoinBar signedIn={!!user} coins={coins} />
            <CreateCard
              idea={idea}
              setIdea={setIdea}
              style={style}
              setStyle={setStyle}
              audio={audio}
              setAudio={setAudio}
              engine={engine}
              setEngine={setEngine}
              onSubmit={submit}
              isPending={generate.isPending || !sessionId}
              phase={phase}
              statusText={statusText}
              startedAt={startedAt}
              queuePosition={queuePosition}
            />
            {phase === "create" && (
              <>
                <Gallery />
                <HowItWorks />
                <SocialProof />
                <Pricing />
                <Faq />
                <SiteFooter />
              </>
            )}
          </>
        )}

        {phase === "done" && videoUrl && (
          <ResultState
            videoUrl={videoUrl}
            onReset={reset}
            generationId={generationId}
            sessionId={sessionId}
            idea={idea}
            withSound={audio}
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
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? "border-b border-border bg-background/90 backdrop-blur-md"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          to="/"
          className="font-display text-2xl italic tracking-tight text-primary transition-opacity hover:opacity-80"
        >
          Jeje Inc Vibe
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
          {[
            { label: "Generator", href: "#create" },
            { label: "Gallery", href: "#gallery" },
            { label: "How it works", href: "#how" },
            { label: "Pricing", href: "#pricing" },
            { label: "FAQ", href: "#faq" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(e) => {
                e.preventDefault();
                scrollTo(item.href.slice(1));
              }}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <Link
            to="/auth"
            className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Sign in
          </Link>
          <Button
            onClick={() => scrollTo("create")}
            className="h-9 rounded-xl bg-primary px-4 text-[11px] font-semibold uppercase tracking-widest text-primary-foreground hover:shadow-[0_0_20px_var(--glow)]"
          >
            Get started
          </Button>
        </div>
      </div>
    </header>
  );
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Hero() {
  return (
    <section className="mb-14 pt-28 text-center sm:pt-32">
      <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
        <Film className="size-3.5" aria-hidden /> AI short film studio
      </p>
      <h1 className="font-display text-5xl italic leading-tight text-foreground sm:text-7xl">
        Turn your idea into a <span className="text-primary">short film.</span>
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-balance text-lg font-light leading-relaxed text-muted-foreground">
        AI-generated cinematic vertical videos, ready to post — in under 3 minutes.
      </p>
      <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button
          onClick={() => scrollTo("create")}
          className="bg-primary text-primary-foreground hover:shadow-[0_0_28px_var(--glow)] h-12 w-full rounded-2xl px-8 text-xs font-semibold uppercase tracking-[0.2em] sm:w-auto"
        >
          Create your film
        </Button>
        <Button
          onClick={() => scrollTo("gallery")}
          variant="outline"
          className="h-12 w-full rounded-2xl px-8 text-xs font-semibold uppercase tracking-[0.2em] sm:w-auto"
        >
          Watch examples
        </Button>
      </div>
      <p className="mt-5 text-xs text-muted-foreground">
        No credit card required · 3 free renders
      </p>
    </section>
  );
}

const ENGINES = [
  { value: "lovable" as const, label: "Ezy", note: "Included credits" },
  { value: "fal" as const, label: "Strong", note: "Your own account" },
];

function CreateCard({
  idea,
  setIdea,
  style,
  setStyle,
  audio,
  setAudio,
  engine,
  setEngine,
  onSubmit,
  isPending,
  phase,
  statusText,
  startedAt,
  queuePosition,
}: {
  idea: string;
  setIdea: (v: string) => void;
  style: string;
  setStyle: (v: string) => void;
  audio: boolean;
  setAudio: (v: boolean) => void;
  engine: "lovable" | "fal";
  setEngine: (v: "lovable" | "fal") => void;
  onSubmit: () => void;
  isPending: boolean;
  phase: Phase;
  statusText: "queued" | "processing";
  startedAt: number | null;
  queuePosition: number | null;
}) {
  const working = phase === "working";
  const buttonBusy = working || isPending;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-cinema)] sm:p-8">
      <div className="pointer-events-none absolute -mr-16 -mt-16 right-0 top-0 size-64 rounded-full bg-primary/10 blur-[100px]" />

      <div className="relative space-y-8">
        {!working && (
          <>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Need inspiration? Try one of these:
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setIdea(example.slice(0, MAX_IDEA))}
                    className="rounded-full border border-border bg-background/50 px-3.5 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/60 hover:text-foreground hover:shadow-[0_0_12px_var(--glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-end justify-between">
                <label
                  htmlFor="idea"
                  className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  Your script / prompt
                </label>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
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

            <StylePicker value={style} onChange={setStyle} />

            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset>
                <legend className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Format
                </legend>
                <div className="flex gap-2">
                  {FORMATS.map((format) => (
                    <button
                      key={format.value}
                      type="button"
                      disabled={!format.available}
                      aria-pressed={format.available}
                      title={format.available ? undefined : "Coming soon"}
                      className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        format.available
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background/40 text-muted-foreground"
                      }`}
                    >
                      {format.label}
                      <span className="mt-0.5 block text-[10px] font-normal">
                        {format.available ? "5 seconds" : "Soon"}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="flex items-center justify-between self-end rounded-xl border border-border bg-background/50 px-4 py-3">
                <label htmlFor="audio" className="text-sm text-muted-foreground">
                  Voice + music
                </label>
                <Switch id="audio" checked={audio} onCheckedChange={setAudio} />
              </div>
            </div>

            <fieldset>
              <legend className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Film engine
              </legend>
              <div className="grid grid-cols-2 gap-3">
                {ENGINES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setEngine(option.value)}
                    aria-pressed={engine === option.value}
                    className={`rounded-xl border px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest transition-colors ${
                      engine === option.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {option.label}
                    <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal">
                      {option.note}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {working && (
          <div className="py-8 text-center">
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
          </div>
        )}

        <div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={onSubmit}
              disabled={buttonBusy}
              className="group h-[52px] flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-all hover:shadow-[0_0_24px_var(--glow)] active:scale-[0.98]"
            >
              {buttonBusy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Rendering…
                </>
              ) : (
                <>
                  Generate video
                  <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </Button>
            {!buttonBusy && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => scrollTo("gallery")}
                className="h-[52px] rounded-xl px-6 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
              >
                Watch examples
              </Button>
            )}
          </div>

          {!working && (
            <p className="mb-3 text-center text-[11px] uppercase tracking-widest text-muted-foreground">
              Vertical 9:16 · 5 seconds · {audio ? "voice + music" : "silent"} · ~2–3 min render ·{" "}
              {COIN_COST} coins
            </p>
          )}

          {working && (
            <GenerationProgress startedAt={startedAt} statusText={statusText} queuePosition={queuePosition} />
          )}

          <p className="mt-3 text-center text-[11px] uppercase tracking-widest text-muted-foreground">
            No credit card required · 3 free renders
          </p>
        </div>
      </div>
    </section>
  );
}

function GenerationProgress({
  startedAt,
  statusText,
  queuePosition,
}: {
  startedAt: number | null;
  statusText: "queued" | "processing";
  queuePosition: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const percent = Math.min(99, Math.round((elapsed / ESTIMATED_SECONDS) * 100));
  const remaining = Math.max(0, ESTIMATED_SECONDS - elapsed);

  return (
    <div className="mt-6">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Generation progress"
        className="mx-auto h-2 w-full overflow-hidden rounded-full bg-border/60"
      >
        <div
          className="h-full rounded-full bg-gradient-gold transition-[width] duration-1000 ease-linear"
          style={{ width: `${Math.max(3, percent)}%` }}
        />
      </div>
      <div className="mx-auto mt-3 flex w-full items-center justify-between text-xs text-muted-foreground">
        <span>{percent}%</span>
        <span>{formatRemaining(remaining)}</span>
      </div>
      {statusText === "queued" && queuePosition !== null && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {queuePosition} ahead of you in line
        </p>
      )}
    </div>
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
  withSound,
}: {
  videoUrl: string;
  onReset: () => void;
  generationId: string | null;
  sessionId: string;
  idea: string;
  withSound: boolean;
}) {
  const narrate = useServerFn(narrateGeneration);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const narrated = useRef(false);

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

  // Sound was requested up front, so mix the voice and music in the same run —
  // no faders to match by hand.
  const startNarration = narration.mutate;
  useEffect(() => {
    if (!withSound || !generationId || narrated.current || !idea.trim()) return;
    narrated.current = true;
    startNarration({ text: idea.trim().slice(0, 200), voice: "alloy", music: "wonder" });
  }, [generationId, idea, startNarration, withSound]);

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
