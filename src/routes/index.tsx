import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Download, Film, Loader2, RotateCcw } from "lucide-react";

import { checkStatus, COIN_COST, generateVideo } from "@/lib/storyreel.functions";
import { getProfile } from "@/lib/vibe.functions";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import { StylePicker } from "@/components/landing/style-picker";
import { Faq, HowItWorks, Learn, Pricing, SiteFooter, SocialProof } from "@/components/landing/sections";
import { Gallery } from "@/components/landing/gallery";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "STORYREEL — Turn your story into a cinematic short" },
      {
        name: "description",
        content:
          "Describe your idea and STORYREEL transforms it into a vertical AI video you can watch and download.",
      },
      { property: "og:title", content: "STORYREEL — Turn your story into a cinematic short" },
      {
        property: "og:description",
        content:
          "Describe your idea and STORYREEL transforms it into a vertical AI video you can watch and download.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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

type Phase = "create" | "working" | "done" | "error";

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
    mutationFn: () =>
      start({ data: { idea, style, audio: true, engine, session_id: sessionId } }),
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
    setStatusText("queued");
    generate.mutate();
  };

  const reset = () => {
    setPhase("create");
    setGenerationId(null);
    setVideoUrl(null);
    setErrorMessage(null);
  };

  return (
    <div id="top" className="min-h-screen bg-background selection:bg-primary/30">
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
              <h1 className="font-display text-4xl italic leading-[1.05] text-foreground sm:text-6xl">
                Turn your story into a <span className="text-primary">cinematic short.</span>
              </h1>
              <p className="mx-auto mt-4 max-w-md text-balance text-base font-light leading-relaxed text-muted-foreground sm:text-lg">
                Describe your idea and StoryReel transforms it into a vertical AI video.
              </p>
            </section>

            <div id="create" className="scroll-mt-24" />
            <CreateCard
              idea={idea}
              setIdea={setIdea}
              style={style}
              setStyle={setStyle}
              onSubmit={submit}
              busy={generate.isPending || !sessionId || phase === "working"}
              working={phase === "working"}
              statusText={statusText}
            />

            {phase === "create" && <Learn />}
          </>
        )}

        {phase === "done" && videoUrl && (
          <ResultState videoUrl={videoUrl} generationId={generationId} onReset={reset} />
        )}

        {phase === "error" && (
          <ErrorState
            message={errorMessage ?? "The film could not be rendered this time."}
            onRetry={reset}
          />
        )}
      </main>

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
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          to="/"
          className="mr-4 shrink-0 text-sm font-semibold uppercase tracking-[0.2em] text-foreground transition-opacity hover:opacity-70 sm:tracking-[0.35em]"
        >
          Story<span className="text-primary">reel</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-5 sm:gap-7">
          <a
            href="#create"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById("create")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Create
          </a>
          <a
            href="#learn"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById("learn")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Learn
          </a>
          <Link
            to={signedIn ? "/history" : "/auth"}
            className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
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
  onSubmit,
  busy,
  working,
  statusText,
}: {
  idea: string;
  setIdea: (v: string) => void;
  style: string;
  setStyle: (v: string) => void;
  onSubmit: () => void;
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
              <span className="shrink-0 text-[10px] tabular-nums tracking-widest text-muted-foreground/70">
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
              className="min-h-[168px] resize-none rounded-2xl border-border/70 bg-background/40 p-4 text-base leading-relaxed placeholder:text-muted-foreground/60 focus-visible:border-primary/50"
            />
          </div>

          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
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
                  Generate short
                  <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </Button>
            <p className="mt-3 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
              Vertical 9:16 · 5 seconds
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
      <p className="mt-4 text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70">
        {statusText === "queued" ? "Queued" : "Processing"} · keep this page open
      </p>
    </div>
  );
}

function ResultState({
  videoUrl,
  generationId,
  onReset,
}: {
  videoUrl: string;
  generationId: string | null;
  onReset: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [downloading, setDownloading] = useState(false);
  const filename = `storyreel-${generationId ?? "short"}.mp4`;

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
