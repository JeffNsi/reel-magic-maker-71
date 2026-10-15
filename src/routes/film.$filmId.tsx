import { sceneCredits } from "@/lib/fal-prices";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Clapperboard,
  Coins,
  Copy,
  Eye,
  Globe,
  Loader2,
  Play,
  Star,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ClipPurchase } from "@/components/film/clip-purchase";
import { ContinuityPanel } from "@/components/film/continuity-panel";
import { SceneEngine } from "@/components/film/scene-engine";
import { UniverseFilmCard } from "@/components/universe/universe-ui";
import { SceneReferences } from "@/components/film/scene-references";
import { getSceneReferencePlans, type SceneReferencePlan } from "@/lib/canon.functions";
import { CLIP_PRICE_SEK } from "@/lib/clip-shop.functions";
import { getSessionId } from "@/lib/session";
import { approveRecovery, recoverScene } from "@/lib/recovery.functions";
import { getScenePlanes, type ScenePlaneView } from "@/lib/scene-plane.functions";
import { setFilmShare } from "@/lib/share.functions";
import { checkStatus } from "@/lib/storyreel.functions";
import {
  getFilm,
  queueScene,
  renderScene,
  reviewScenes,
  SHOT_COST,
  toggleWatchlist,
  type FilmScene,
  type FilmView,
} from "@/lib/film.functions";

