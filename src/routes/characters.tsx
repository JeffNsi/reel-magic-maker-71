import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Save, Trash2, UserRound, X } from "lucide-react";
import { ToolShell } from "@/components/film/tool-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/hooks/use-locale";
import { useFilmAccount } from "@/hooks/use-film-account";
import { deleteCharacter, listCharacters, saveCharacter } from "@/lib/character.functions";
import { characterTraits, MAX_CHARACTER_IMAGE_BYTES, type CharacterInput, type LibraryCharacter } from "@/lib/character-library";

export const Route = createFileRoute("/characters")({
  head: () => ({ meta: [
    { title: "Your character library | Shortizereel" }, { name: "description", content: "Save your own characters and portraits, then reuse their approved identities in Shortizereel films." },
    { property: "og:title", content: "Your character library | Shortizereel" }, { property: "og:description", content: "Your characters, ready for the next film." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: CharactersPage,
});
function blank(): CharacterInput { return { id: crypto.randomUUID(), name: "", description: "", traits: { face: "", hair: "", skin: "", body: "", height: "", build: "" } }; }

function CharactersPage() {
  const { t } = useLocale();
  const { userId, checked } = useFilmAccount();
  const read = useServerFn(listCharacters), save = useServerFn(saveCharacter), remove = useServerFn(deleteCharacter);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["characters", userId], enabled: !!userId, queryFn: () => read(), retry: false });
  const [draft, setDraft] = useState<CharacterInput | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<LibraryCharacter | null>(null);
  const persist = useMutation({ mutationFn: async () => {
    if (!draft) throw new Error(t("Choose a character.", "Välj en karaktär."));
    let image: { type: "image/png" | "image/jpeg" | "image/webp"; base64: string } | undefined;
    if (file) {
      if (file.size > MAX_CHARACTER_IMAGE_BYTES) throw new Error(t("Image must be under 6 MB.", "Bilden måste vara under 6 MB."));
      if (file.type !== "image/png" && file.type !== "image/jpeg" && file.type !== "image/webp") throw new Error(t("Choose PNG, JPEG or WebP.", "Välj PNG, JPEG eller WebP."));
      const type = file.type;
      const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = () => reject(new Error(t("Image could not be read.", "Bilden kunde inte läsas."))); reader.readAsDataURL(file); });
      image = { type, base64 };
    }
    return save({ data: { ...draft, image } });
  }, onSuccess: () => { setDraft(null); setFile(null); setWarning(null); void qc.invalidateQueries({ queryKey: ["characters"] }); }, onError: (e: Error) => setWarning(e.message) });
  const deletion = useMutation({ mutationFn: (id: string) => remove({ data: { id } }), onSuccess: () => { setDeleting(null); void qc.invalidateQueries({ queryKey: ["characters"] }); }, onError: (e: Error) => setWarning(e.message) });
  const labels: Record<string, string> = { face: t("Face", "Ansikte"), hair: t("Hair", "Hår"), skin: t("Skin", "Hud"), body: t("Body", "Kropp"), height: t("Height", "Längd"), build: t("Build", "Kroppsbyggnad") };
  return <ToolShell title={t("Your characters", "Dina karaktärer")}>
    {checked && !userId ? <Button asChild><Link to="/auth">{t("Sign in to save characters", "Logga in för att spara karaktärer")}</Link></Button> : <>
      <div className="flex flex-wrap items-center gap-3 mb-6"><span className="text-muted-foreground">{query.data?.length ?? 0} {t("characters", "karaktärer")}</span><Button className="ml-auto" onClick={() => { setDraft(blank()); setFile(null); }}><Plus />{t("New character", "Ny karaktär")}</Button></div>
      {(warning || query.error) && <div role="alert" className="mb-5 flex gap-3 border border-primary rounded-md p-3"><span className="flex-1">{warning ?? query.error?.message}</span><Button variant="ghost" size="icon" aria-label={t("Dismiss", "Stäng")} onClick={() => { setWarning(null); if (query.error) void query.refetch(); }}><X /></Button></div>}
      {draft && <form className="border-y border-border py-6 mb-8" onSubmit={(e) => { e.preventDefault(); persist.mutate(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>{t("Name", "Namn")}<Input required maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label>{t("Portrait — free upload", "Porträtt — gratis uppladdning")}<Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
          <label className="sm:col-span-2">{t("Description", "Beskrivning")}<Textarea maxLength={1000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
          {characterTraits.map((field) => <label key={field}>{labels[field]}<Input maxLength={field === "height" ? 100 : 200} value={draft.traits[field]} onChange={(e) => setDraft({ ...draft, traits: { ...draft.traits, [field]: e.target.value } })} /></label>)}
        </div>
        <div className="flex gap-2 mt-5"><Button type="submit" disabled={persist.isPending || !draft.name.trim()}><Save />{t("Save character", "Spara karaktär")}</Button><Button type="button" variant="outline" onClick={() => setDraft(null)}>{t("Cancel", "Avbryt")}</Button></div>
      </form>}
      {query.isLoading && <p className="text-muted-foreground">{t("Loading…", "Läser…")}</p>}
      {!query.isLoading && !query.data?.length && <div className="py-12 text-center border-y border-border"><UserRound className="mx-auto mb-4 size-10 text-muted-foreground" /><h2 className="font-display text-2xl italic">{t("The cast starts here", "Här börjar rollistan")}</h2></div>}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{query.data?.map((c) => <article key={c.id} className="rounded-md border border-border bg-card overflow-hidden">
        {c.reference_url ? <img src={c.reference_url} alt={c.name} className="w-full aspect-[4/3] object-cover" /> : <div className="aspect-[4/3] flex items-center justify-center bg-muted"><UserRound className="size-12 text-muted-foreground" /></div>}
        <div className="p-4"><h2 className="font-display text-2xl italic break-words">{c.name}</h2><p className="text-sm text-muted-foreground mt-2 break-words">{c.description}</p><div className="flex flex-wrap gap-2 mt-4">
          <Button asChild size="sm"><Link to="/create" search={{ character: c.id }}>{t("Use in film", "Använd i film")}</Link></Button>
          <Button variant="ghost" size="icon" aria-label={`${t("Edit", "Redigera")} ${c.name}`} onClick={() => { setDraft(c); setFile(null); }}><Pencil /></Button>
          <Button variant="ghost" size="icon" aria-label={`${t("Remove", "Ta bort")} ${c.name}`} onClick={() => setDeleting(c)}><Trash2 /></Button>
        </div></div>
      </article>)}</div>
      {deleting && <div role="dialog" aria-modal="true" aria-label={t("Remove character", "Ta bort karaktär")} className="fixed inset-0 z-50 bg-background/90 flex items-center justify-center p-4"><div className="max-w-md rounded-md border border-border bg-card p-6"><h2 className="font-display text-2xl">{t("Remove", "Ta bort")} {deleting.name}?</h2><p className="mt-3 text-muted-foreground">{t("Existing films keep their approved character and portrait.", "Befintliga filmer behåller sin godkända karaktär och sitt porträtt.")}</p><div className="mt-5 flex gap-2"><Button disabled={deletion.isPending} onClick={() => deletion.mutate(deleting.id)}><Trash2 />{t("Remove", "Ta bort")}</Button><Button variant="outline" onClick={() => setDeleting(null)}>{t("Cancel", "Avbryt")}</Button></div></div></div>}
    </>}
  </ToolShell>;
}