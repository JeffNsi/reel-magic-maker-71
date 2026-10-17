import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";
import { useFilmAccount } from "@/hooks/use-film-account";
import { startFilmRender } from "@/lib/film-render.functions";
import { getProfile } from "@/lib/vibe.functions";
import { sceneCostFor } from "@/lib/pricing";
import { FAL_USD_PER_SECOND } from "@/lib/fal-prices";
import type { FilmView } from "@/lib/film.functions";

export function FullFilmRender({ film, sessionId, onStarted }: { film: FilmView; sessionId: string; onStarted: () => void }) {
  const { t } = useLocale();
  const { userId } = useFilmAccount();
  const run = useServerFn(startFilmRender), profileFn = useServerFn(getProfile);
  const profile = useQuery({ queryKey: ["film-render-profile", userId], enabled: !!userId, queryFn: () => profileFn(), retry: false });
  const [engine, setEngine] = useState<"lovable" | "fal" | "live">("lovable");
  const [warning, setWarning] = useState<string | null>(null);
  const pending = film.scenes.filter((s) => !s.video_url && s.status !== "queued" && s.status !== "processing").length;
  const cost = pending * sceneCostFor(engine);
  const balance = (profile.data?.bonus_coins ?? 0) + (profile.data?.paid_coins ?? 0);
  const rate = FAL_USD_PER_SECOND["fal-ai/kling-video/v3/standard/text-to-video"];
  const estimatedUsd = rate === undefined ? null : pending * 5 * rate;
  const start = useMutation({ mutationFn: () => run({ data: { film_id: film.id, session_id: sessionId, engine } }), onSuccess: (res) => {
    if (res.status === "needs_credits") setWarning(t("Not enough credits. Top up before rendering.", "Inte tillräckligt med credits. Fyll på före rendering."));
    else if (res.failed.length) setWarning(t("Some scenes could not start. Check their status below.", "Vissa scener kunde inte starta. Kontrollera status nedan."));
    onStarted(); void profile.refetch();
  }, onError: (e: Error) => setWarning(e.message) });
  return <section className="mt-8 border-y border-border py-6">
    <h2 className="font-display text-2xl italic">{t("Render the whole film", "Rendera hela filmen")}</h2>
    <div className="flex flex-wrap gap-2 mt-4">{(["lovable", "fal", "live"] as const).map((id) => <Button key={id} variant={id === engine ? "default" : "outline"} aria-pressed={id === engine} disabled={start.isPending} onClick={() => setEngine(id)}>{id === "lovable" ? "EZY" : id === "fal" ? "STRONG" : "LIVE"}</Button>)}</div>
    <p className="mt-4 font-medium">{pending} {t("remaining scenes", "återstående scener")} × {sceneCostFor(engine)} = {cost} credits</p>
    {engine === "lovable" ? <p className="text-sm text-muted-foreground mt-2">{t("App balance", "Appsaldo")}: {userId ? balance : "—"} credits · {t("No fal.ai charge.", "Ingen debitering hos fal.ai.")}</p> : <p className="text-sm text-muted-foreground mt-2">{engine === "fal" && estimatedUsd !== null ? `${t("Advisory fal.ai estimate", "Ungefärlig fal.ai-kostnad")}: $${estimatedUsd.toFixed(2)} (${pending} × 5 s)` : t("fal.ai price not available for LIVE.", "fal.ai-pris saknas för LIVE.")} · {t("Actual charges and retry charges are set by fal.ai; this is not a spending cap. Text-only models do not use your portrait image.", "Faktiska kostnader och nya försök prissätts av fal.ai; detta är inget kostnadstak. Textmodeller använder inte porträttbilden.")}</p>}
    {warning && <div role="alert" className="mt-4 border border-primary rounded-md p-3 flex gap-2"><span className="flex-1">{warning}</span><Button variant="ghost" size="icon" aria-label={t("Dismiss", "Stäng")} onClick={() => setWarning(null)}><X /></Button></div>}
    <div className="mt-5 flex flex-wrap gap-3">{!userId ? <Button asChild><Link to="/auth">{t("Sign in to render", "Logga in för att rendera")}</Link></Button> : engine === "lovable" && balance < cost ? <Button asChild><Link to="/vibe/rewards">{t("Get credits before rendering", "Skaffa credits före rendering")}</Link></Button> : <Button disabled={start.isPending || pending === 0 || engine === "lovable" && (!profile.data || profile.isLoading)} onClick={() => start.mutate()}><Play />{start.isPending ? t("Starting…", "Startar…") : `${t("Render", "Rendera")} ${pending} ${t("scenes", "scener")} · ${cost} credits`}</Button>}</div>
    <p className="mt-3 text-xs text-muted-foreground">{t("Completed and running scenes are skipped. Completed clips are collected into this film, not automatically published.", "Klara och pågående scener hoppas över. Färdiga klipp sparas i filmen, inte publiceras automatiskt.")}</p>
  </section>;
}