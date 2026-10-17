import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Check, Copy, Download, UserRound, X } from "lucide-react";
import { ToolShell } from "@/components/film/tool-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/hooks/use-locale";
import { useFilmAccount } from "@/hooks/use-film-account";
import { listCharacters } from "@/lib/character.functions";
import { saveApprovedFilm } from "@/lib/film-start.functions";
import { FILM_LENGTHS, filmEstimate, templateScenes, startScenePrompt, type StartScene } from "@/lib/film-start";
import { getSessionId } from "@/lib/session";
import cinematic from "@/assets/styles/cinematic.jpg";
import anime from "@/assets/styles/anime.jpg";
import realistic from "@/assets/styles/realistic.jpg";
import claymation from "@/assets/styles/claymation.jpg";

export const Route = createFileRoute("/create")({
  validateSearch: (search: Record<string, unknown>) => ({ character: typeof search.character === "string" ? search.character : undefined }),
  head: () => ({ meta: [
    { title: "Create a film with your characters | Shortizereel" }, { name: "description", content: "Choose your cast, approve your character, review your scenes and see the full film cost before rendering." },
    { property: "og:title", content: "Create your next film | Shortizereel" }, { property: "og:description", content: "Your cast, your story, a clear budget before rendering." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: CreateFilmPage,
});
const styles = [{ id: "cinematic", image: cinematic }, { id: "anime", image: anime }, { id: "realistic", image: realistic }, { id: "claymation", image: claymation }] as const;
type Style = typeof styles[number]["id"];

function CreateFilmPage() {
  const { t } = useLocale();
  const { character: initialCharacter } = Route.useSearch();
  const { userId, checked } = useFilmAccount();
  const navigate = useNavigate();
  const read = useServerFn(listCharacters), save = useServerFn(saveApprovedFilm);
  const chars = useQuery({ queryKey: ["characters", userId], enabled: !!userId, retry: false, queryFn: () => read() });
  const [characterId, setCharacterId] = useState(initialCharacter ?? "");
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [setting, setSetting] = useState("");
  const [genre, setGenre] = useState("Drama");
  const [style, setStyle] = useState<Style>("cinematic");
  const [audience, setAudience] = useState<"general" | "adult">("general");
  const [length, setLength] = useState<1 | 3 | 5 | 10>(1);
  const [phase, setPhase] = useState<"setup" | "approve" | "scenes">("setup");
  const [scenes, setScenes] = useState<StartScene[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const character = chars.data?.find((c) => c.id === characterId);
  const estimate = filmEstimate(length, "lovable");
  const persist = useMutation({ mutationFn: () => {
    if (!character) throw new Error(t("Choose your character.", "Välj din karaktär."));
    return save({ data: { session_id: getSessionId(), key, character_id: character.id, title, idea, setting, genre, style, audience, length, approved: true, scenes } });
  }, onSuccess: (result) => { void navigate({ to: "/film/$filmId", params: { filmId: result.film_id } }); }, onError: (e: Error) => setWarning(e.message) });
  const input = { idea, setting, style };
  const exportAll = () => character ? scenes.map((scene, i) => startScenePrompt(scene, i + 1, input, character)).join("\n\n") : "";
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); } catch { setWarning(t("Copy was unavailable; download the text instead.", "Kopiering gick inte; ladda ner texten istället.")); } }
  function download() { const url = URL.createObjectURL(new Blob([exportAll()], { type: "text/plain;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = "shortizereel-scenes.txt"; a.click(); URL.revokeObjectURL(url); }
  return <ToolShell title={t("Create your film", "Skapa din film")}>
    <div className="flex flex-wrap gap-4 border-b border-border pb-5 mb-8 text-sm">{[t("1 · Story & cast", "1 · Berättelse & rollista"), t("2 · Approve character", "2 · Godkänn karaktär"), t("3 · Scenes & budget", "3 · Scener & budget")].map((label, i) => <span key={label} className={i === ["setup", "approve", "scenes"].indexOf(phase) ? "text-primary" : "text-muted-foreground"}>{label}</span>)}</div>
    {(warning || chars.error) && <div role="alert" className="flex items-center gap-3 border border-primary rounded-md p-3 mb-6"><span className="flex-1">{warning ?? chars.error?.message}</span><Button size="icon" variant="ghost" aria-label={t("Dismiss", "Stäng")} onClick={() => { setWarning(null); if (chars.error) void chars.refetch(); }}><X /></Button></div>}
    {phase === "setup" && <form onSubmit={(e) => { e.preventDefault(); if (!character) { setWarning(t("Save a character in your library first.", "Spara först en karaktär i ditt bibliotek.")); return; } setPhase("approve"); }}>
      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <label className="block">{t("Film title", "Filmtitel")}<Input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="block">{t("Your story", "Din berättelse")}<Textarea required maxLength={400} className="min-h-28" value={idea} onChange={(e) => setIdea(e.target.value)} /></label>
          <label className="block">{t("Location", "Plats")}<Input required maxLength={300} value={setting} onChange={(e) => setSetting(e.target.value)} /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label>{t("Genre", "Genre")}<select value={genre} onChange={(e) => setGenre(e.target.value)} className="mt-1 w-full border border-input rounded-md bg-background p-2"><option>Drama</option><option>Comedy</option><option>Mystery</option><option>Adventure</option><option>Documentary</option></select></label>
          <label>{t("Audience", "Målgrupp")}<select className="mt-1 w-full border border-input rounded-md bg-background p-2" value={audience} onChange={(e) => setAudience(e.target.value === "adult" ? "adult" : "general")}><option value="general">{t("General", "Allmän")}</option><option value="adult">{t("Adults", "Vuxna")}</option><option disabled>{t("Kids — safety review not available yet", "Barn — säkerhetsgranskning saknas ännu")}</option></select></label></div>
          <fieldset><legend className="mb-3">{t("Visual style", "Visuell stil")}</legend><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{styles.map((s) => <Button key={s.id} type="button" variant="outline" aria-pressed={style === s.id} className={`h-auto p-0 flex-col overflow-hidden ${style === s.id ? "border-primary" : ""}`} onClick={() => setStyle(s.id)}><img src={s.image} alt={s.id} className="w-full aspect-square object-cover" /><span className="py-2 capitalize">{s.id}</span></Button>)}</div></fieldset>
          <fieldset><legend className="mb-3">{t("Planning length", "Planeringslängd")}</legend><div className="flex flex-wrap gap-2">{FILM_LENGTHS.map((n) => <Button type="button" key={n} variant={length === n ? "default" : "outline"} aria-pressed={length === n} onClick={() => setLength(n)}>{n} min</Button>)}</div><p className="text-xs text-muted-foreground mt-3">{estimate.scenes} {t("scenes × 5 seconds =", "scener × 5 sekunder =")} {estimate.seconds} s {t("of generated footage; not the planning length.", "genererad film; inte planeringslängden.")}</p></fieldset>
        </div>
        <aside className="border-l border-border lg:pl-6 max-lg:border-l-0 space-y-5">
          <h2 className="font-display text-2xl italic">{t("Lead character", "Huvudkaraktär")}</h2>
          {checked && !userId ? <Button asChild variant="outline"><Link to="/auth">{t("Sign in to choose your cast", "Logga in för att välja rollista")}</Link></Button> : <select aria-label={t("Lead character", "Huvudkaraktär")} className="w-full bg-background border border-input rounded-md p-2" value={characterId} onChange={(e) => setCharacterId(e.target.value)}><option value="">{t("Choose character", "Välj karaktär")}</option>{chars.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          {character?.reference_url ? <img src={character.reference_url} alt={character.name} className="aspect-[3/4] w-full object-cover rounded-md" /> : <div className="aspect-[3/4] flex items-center justify-center bg-muted rounded-md"><UserRound className="size-12 text-muted-foreground" /></div>}
          <Button asChild variant="outline" className="w-full"><Link to="/characters">{t("Open character library", "Öppna karaktärsbibliotek")}</Link></Button>
          <div className="border-t border-border pt-5"><p className="text-sm text-muted-foreground">EZY</p><p className="font-display text-3xl">{estimate.total} credits</p><p className="text-sm text-muted-foreground mt-2">{estimate.scenes} × {estimate.perScene} credits</p><p className="text-xs text-muted-foreground mt-2">{t("Draft and uploads: 0 credits. Rendering is separate.", "Utkast och uppladdningar: 0 credits. Rendering är separat.")}</p></div>
        </aside>
      </div>
      <Button type="submit" className="mt-8" disabled={!character || !title.trim() || !idea.trim() || !setting.trim()}>{t("Review character", "Granska karaktär")}<ArrowRight /></Button>
    </form>}
    {phase === "approve" && character && <div className="grid gap-8 sm:grid-cols-[240px_1fr]">
      {character.reference_url ? <img src={character.reference_url} alt={character.name} className="w-full aspect-[3/4] object-cover rounded-md" /> : <div className="aspect-[3/4] bg-muted flex items-center justify-center"><UserRound className="size-12 text-muted-foreground" /></div>}
      <div><h2 className="font-display text-3xl italic">{character.name}</h2><p className="mt-3 text-muted-foreground">{character.description}</p><dl className="mt-5 grid gap-3 sm:grid-cols-2">{Object.entries(character.traits).map(([trait, value]) => <div key={trait}><dt className="text-xs uppercase text-muted-foreground">{trait}</dt><dd className="text-sm mt-1">{value || t("Not specified", "Inte angivet")}</dd></div>)}</dl>
      {!character.reference_url && <p className="mt-5 text-primary">{t("Reference pack missing — no portrait uploaded.", "Referenspaket saknas — inget porträtt uppladdat.")}</p>}
      <div className="mt-6 flex flex-wrap gap-3"><Button onClick={() => { setScenes(templateScenes(length, idea, character.name)); setKey(crypto.randomUUID()); setPhase("scenes"); }}><Check />{t("Approve character", "Godkänn karaktär")}</Button><Button variant="outline" onClick={() => setPhase("setup")}>{t("Back", "Tillbaka")}</Button></div></div>
    </div>}
    {phase === "scenes" && character && <>
      <div className="flex flex-wrap justify-between gap-5 border-y border-border py-6"><div><h2 className="font-display text-3xl italic">{title}</h2><p className="mt-2 text-muted-foreground">{character.name} · {estimate.scenes} {t("scenes", "scener")} · {estimate.total} credits (EZY)</p><p className="mt-2 text-primary text-sm">{t("Template mode — review and edit every scene before saving. No AI or video has been generated.", "Malläge — granska och redigera varje scen före sparande. Ingen AI eller video har genererats.")}</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => void copy(exportAll())}><Copy />{t("Copy all", "Kopiera alla")}</Button><Button variant="outline" onClick={download}><Download />.txt</Button></div></div>
      <ol className="mt-6 space-y-6">{scenes.map((scene, i) => <li key={i} className="border-b border-border pb-6"><div className="flex items-center justify-between gap-3"><h3 className="text-primary text-sm">{t("Scene", "Scen")} {i + 1} / {scenes.length} · {estimate.perScene} credits</h3><Button variant="ghost" size="icon" aria-label={`${t("Copy scene", "Kopiera scen")} ${i + 1}`} onClick={() => void copy(startScenePrompt(scene, i + 1, input, character))}><Copy /></Button></div>
        <label className="block mt-3 text-sm">{t("Title", "Titel")}<Input maxLength={120} value={scene.title} onChange={(e) => setScenes(scenes.map((s, n) => n === i ? { ...s, title: e.target.value } : s))} /></label>
        <label className="block mt-3 text-sm">{t("Opening action / scene", "Öppningshandling / scen")}<Textarea maxLength={400} value={scene.idea} onChange={(e) => setScenes(scenes.map((s, n) => n === i ? { ...s, idea: e.target.value } : s))} /></label>
        <label className="block mt-3 text-sm">{t("Narration text (no voice generated)", "Berättartext (ingen röst genererad)")}<Input maxLength={300} value={scene.narration} onChange={(e) => setScenes(scenes.map((s, n) => n === i ? { ...s, narration: e.target.value } : s))} /></label>
      </li>)}</ol>
      <div className="mt-8 flex flex-wrap gap-3"><Button disabled={persist.isPending || scenes.some((s) => !s.title.trim() || !s.idea.trim())} onClick={() => persist.mutate()}>{persist.isPending ? t("Saving…", "Sparar…") : t("Save film & open budget", "Spara film & öppna budget")}<ArrowRight /></Button><Button variant="outline" onClick={() => setPhase("setup")}>{t("Back to story", "Tillbaka till berättelsen")}</Button></div>
      {!userId && <p className="mt-4"><Button asChild variant="outline"><Link to="/auth">{t("Sign in to save; text exports stay free", "Logga in för att spara; textexport är gratis")}</Link></Button></p>}
    </>}
  </ToolShell>;
}