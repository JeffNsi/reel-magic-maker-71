import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Download, Film, Loader2, RotateCcw } from "lucide-react";

import { checkStatus, COIN_COST, generateVideo } from "@/lib/storyreel.functions";
import { buildFilm } from "@/lib/film.functions";
import { getProfile } from "@/lib/vibe.functions";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import { StylePicker } from "@/components/landing/style-picker";
import { Faq, Pricing, SiteFooter } from "@/components/landing/sections";
import {
  BeforeYouStart,
  CreativeIntelligence,
  DirectorPrimer,
  DirectorSequence,
  NotPromptToVideo,
  StayInControl,
} from "@/components/landing/director-story";

import { FILM_PRICE_COPY } from "@/components/landing/copy";
import { Gallery } from "@/components/landing/gallery";
import { DirectorPanel } from "@/components/director/director-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shortizereel — AI Creative Director for Short Films" },
      { name: "author", content: "Shortizereel" },
      { name: "apple-mobile-web-app-title", content: "Shortizereel" },
      {
        name: "description",
        content:
          "Develop your idea into a cinematic short with Shortizereel's AI Creative Director. One film costs 70 credits. Finished clips can also be purchased separately for 29 kr.",
      },
      { property: "og:title", content: "Shortizereel — AI Creative Director for Short Films" },
      {
        property: "og:description",
        content: "Shortizereel: you bring the idea. Your AI Director finds the film inside it.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://reel-magic-maker-71.lovable.app/" },
      {
        property: "og:image",
        content: "https://reel-magic-maker-71.lovable.app/og-director.jpg",
      },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:image",
        content: "https://reel-magic-maker-71.lovable.app/og-director.jpg",
      },
    ],
    links: [{ rel: "canonical", href: "https://reel-magic-maker-71.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Shortizereel",
          applicationCategory: "MultimediaApplication",
          operatingSystem: "Web",
          url: "https://reel-magic-maker-71.lovable.app/",
          description:
            "An AI Creative Director that helps develop a story idea, discover creative possibilities, test scenes and direct the generation of a cinematic short film.",
        }),
      },
    ],
  }),

  component: StoryReel,
});

const MAX_IDEA = 500;
const PLACEHOLDER =
  "A young filmmaker arrives in Stockholm at midnight with only a suitcase and a dream.";

/** The four styles offered in the V1 create flow. */
const V1_STYLES = ["cinematic", "anime", "realistic", "claymation"];

/** True-story twist prompts — one tap fills the idea field. */
const EXAMPLE_PROMPTS: { label: string; prompt: string }[] = [
  {
    label: "The canoe man",
    prompt:
      "A woman weeps beside an empty canoe on a rocky shore, surrounded by police. The camera swings toward the window of the house behind her — a shadow moves behind the curtain.",
  },
  {
    label: "The fake surgeon",
    prompt:
      "A field surgeon aboard a warship calmly operates on a wounded soldier under pressure. The camera zooms in on his trembling hands and a hidden medical textbook under the table — he never trained as a doctor.",
  },
  {
    label: "The fairy hoax",
    prompt:
      "A young girl in early 1900s clothing photographs smiling fairies among the flowers. The camera slowly pulls back to reveal the fairies are only thin paper cutouts pinned with hat pins.",
  },
  {
    label: "Selling the Eiffel Tower",
    prompt:
      "An elegant man in a suit shakes hands with a businessman in front of the Eiffel Tower and hands over an official document. He turns away and smiles to himself as he walks off — the document is completely fake.",
  },
  {
    label: "The lost aristocrat",
    prompt:
      "A heavyset man in fine clothes is embraced by a weeping elderly woman crying 'my son, you're alive'. The camera catches his uncertain glance as someone in the background whispers a question in French he doesn't understand.",
  },
  {
    label: "The lost violin",
    prompt:
      "A street musician plays violin in a subway station while passers-by ignore him completely. The camera zooms in on the violin's engraving — it reveals the instrument is worth millions of dollars.",
  },
  {
    label: "The doctor in disguise",
    prompt:
      "A strict army doctor in Victorian uniform gives orders at a field hospital, self-assured and authoritative. The camera cuts to a silent mortuary decades later, where an assistant dressing the body gasps and stares in shock toward the camera.",
  },
  {
    label: "The invisible robber",
    prompt:
      "A man rubs lemon juice into his face in front of a mirror, smiling confidently. The camera cuts to him walking straight into a bank — the security camera captures his face crystal clear.",
  },
  {
    label: "The island that vanished",
    prompt:
      "A research vessel approaches the coordinates of an island marked on an old nautical chart. The camera pans across the horizon — there is nothing there, only open water in every direction.",
  },
  {
    label: "His own double",
    prompt:
      "An adult man with tense eyes is embraced by a crying family who believe he is their missing son. The camera catches his lips forming a word with a clear foreign accent that no one in the family reacts to.",
  },
];

