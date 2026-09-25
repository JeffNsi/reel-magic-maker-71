import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  CHARACTER_PACK_KINDS,
  ENVIRONMENT_PACK_KINDS,
  STYLE_PACK_KINDS,
  getReferenceUsage,
  uploadCanonReference,
  type CanonView,
} from "@/lib/canon.functions";

/**
 * REFERENCE PANEL — every reference image of the film, your own uploads
 * included, and the scenes each one is sent with. Uploading costs nothing and
 * lands as a NEW version of that angle; older versions stay as history.
 */

const MAX_BYTES = 6 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
type ImageType = (typeof TYPES)[number];

type Subject = { type: "character" | "environment" | "style"; id: string; label: string };

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("The file could not be read. / Filen kunde inte läsas."));
    reader.readAsDataURL(file);
  });
}

export function ReferenceLibrary({
  filmId,
  sessionId,
  canon,
  onChanged,
}: {
  filmId: string;
  sessionId: string;
  canon: CanonView;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const readUsage = useServerFn(getReferenceUsage);
  const upload = useServerFn(uploadCanonReference);

  const subjects: Subject[] = [
    ...canon.characters.map((c) => ({
      type: "character" as const,
      id: c.canonical_id,
      label: `${c.canonical_id} — ${c.name}`,
    })),
    ...canon.environments.map((e) => ({
      type: "environment" as const,
      id: e.canonical_id,
      label: `${e.canonical_id} — ${e.name}`,
    })),
    { type: "style", id: "STYLE_01", label: "STYLE_01 — film look" },
  ];

  const [subjectKey, setSubjectKey] = useState(`${subjects[0]?.type}|${subjects[0]?.id}`);
  const subject = subjects.find((s) => `${s.type}|${s.id}` === subjectKey) ?? subjects[0];
  const kinds: readonly string[] =
    subject?.type === "character"
      ? CHARACTER_PACK_KINDS
      : subject?.type === "environment"
        ? ENVIRONMENT_PACK_KINDS
        : STYLE_PACK_KINDS;
  const [kind, setKind] = useState<string>(kinds[0] ?? "front");
  const activeKind = kinds.includes(kind) ? kind : (kinds[0] ?? "front");
  const [file, setFile] = useState<File | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const usage = useQuery({
    queryKey: ["reference-usage", filmId, sessionId],
    enabled: !!sessionId,
    retry: false,
    queryFn: () => readUsage({ data: { film_id: filmId, session_id: sessionId } }),
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!subject || !file) throw new Error("Pick an image first. / Välj en bild först.");
      if (!TYPES.includes(file.type as ImageType))
        throw new Error("Only PNG, JPEG or WebP. / Bara PNG, JPEG eller WebP.");
      if (file.size > MAX_BYTES) throw new Error("The image is over 6 MB. / Bilden är över 6 MB.");
      return upload({
        data: {
          film_id: filmId,
          session_id: sessionId,
          subject_type: subject.type,
          subject_canonical_id: subject.id,
          kind: activeKind,
          content_type: file.type as ImageType,
          data_base64: await toBase64(file),
        },
      });
    },
    onSuccess: (res) => {
      setWarning(null);
      setFile(null);
      toast.success(`Saved as ${res.kind} v${res.version}. / Sparad som ${res.kind} v${res.version}.`);
      queryClient.invalidateQueries({ queryKey: ["reference-usage", filmId] });
      onChanged();
    },
    onError: (err) => setWarning((err as Error).message),
  });

  const items = usage.data ?? [];

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-serif text-xl italic">Reference panel / Referenspanel</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload your own image for any angle. It costs nothing, becomes a new version, and the
        newest version of each angle is what scenes use. / Ladda upp en egen bild för valfri vinkel.
        Det kostar inget, blir en ny version, och den senaste versionen av varje vinkel är den
        scenerna använder.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr]">
        <label className="text-xs uppercase tracking-widest text-muted-foreground">
          Subject / Motiv
          <select
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm normal-case tracking-normal text-foreground"
            value={subjectKey}
            onChange={(e) => setSubjectKey(e.target.value)}
          >
            {subjects.map((s) => (
              <option key={`${s.type}|${s.id}`} value={`${s.type}|${s.id}`}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs uppercase tracking-widest text-muted-foreground">
          Angle / Vinkel
          <select
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm normal-case tracking-normal text-foreground"
            value={activeKind}
            onChange={(e) => setKind(e.target.value)}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Choose image"
          className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-foreground"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button size="sm" disabled={!file || send.isPending} onClick={() => send.mutate()}>
          {send.isPending ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="mr-2 h-3.5 w-3.5" />
          )}
          Upload — free / Ladda upp — gratis
        </Button>
      </div>

      {warning && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary/40 p-3 text-sm text-primary">
          <span className="flex-1">{warning}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setWarning(null)}>
            ×
          </button>
        </div>
      )}

      <div className="mt-6 border-t border-border pt-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          All references and where they are used / Alla referenser och var de används
        </p>
        {usage.isLoading && (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading… / Läser…
          </p>
        )}
        {usage.error && (
          <p className="mt-3 text-sm text-primary">{(usage.error as Error).message}</p>
        )}
        {!usage.isLoading && items.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Reference pack missing — no images yet. / Referenspaket saknas — inga bilder ännu.
          </p>
        )}
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li
              key={`${item.subject_type}|${item.subject_canonical_id}|${item.kind}|${item.version}`}
              className={`flex gap-3 rounded-xl border border-border p-2 ${item.current ? "" : "opacity-60"}`}
            >
              {item.url ? (
                <img
                  src={item.url}
                  alt={`${item.subject_canonical_id} ${item.kind}`}
                  className="h-16 w-16 rounded-lg object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="h-16 w-16 rounded-lg border border-border" />
              )}
              <div className="min-w-0 text-xs">
                <p className="truncate font-medium text-foreground">{item.subject_canonical_id}</p>
                <p className="text-muted-foreground">
                  {item.kind} · v{item.version} ·{" "}
                  {item.source === "uploaded" ? "uploaded / uppladdad" : "generated / genererad"}
                </p>
                <p className="mt-1 text-foreground">
                  {item.used_in.length
                    ? `Scenes / Scener: ${item.used_in.join(", ")}`
                    : item.current
                      ? "Not used by any scene / Används inte i någon scen"
                      : "History — replaced / Historik — ersatt"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
