import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Film, Loader2, Play, RotateCcw, Sparkles } from "lucide-react";

import { checkStatus, generateVideo, STYLES } from "@/lib/storyreel.functions";
import { getSessionId } from "@/lib/session";
import { Button } from "@/components/ui/button";
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
    generate.mutate();
  };

  const reset = () => {
    setPhase("create");
    setGenerationId(null);
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
              idea={idea}
              setIdea={setIdea}
              style={style}
              setStyle={setStyle}
              onSubmit={submit}
              pending={generate.isPending || !sessionId}
            />
          </>
        )}

        {phase === "working" && <WorkingState statusText={statusText} />}

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
    <section className="surface-cinema mt-10 rounded-3xl p-5 sm:p-7">
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

function WorkingState({ statusText }: { statusText: "queued" | "processing" }) {
  return (
    <section className="surface-cinema mt-6 rounded-3xl p-8 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-border/70">
        <Film className="size-7 animate-reel text-gold" aria-hidden />
      </div>
      <h2 className="mt-6 font-display text-3xl text-foreground">Creating your short film...</h2>
      <p className="mt-3 text-sm text-muted-foreground">
        {statusText === "queued" ? "Waiting in line" : "Filming your scene"} — this usually takes a
        couple of minutes. Keep this page open.
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
      <Button
        onClick={onRetry}
        className="btn-gold mt-8 h-12 rounded-2xl px-8 text-xs font-semibold uppercase tracking-[0.2em]"
      >
        <RotateCcw className="mr-2 size-4" /> Try again
      </Button>
    </section>
  );
}