type Phase = "create" | "director" | "working" | "done" | "error";

type Engine = "lovable" | "fal" | "live";

/** The three film engines a creator can pick between. */
const ENGINES: { id: Engine; label: string; note: string }[] = [
  { id: "lovable", label: "EZY", note: "Easiest — uses your included credits" },
  { id: "fal", label: "STRONG", note: "Kling video via the connected fal.ai account" },
  { id: "live", label: "LIVE", note: "MiniMax Director video via the fal.ai queue" },
];

/** Turns a backend failure into language a filmmaker can act on. */
function friendlyError(raw: string | null | undefined) {
  const message = (raw ?? "").trim();
  if (/balance|credit|quota|exhaust|insufficient|402/i.test(message)) {
    return "Your video account is out of credit. Please top up your balance and try again.";
  }
  if (!message || /\{|\}|^[A-Z_]+$|status code|fetch failed/i.test(message)) {
    return "The film could not be rendered this time. Please try again.";
  }
  return message;
}

function StoryReel() {
  const [sessionId, setSessionId] = useState("");
  const [idea, setIdea] = useState("");
  const [style, setStyle] = useState("cinematic");
  const [engine, setEngine] = useState<Engine>("lovable");
  const navigate = useNavigate();
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("create");
  const [statusText, setStatusText] = useState<"queued" | "processing">("queued");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [directorSessionId, setDirectorSessionId] = useState<string | null>(null);

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
    mutationFn: (input: { prompt: string; directorSessionId?: string | undefined }) =>
      start({
        data: {
          idea: input.prompt,
          style,
          audio: true,
          engine,
          session_id: sessionId,
          director_session_id: input.directorSessionId,
        },
      }),
    onSuccess: (result) => {
      setGenerationId(result.generation_id);
      void refetchProfile();
      if (result.status === "failed") {
        setErrorMessage(friendlyError(result.error_message));
        setPhase("error");
      } else {
        setStatusText(result.status === "queued" ? "queued" : "processing");
        setPhase("working");
      }
    },
    onError: (err: Error) => {
      setErrorMessage(friendlyError(err.message));
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
        setErrorMessage(friendlyError(result.error_message));
        setPhase("error");
      } else {
        setStatusText(result.status === "queued" ? "queued" : "processing");
      }
      return result;
    },
  });

  /** Generation itself is unchanged — only the prompt it receives differs. */
  const render = (prompt: string, directorSessionId?: string) => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (coins < COIN_COST) {
      navigate({ to: "/vibe/rewards" });
      return;
    }
    setErrorMessage(null);
    setVideoUrl(null);
    setStatusText("queued");
    setDirectorSessionId(directorSessionId ?? null);
    generate.mutate({ prompt, directorSessionId });
  };

  /** The idea box opens the director instead of rendering straight away. */
  const submit = () => {
    if (!idea.trim()) {
      toast.error("Describe your story first.");
      return;
    }
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (coins < COIN_COST) {
      navigate({ to: "/vibe/rewards" });
      return;
    }
    setErrorMessage(null);
    setVideoUrl(null);
    setPhase("director");
  };

  const submitDirect = () => {
    if (!idea.trim()) {
      toast.error("Describe your story first.");
      return;
    }
    render(idea);
  };

  const reset = () => {
    setPhase("create");
    setGenerationId(null);
    setVideoUrl(null);
    setErrorMessage(null);
  };

  return (
    <div id="top" className="shortizereel-home min-h-screen bg-background selection:bg-primary/30">
      <a
        href="#create"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to the generator
      </a>
      <Header signedIn={!!user} />

      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        {(phase === "create" || phase === "working") && (
          <>
            <section className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-primary">
                AI Creative Director
              </p>
              <h1 className="mt-4 font-display text-4xl italic leading-[1.05] text-foreground sm:text-6xl">
                You bring the idea.{" "}
                <span className="text-primary">Your AI Director finds the film inside it.</span>
              </h1>
              <p className="mx-auto mt-4 max-w-lg text-balance text-base font-light leading-relaxed text-muted-foreground sm:text-lg">
                Give Shortizereel an idea. Your AI Director asks what matters, discovers what&apos;s
                missing, finds cinematic possibilities, and helps shape the strongest version of
                your story before you generate it.
              </p>
              <div className="mt-7 flex flex-col items-center gap-3">
                <Button
                  onClick={() =>
                    document.getElementById("idea")?.scrollIntoView({ behavior: "smooth" })
                  }
                  className="group h-14 w-full max-w-xs rounded-2xl bg-primary text-xs font-semibold uppercase tracking-[0.25em] text-primary-foreground hover:shadow-[0_0_28px_var(--glow)]"
                >
                  Start with an idea
                  <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById("idea");
                    el?.scrollIntoView({ behavior: "smooth" });
                    (el as HTMLTextAreaElement | null)?.focus();
                  }}
                  className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
                >
                  Already know what you want? Write it below and skip the Director.
                </button>
              </div>
            </section>

            <div id="create" className="scroll-mt-24" />
            {phase === "create" && <DirectorPrimer />}
            <CreateCard
              idea={idea}
              setIdea={setIdea}
              style={style}
              setStyle={setStyle}
              engine={engine}
              setEngine={setEngine}
              onSubmit={submit}
              onSubmitDirect={submitDirect}
              busy={generate.isPending || !sessionId || phase === "working"}
              working={phase === "working"}
              statusText={statusText}
            />

            {phase === "create" && <BeforeYouStart signedIn={!!user} />}
          </>
        )}

        {phase === "director" && sessionId && (
          <DirectorPanel
            sessionId={sessionId}
            idea={idea}
            style={style}
            generating={generate.isPending}
            onGenerate={(blueprint, directorSessionId) => render(blueprint, directorSessionId)}
            onCancel={() => setPhase("create")}
          />
        )}

        {phase === "done" && videoUrl && (
          <ResultState
            videoUrl={videoUrl}
            generationId={generationId}
            sessionId={sessionId}
            directorSessionId={directorSessionId}
            onReset={reset}
          />
        )}

        {phase === "error" && (
          <ErrorState
            message={errorMessage ?? "The film could not be rendered this time."}
            onRetry={reset}
          />
        )}
      </main>

      {phase === "create" && (
        <div className="mx-auto w-full max-w-[1248px] px-4 pb-12 sm:px-6">
          <NotPromptToVideo />
          <DirectorSequence />
          <CreativeIntelligence />
          <StayInControl />
          <Gallery />

          <Pricing />
          <Faq />
          <SiteFooter />
        </div>
      )}
    </div>
  );
}

