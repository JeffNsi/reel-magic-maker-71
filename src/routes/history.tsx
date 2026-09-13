import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Film, Loader2 } from "lucide-react";

import {
  listGenerations,
  listMyGenerations,
  STYLES,
  type HistoryItem,
} from "@/lib/storyreel.functions";
import { getSessionId } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Your shorts — Jeje Inc Vibe film history" },
      {
        name: "description",
        content:
          "Revisit every short film you made with Jeje Inc Vibe: the idea behind it, the visual style, its status and the finished video.",
      },
      { property: "og:title", content: "Your shorts — Jeje Inc Vibe film history" },
      {
        property: "og:description",
        content:
          "Revisit every short film you made with Jeje Inc Vibe: the idea behind it, the visual style, its status and the finished video.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: History,
});

const STYLE_LABEL = Object.fromEntries(STYLES.map((s) => [s.value, s.label]));

const STATUS_LABEL: Record<HistoryItem["status"], string> = {
  queued: "Waiting in line",
  processing: "Being filmed",
  completed: "Ready",
  failed: "Failed",
};

function History() {
  const [sessionId, setSessionId] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    setSessionId(getSessionId());
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useServerFn(listGenerations);
  const loadMine = useServerFn(listMyGenerations);

  const { data, isPending } = useQuery({
    queryKey: ["history", userId ?? sessionId],
    enabled: !!userId || !!sessionId,
    refetchInterval: 15000,
    queryFn: () =>
      userId ? loadMine() : load({ data: { session_id: sessionId } }),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-5">
          <Link to="/" className="font-display text-2xl italic tracking-tight text-primary">
            Jeje Inc Vibe
          </Link>
          <Button asChild variant="ghost" className="h-9 rounded-full px-4">
            <Link to="/" className="text-xs uppercase tracking-[0.2em]">
              <ArrowLeft className="mr-2 size-4" /> Create
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 pb-24 pt-10">
        <h1 className="font-display text-4xl text-foreground">Your shorts</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {userId
            ? "Every film saved to your account."
            : "Every film you have made in this browser — sign in to keep them on your account."}
        </p>
        {!userId && (
          <Button asChild variant="outline" className="mt-4 h-10 rounded-full px-6">
            <Link to="/auth" search={{}} className="text-xs uppercase tracking-[0.2em]">
              Sign in to save your shorts
            </Link>
          </Button>
        )}

        {isPending && (
          <p className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading your shorts
          </p>
        )}

        {!isPending && (data?.length ?? 0) === 0 && (
          <div className="surface-cinema mt-8 rounded-3xl p-8 text-center">
            <Film className="mx-auto size-7 text-primary" aria-hidden />
            <p className="mt-4 text-sm text-muted-foreground">
              No shorts yet. Make your first one.
            </p>
            <Button asChild className="bg-primary text-primary-foreground hover:shadow-[0_0_24px_var(--glow)] mt-6 h-12 rounded-2xl px-8">
              <Link to="/" className="text-xs font-semibold uppercase tracking-[0.2em]">
                Create a short
              </Link>
            </Button>
          </div>
        )}

        <ul className="mt-8 space-y-4">
          {(data ?? []).map((item) => (
            <li key={item.id} className="surface-cinema rounded-3xl p-5">
              <div className="flex flex-col gap-5 sm:flex-row">
                {item.video_url ? (
                  <video
                    src={item.video_url}
                    controls
                    playsInline
                    preload="metadata"
                    className="aspect-[9/16] w-28 shrink-0 rounded-2xl bg-black object-cover"
                  />
                ) : (
                  <div className="flex aspect-[9/16] w-28 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/50">
                    <Film className="size-6 text-muted-foreground" aria-hidden />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em]">
                    <span className="text-primary">{STYLE_LABEL[item.style] ?? item.style}</span>
                    <span
                      className={
                        item.status === "failed" ? "text-destructive" : "text-muted-foreground"
                      }
                    >
                      {STATUS_LABEL[item.status]}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-foreground">{item.idea}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                  {item.status === "failed" && item.error_message && (
                    <p className="mt-2 text-xs text-destructive">{item.error_message}</p>
                  )}
                  {item.video_url && (
                    <a
                      href={item.video_url}
                      download={`jejeincvibe-${item.id}.mp4`}
                      className="mt-3 inline-block text-xs font-semibold uppercase tracking-[0.2em] text-primary underline-offset-4 hover:underline"
                    >
                      Download
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