export const Route = createFileRoute("/film/$filmId")({
  head: () => ({
    meta: [
      { title: "Film page — review your scenes, clips and budget | STORYREEL" },
      {
        name: "description",
        content:
          "Review your short film scene by scene: the shot list, the clip each scene produced, the credits every shot costs and the ones you queued to render next.",
      },
      { property: "og:title", content: "Your film, scene by scene — STORYREEL" },
      {
        property: "og:description",
        content:
          "Every scene of your short film with its clip, clarity review and credit budget in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FilmPage,
});

const VERDICT_LABEL: Record<string, string> = {
  clear: "Reads in five seconds",
  risky: "Fragile — may not read",
  unclear: "An audience would not follow this",
};

function verdictClass(verdict: string | null) {
  if (verdict === "clear") return "text-emerald-400";
  if (verdict === "risky") return "text-amber-400";
  if (verdict === "unclear") return "text-primary";
  return "text-muted-foreground";
}

function FilmPage() {
  const { filmId } = Route.useParams();
  const [sessionId, setSessionId] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => setSessionId(getSessionId()), []);

  const fetchFilm = useServerFn(getFilm);
  const poll = useServerFn(checkStatus);
  const startScene = useServerFn(renderScene);
  const runReview = useServerFn(reviewScenes);
  const setQueued = useServerFn(queueScene);
  const runRecovery = useServerFn(recoverScene);
  const okRecovery = useServerFn(approveRecovery);
  const setSaved = useServerFn(toggleWatchlist);
  const shareFilm = useServerFn(setFilmShare);
  const fetchReferencePlans = useServerFn(getSceneReferencePlans);
  const fetchEnginePlans = useServerFn(getScenePlanes);

  const filmQuery = useQuery({
    queryKey: ["film", filmId, sessionId],
    enabled: !!sessionId,
    /** A missing film is an answer, not a network hiccup — say so immediately. */
    retry: false,
    queryFn: () => fetchFilm({ data: { film_id: filmId, session_id: sessionId } }),
  });

  /** Which references each scene would use — read-only, no credits, no generation. */
  const plansQuery = useQuery({
    queryKey: ["scene-references", filmId, sessionId],
    enabled: !!sessionId,
    retry: false,
    queryFn: () => fetchReferencePlans({ data: { film_id: filmId, session_id: sessionId } }),
  });

  /**
   * What the Director would generate each scene with: model, reasoning, settings
   * and references. Read-only — nothing is generated and no credits are spent.
   */
  const enginePlansQuery = useQuery({
    queryKey: ["scene-planes", filmId, sessionId],
    enabled: !!sessionId,
    retry: false,
    queryFn: () => fetchEnginePlans({ data: { film_id: filmId, session_id: sessionId } }),
  });

  const film = filmQuery.data;
  const pending = (film?.scenes ?? []).filter(
    (scene) => scene.status === "queued" || scene.status === "processing",
  );

  /** Finish off any scene the engine is still working on, then refresh the page. */
  useQuery({
    queryKey: ["film-progress", filmId, pending.map((s) => s.generation_id).join(",")],
    enabled: !!sessionId && pending.length > 0,
    refetchInterval: 6000,
    queryFn: async () => {
      for (const scene of pending) {
        if (!scene.generation_id) continue;
        try {
          await poll({ data: { generation_id: scene.generation_id, session_id: sessionId } });
        } catch {
          /* keep polling the other scenes */
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["film", filmId] });
      return Date.now();
    },
  });

  const apply = (next: FilmView) => queryClient.setQueryData(["film", filmId, sessionId], next);

  const review = useMutation({
    mutationFn: () => runReview({ data: { film_id: filmId, session_id: sessionId } }),
    onSuccess: (next) => {
      apply(next);
      toast.success("Scene review updated.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const render = useMutation({
    mutationFn: (scene_id: string) =>
      startScene({ data: { film_id: filmId, session_id: sessionId, scene_id, audio: true } }),
    onSuccess: (result) => apply(result.film),
    onError: (err: Error) => toast.error(err.message),
  });

  /** A failed scene gets one recovery attempt: the director re-films the beat. */
  const recover = useMutation({
    mutationFn: (scene_id: string) =>
      runRecovery({ data: { film_id: filmId, session_id: sessionId, scene_id } }),
    onSuccess: (result) => {
      if (result.film) apply(result.film);
      if (result.outcome === "no_valid_recovery") toast.error(result.message);
      else toast.success(result.message);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const approve = useMutation({
    mutationFn: (scene_id: string) =>
      okRecovery({ data: { film_id: filmId, session_id: sessionId, scene_id } }),
    onSuccess: (result) => apply(result.film),
    onError: (err: Error) => toast.error(err.message),
  });

  const queue = useMutation({
    mutationFn: (input: { scene_id: string; queued: boolean }) =>
      setQueued({ data: { film_id: filmId, session_id: sessionId, ...input } }),
    onSuccess: apply,
    onError: (err: Error) => toast.error(err.message),
  });

  const watchlist = useMutation({
    mutationFn: (saved: boolean) =>
      setSaved({ data: { film_id: filmId, session_id: sessionId, saved } }),
    onSuccess: (result) => {
      void filmQuery.refetch();
      toast.success(result.saved ? "Saved to your watchlist." : "Removed from your watchlist.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  /** Public sharing: off until the creator turns it on, and revocable. */
  const share = useMutation({
    mutationFn: (shared: boolean) =>
      shareFilm({ data: { film_id: filmId, session_id: sessionId, shared } }),
    onSuccess: async (result) => {
      await filmQuery.refetch();
      if (result.slug) {
        const url = `${window.location.origin}/share/${result.slug}`;
        try {
          await navigator.clipboard.writeText(url);
          toast.success("Public link copied — anyone with it can watch this film.");
        } catch {
          toast.success("Public link ready — copy it from the share box.");
        }
      } else {
        toast.success("Sharing turned off. The old link no longer works.");
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const shareUrl = film?.share_slug
    ? `${typeof window === "undefined" ? "" : window.location.origin}/share/${film.share_slug}`
    : "";

  if (filmQuery.isLoading || !sessionId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </main>
    );
  }

  if (filmQuery.isError || !film) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="font-display text-3xl italic text-foreground">Film not found</h1>
        <p className="text-sm text-muted-foreground">
          This film was made in another browser, or it has been removed.
        </p>
        <Button asChild variant="outline">
          <Link to="/">Back to the generator</Link>
        </Button>
      </main>
    );
  }

  const queued = film.scenes.filter((scene) => scene.queued);
  const budget = film.scenes.reduce((sum, scene) => sum + scene.credit_cost, 0);
  const queuedBudget = queued.reduce((sum, scene) => sum + scene.credit_cost, 0);

  return (
    <main className="min-h-screen bg-background pb-20">
      <div className="mx-auto w-full max-w-3xl px-4 pt-8 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Create
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link to="/watchlist">Watchlist</Link>
            </Button>
            <Button
              variant={film.saved ? "default" : "outline"}
              size="sm"
              disabled={watchlist.isPending}
              onClick={() => watchlist.mutate(!film.saved)}
            >
              {film.saved ? (
                <BookmarkCheck className="mr-2 h-4 w-4" />
              ) : (
                <Bookmark className="mr-2 h-4 w-4" />
              )}
              {film.saved ? "Saved" : "Save film"}
            </Button>
          </div>
        </div>

        <header className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-primary">
            Your film
          </p>
          <h1 className="mt-3 font-display text-4xl italic leading-tight text-foreground sm:text-5xl">
            {film.title}
          </h1>
          {film.logline && (
            <p className="mt-3 max-w-xl text-base font-light leading-relaxed text-muted-foreground">
              {film.logline}
            </p>
          )}
        </header>

        <section className="mt-8 rounded-2xl border border-border/70 bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                <Globe className="h-4 w-4 text-primary" />
                Share this film
              </p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                {film.share_slug
                  ? "Anyone with this link can watch the finished scenes. Your notes, budget and story plan stay private."
                  : "Turn on a public link so clients can watch the finished scenes. Nothing else from this page is shared."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={film.share_slug ? "outline" : "default"}
                size="sm"
                disabled={share.isPending}
                onClick={() => share.mutate(!film.share_slug)}
              >
                {share.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Globe className="mr-2 h-4 w-4" />
                )}
                {film.share_slug ? "Stop sharing" : "Create public link"}
              </Button>
            </div>
          </div>

          {film.share_slug && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-background/60 p-3">
              <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {shareUrl}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    toast.success("Link copied.");
                  } catch {
                    toast.error("Copy the link from the box above.");
                  }
                }}
              >
                <Copy className="mr-2 h-4 w-4" /> Copy
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href={shareUrl} target="_blank" rel="noreferrer">
                  Open
                </a>
              </Button>
            </div>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-border/70 bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                <Coins className="h-4 w-4 text-primary" />
                Budget
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {budget} credits
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  for all {film.scenes.length} shots
                </span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {queued.length
                  ? `${queued.length} starred: ${queuedBudget} credits`
                  : "Star the scenes you want first and the queue total appears here."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={review.isPending}
              onClick={() => review.mutate()}
            >
              {review.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              Review scenes for clarity
            </Button>
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">
            Per scene: {SHOT_COST} credits · Whole film: {film.scenes.length} × {SHOT_COST} ={" "}
            {film.scenes.length * SHOT_COST} credits
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Every five-second EZY shot costs {SHOT_COST} credits — exactly what is charged when it
            renders. A start the video service rejects is refunded.
          </p>
        </section>

        <CreditDashboard
          scenes={film.scenes}
          pressCostFor={(id) =>
            (enginePlansQuery.data ?? []).find((p) => p.scene_id === id)?.ezy_credits ?? SHOT_COST
          }
        />

        <ContinuityPanel filmId={filmId} sessionId={sessionId} />

        {sessionId && (
          <div className="mt-6">
            <UniverseFilmCard filmId={filmId} sessionId={sessionId} />
          </div>
        )}

        <Link
          to="/canon/$filmId"
          params={{ filmId }}
          className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Clapperboard className="h-4 w-4" /> Open the Continuity Center — characters, world,
          timeline and conflicts
        </Link>

        <ol className="mt-8 space-y-5">
          {film.scenes.map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              plan={(plansQuery.data ?? []).find((p) => p.scene_id === scene.id)}
              enginePlan={(enginePlansQuery.data ?? []).find((p) => p.scene_id === scene.id)}
              filmId={filmId}
              sessionId={sessionId}
              rendering={render.isPending && render.variables === scene.id}
              recovering={
                (recover.isPending && recover.variables === scene.id) ||
                (approve.isPending && approve.variables === scene.id)
              }
              onRender={() => render.mutate(scene.id)}
              onRecover={() => recover.mutate(scene.id)}
              onApproveRecovery={() => approve.mutate(scene.id)}
              onQueue={() => queue.mutate({ scene_id: scene.id, queued: !scene.queued })}
            />
          ))}
        </ol>
      </div>
    </main>
  );
}

function SceneCard({
  scene,
  plan,
  enginePlan,
  filmId,
  sessionId,
  rendering,
  recovering,
  onRender,
  onRecover,
  onApproveRecovery,
  onQueue,
}: {
  scene: FilmScene;
  plan: SceneReferencePlan | undefined;
  enginePlan: ScenePlaneView | undefined;
  filmId: string;
  sessionId: string;
  rendering: boolean;
  recovering: boolean;
  onRender: () => void;
  onRecover: () => void;
  onApproveRecovery: () => void;
  onQueue: () => void;
}) {
  const working = scene.status === "queued" || scene.status === "processing";

  return (
    <li className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="flex flex-col gap-5 p-5 sm:flex-row">
        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                Scene {String(scene.scene_number).padStart(2, "0")}
              </p>
              <h2 className="mt-1 font-display text-2xl italic text-foreground">{scene.title}</h2>
            </div>
            <button
              type="button"
              onClick={onQueue}
              aria-label={scene.queued ? "Remove from render queue" : "Add to render queue"}
              className="rounded-full border border-border/70 p-2 text-muted-foreground transition hover:text-primary"
            >
              <Star className={`h-4 w-4 ${scene.queued ? "fill-primary text-primary" : ""}`} />
            </button>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{scene.idea}</p>

          {scene.narration && (
            <p className="mt-3 border-l-2 border-primary/50 pl-3 text-sm italic text-muted-foreground">
              {scene.narration}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <span className="font-semibold text-foreground">{scene.credit_cost} credits</span>
            {scene.complexity !== null && (
              <span className="text-muted-foreground">Complexity {scene.complexity}/10</span>
            )}
            {scene.clarity_verdict && (
              <span className={verdictClass(scene.clarity_verdict)}>
                {VERDICT_LABEL[scene.clarity_verdict]}
              </span>
            )}
            <span className="text-muted-foreground">Sells for {CLIP_PRICE_SEK} kr</span>
          </div>

          <ClipPurchase
            sceneId={scene.id}
            ready={scene.status === "completed" && !!scene.video_url}
          />

          {scene.clarity_note && (
            <p className="mt-3 rounded-xl bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
              {scene.clarity_note}
            </p>
          )}

          {scene.status === "failed" && scene.error_message && (
            <p className="mt-3 rounded-xl border border-primary/40 bg-primary/10 p-3 text-xs leading-relaxed text-foreground">
              {scene.error_message}
            </p>
          )}

          {scene.recovery && (
            <p className="mt-3 rounded-xl border border-border/70 bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
              {scene.recovery.note}
            </p>
          )}

          {scene.status === "failed" && !scene.recovery && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={recovering}
              onClick={onRecover}
            >
              {recovering && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Let the Director find another way
            </Button>
          )}

          {scene.recovery?.awaiting_approval && (
            <Button size="sm" className="mt-3" disabled={recovering} onClick={onApproveRecovery}>
              {recovering && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Film the Director's version
            </Button>
          )}

          <SceneReferences plan={plan} />

          {enginePlan ? (
            <SceneEngine
              plan={enginePlan}
              filmId={filmId}
              sessionId={sessionId}
              ezyBusy={rendering || working}
              onEzy={onRender}
            />
          ) : null}

          <div className="mt-5 flex items-center gap-3">
            {enginePlan ? null : (
              <Button size="sm" disabled={rendering || working} onClick={onRender}>
                {rendering || working ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Clapperboard className="mr-2 h-4 w-4" />
                )}
                {working
                  ? "Filming…"
                  : scene.status === "completed"
                    ? "Render again with Ezy"
                    : "Render with Ezy"}
              </Button>
            )}
            {scene.status === "completed" && scene.video_url && (
              <a
                href={scene.video_url}
                download={`storyreel-scene-${scene.scene_number}.mp4`}
                className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                Download
              </a>
            )}
          </div>
        </div>

        <div className="w-full shrink-0 sm:w-[172px]">
          <div className="aspect-[9/16] overflow-hidden rounded-xl border border-border/70 bg-black">
            {scene.video_url ? (
              <video
                src={scene.video_url}
                controls
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                {working ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-[11px] uppercase tracking-[0.2em]">Filming</span>
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5" />
                    <span className="text-[11px] uppercase tracking-[0.2em]">No clip yet</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/** Per-scene credit dashboard: budget, spent, remaining. Advisory, never blocks. */
function CreditDashboard({
  scenes,
  pressCostFor,
}: {
  scenes: FilmScene[];
  pressCostFor: (sceneId: string) => number;
}) {
  const rows = scenes.map((s) => ({ scene: s, ...sceneCredits(s, pressCostFor(s.id)) }));
  const total = rows.reduce((n, r) => n + r.spent, 0);
  return (
    <section
      className="mt-6 rounded-2xl border border-border/70 bg-card p-5"
      aria-label="Credit dashboard"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        Credits per scene / Krediter per scen
      </p>
      <p className="mt-2 text-sm text-foreground">
        {`Spent across all scenes: ${total} credits / Använt i alla scener: ${total} krediter`}
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => {
          const pct = r.budget > 0 ? Math.min(100, (r.spent / r.budget) * 100) : 0;
          return (
            <li key={r.scene_id} className="text-xs">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-foreground">
                  {String(r.scene.scene_number).padStart(2, "0")} · {r.scene.title}
                </span>
                <span className="text-muted-foreground">
                  {`${r.spent} / ${r.budget} · ${r.remaining} left / kvar`}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted">
                <div
                  className={r.approaching ? "h-full bg-primary" : "h-full bg-muted-foreground"}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {r.approaching && (
                <p className="mt-1 text-primary">
                  Near its cap — one more Ezy render would pass it. You can still render. / Nära
                  taket — en Ezy-rendering till går över. Du kan fortfarande rendera.
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Renders on the model's own platform (fal.ai) spend no app credits; their dollar estimate
        lives in each scene's engine panel. / Körningar hos fal.ai kostar inga appkrediter.
      </p>
    </section>
  );
}