function Header({ signedIn }: { signedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled ? "border-b border-border bg-background/85 backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1248px] items-center justify-between px-4 sm:px-6">
        <Link
          to="/"
          className="mr-4 shrink-0 text-sm font-semibold uppercase tracking-[0.2em] text-foreground transition-opacity hover:opacity-70 "
        >
          Shortizereel
        </Link>
        <nav aria-label="Main" className="flex items-center gap-3 sm:gap-7">
          <a
            href="#create"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById("create")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="text-xs font-medium uppercase tracking-normal text-muted-foreground transition-colors hover:text-foreground"
          >
            Create
          </a>
          <a
            href="#director"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById("director")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="text-xs font-medium uppercase tracking-normal text-muted-foreground transition-colors hover:text-foreground"
          >
            Director
          </a>
          <Link
            to={signedIn ? "/history" : "/auth"}
            className="text-xs font-medium uppercase tracking-normal text-muted-foreground transition-colors hover:text-foreground"
          >
            {signedIn ? "My shorts" : "Sign in"}
          </Link>
        </nav>
      </div>
    </header>
  );
}

function CreateCard({
  idea,
  setIdea,
  style,
  setStyle,
  engine,
  setEngine,
  onSubmit,
  onSubmitDirect,
  busy,
  working,
  statusText,
}: {
  idea: string;
  setIdea: (v: string) => void;
  style: string;
  setStyle: (v: string) => void;
  engine: Engine;
  setEngine: (v: Engine) => void;
  onSubmit: () => void;
  onSubmitDirect: () => void;
  busy: boolean;
  working: boolean;
  statusText: "queued" | "processing";
}) {
  return (
    <section className="relative mt-8 overflow-hidden rounded-3xl border border-border/80 bg-card/70 p-5 shadow-[var(--shadow-cinema)] backdrop-blur-xl sm:mt-10 sm:p-8">
      <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-primary/10 blur-[110px]" />

      {working ? (
        <WorkingState statusText={statusText} />
      ) : (
        <div className="relative space-y-6">
          <div>
            <div className="mb-2 flex items-end justify-between gap-3">
              <label
                htmlFor="idea"
                className="font-display text-xl italic text-foreground sm:text-2xl"
              >
                Describe your story...
              </label>
              <span className="shrink-0 text-[10px] tabular-nums tracking-widest text-muted-foreground">
                {idea.length}/{MAX_IDEA}
              </span>
            </div>
            <Textarea
              id="idea"
              value={idea}
              onChange={(e) => setIdea(e.target.value.slice(0, MAX_IDEA))}
              rows={5}
              maxLength={MAX_IDEA}
              placeholder={PLACEHOLDER}
              className="min-h-[168px] resize-none rounded-2xl border-border/70 bg-background/40 p-4 text-base leading-relaxed placeholder:text-muted-foreground focus-visible:border-primary/50"
            />
          </div>

          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              True stories — tap to try
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => setIdea(example.prompt)}
                  disabled={busy}
                  className="rounded-full border border-border/70 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
                >
                  {example.label}
                </button>
              ))}
            </div>
          </div>

          <StylePicker value={style} onChange={setStyle} only={V1_STYLES} />

          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Film engine
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {ENGINES.map((item) => {
                const active = engine === item.id;
                return (
                  <Button
                    variant="outline"
                    key={item.id}
                    type="button"
                    onClick={() => setEngine(item.id)}
                    disabled={busy}
                    aria-pressed={active}
                    className={`h-auto min-h-24 flex-col items-start whitespace-normal rounded-lg border px-3 py-3 text-left transition-colors disabled:opacity-50 ${
                      active
                        ? "border-primary/60 bg-primary/10"
                        : "border-border/70 bg-background/40 hover:border-primary/40"
                    }`}
                  >
                    <span
                      className={`block text-xs font-semibold uppercase tracking-[0.18em] ${
                        active ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      {item.note}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>

          <div>
            <Button
              onClick={onSubmit}
              disabled={busy}
              className="group h-14 w-full rounded-2xl bg-primary text-xs font-semibold uppercase tracking-[0.25em] text-primary-foreground transition-all hover:shadow-[0_0_28px_var(--glow)] active:scale-[0.99]"
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Generating
                </>
              ) : (
                <>
                  Develop with the Director
                  <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </Button>
            <button
              type="button"
              onClick={onSubmitDirect}
              disabled={busy}
              className="mt-3 w-full text-center text-[10px] uppercase tracking-normal text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              Skip the Director — generate now
            </button>
            <p className="mt-2 text-center text-[10px] leading-relaxed text-muted-foreground">
              Already know exactly what you want? Generate directly. Either way, nothing is
              generated and no credits are used until you choose to make the film.
            </p>
            <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
              {FILM_PRICE_COPY}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

/** Honest asynchronous state: an elegant indeterminate indicator, no invented percentage. */
function WorkingState({ statusText }: { statusText: "queued" | "processing" }) {
  return (
    <div className="relative py-10 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-border/70">
        <Film className="size-7 animate-reel text-primary" aria-hidden />
      </div>
      <h2 className="mt-6 font-display text-2xl italic text-foreground sm:text-3xl">
        Creating your short film...
      </h2>
      <p className="mt-3 text-sm text-muted-foreground">
        Your idea is being transformed into video.
      </p>
      <div
        role="status"
        aria-live="polite"
        className="mx-auto mt-8 h-1 w-40 overflow-hidden rounded-full bg-border/60"
      >
        <div className="h-full w-1/3 animate-[slide-in-right_1.4s_ease-in-out_infinite] rounded-full bg-primary" />
      </div>
      <p className="mt-4 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        {statusText === "queued" ? "Queued" : "Processing"} · keep this page open
      </p>
    </div>
  );
}

function ResultState({
  videoUrl,
  generationId,
  sessionId,
  directorSessionId,
  onReset,
}: {
  videoUrl: string;
  generationId: string | null;
  sessionId: string;
  directorSessionId: string | null;
  onReset: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [downloading, setDownloading] = useState(false);
  const filename = `shortizereel-${generationId ?? "short"}.mp4`;
  const navigate = useNavigate();
  const build = useServerFn(buildFilm);

  /** Turn the approved film bible into a scene-by-scene film page. */
  const buildFull = useMutation({
    mutationFn: () =>
      build({ data: { director_session_id: directorSessionId!, session_id: sessionId } }),
    onSuccess: (film) => navigate({ to: "/film/$filmId", params: { filmId: film.id } }),
    onError: (err: Error) => toast.error(err.message),
  });

  const download = async () => {
    setDownloading(true);
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch {
      window.open(videoUrl, "_blank", "noreferrer");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="text-center">
      <h2 className="text-xs font-semibold uppercase tracking-[0.35em] text-primary">
        Your short is ready
      </h2>

      <div className="mx-auto mt-6 w-full max-w-[340px] overflow-hidden rounded-3xl border border-border/70 bg-black shadow-[var(--shadow-cinema)]">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          autoPlay
          playsInline
          className="aspect-[9/16] w-full bg-black object-contain"
        />
      </div>

      <div className="mx-auto mt-6 flex w-full max-w-[340px] flex-col gap-3">
        <Button
          onClick={() => void download()}
          disabled={downloading}
          className="h-14 w-full rounded-2xl bg-primary text-xs font-semibold uppercase tracking-[0.25em] text-primary-foreground hover:shadow-[0_0_24px_var(--glow)]"
        >
          {downloading ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Download className="mr-2 size-4" />
          )}
          Download
        </Button>
        {directorSessionId && (
          <Button
            onClick={() => buildFull.mutate()}
            disabled={buildFull.isPending}
            variant="outline"
            className="h-14 w-full rounded-2xl text-xs font-semibold uppercase tracking-[0.25em]"
          >
            {buildFull.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Film className="mr-2 size-4" />
            )}
            Build the full film
          </Button>
        )}
        <Button
          onClick={onReset}
          variant="outline"
          className="h-14 w-full rounded-2xl text-xs font-semibold uppercase tracking-[0.25em]"
        >
          <RotateCcw className="mr-2 size-4" /> Create another
        </Button>
      </div>
    </section>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="mx-auto max-w-md rounded-3xl border border-border/80 bg-card/70 p-8 text-center backdrop-blur-xl">
      <h2 className="font-display text-3xl italic text-foreground">Something went wrong.</h2>
      <p className="mx-auto mt-3 text-sm leading-relaxed text-muted-foreground">{message}</p>
      <Button
        onClick={onRetry}
        className="mt-8 h-14 w-full rounded-2xl bg-primary text-xs font-semibold uppercase tracking-[0.25em] text-primary-foreground hover:shadow-[0_0_24px_var(--glow)]"
      >
        <RotateCcw className="mr-2 size-4" /> Try again
      </Button>
    </section>
  );
}
