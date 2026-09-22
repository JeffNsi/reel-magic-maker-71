import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Clapperboard, Loader2, SlidersHorizontal } from "lucide-react";

import { RunGrid } from "@/components/engine/run-grid";
import { SettingsRail } from "@/components/engine/settings-rail";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MODELS, getModel, platformOf } from "@/generation/catalog";
import { formatNotesFor } from "@/lib/director-plane";
import { platformKeyStatus } from "@/lib/generation-key.functions";
import { listRuns, pollRuns, setRunFavourite } from "@/lib/generation-run.functions";
import { renderScenePlane, type ScenePlaneView } from "@/lib/scene-plane.functions";

/**
 * The Director's engine, on the scene itself: which model it picked and why,
 * which canonical references travel with the prompt, what did not fit, and the
 * advanced rail for overriding any of it. An override changes this press only —
 * canonical truth is never edited from here, and a finished clip is recorded as
 * history, never promoted to canon.
 */
export function SceneEngine({
  plan,
  filmId,
  sessionId,
  ezyBusy,
  onEzy,
}: {
  plan: ScenePlaneView | undefined;
  filmId: string;
  sessionId: string;
  ezyBusy: boolean;
  onEzy: () => void;
}) {
  const queryClient = useQueryClient();
  const submit = useServerFn(renderScenePlane);
  const list = useServerFn(listRuns);
  const poll = useServerFn(pollRuns);
  const favourite = useServerFn(setRunFavourite);
  const keyStatus = useServerFn(platformKeyStatus);

  /* Which generation accounts are reachable: the creator's own pasted key, and
   * the house fal.ai account. Models on neither are listed but not pressable. */
  const availability = useQuery({
    queryKey: ["platform-key"],
    retry: false,
    queryFn: () => keyStatus({}),
  });
  const platforms = availability.data?.platforms ?? [];

  const [open, setOpen] = useState(false);
  const [modelId, setModelId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, unknown> | null>(null);

  const chosenId = modelId ?? plan?.model.id ?? "";
  const entry = getModel(chosenId);
  const settings = overrides ?? plan?.settings ?? {};

  const runs = useQuery({
    queryKey: ["scene-runs", plan?.scene_id],
    enabled: !!plan?.scene_id,
    /* Signed out there is no run history to show: one honest miss, no retry storm. */
    retry: false,
    queryFn: () => list({ data: { limit: 12, scene_id: plan?.scene_id ?? "" } }),
  });

  const openRuns = (runs.data?.runs ?? []).filter(
    (run) => run.status === "queued" || run.status === "processing",
  );

  useQuery({
    queryKey: ["scene-runs-poll", plan?.scene_id],
    enabled: openRuns.length > 0,
    refetchInterval: 4000,
    queryFn: async () => {
      await poll({});
      await queryClient.invalidateQueries({ queryKey: ["scene-runs", plan?.scene_id] });
      return Date.now();
    },
  });

  const generate = useMutation({
    mutationFn: () =>
      submit({
        data: {
          film_id: filmId,
          session_id: sessionId,
          scene_id: plan?.scene_id ?? "",
          model_id: chosenId,
          ...(overrides ? { settings: overrides } : {}),
          count: 1,
        },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["scene-runs", plan?.scene_id] });
      for (const run of result.runs.filter((r) => r.status === "failed")) {
        toast.error(run.error_message ?? "The platform refused this run.");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const star = useMutation({
    mutationFn: (run_id: string) => favourite({ data: { run_id, favourite: true } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scene-runs", plan?.scene_id] }),
    onError: (error: Error) => toast.error(error.message),
  });

  if (!plan) return null;

  const notes = entry ? formatNotesFor(entry) : plan.format.notes;
  const blocked = !plan.gate.allowed;

  return (
    <div className="mt-4 rounded-xl border border-border/60 bg-background/60 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        The Director's engine
      </p>

      <p className="mt-2 text-xs font-semibold text-foreground">
        {plan.model.label} · {plan.model.platform === "fal" ? "fal.ai" : "queue platform"}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{plan.model.reason}</p>

      {plan.references.length > 0 && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Travelling with the prompt:{" "}
          {plan.references
            .map((r) => `${r.label} ${r.kind}${r.role === "start" ? " (opening frame)" : ""}`)
            .join(", ")}
          .
        </p>
      )}

      {plan.omitted.length > 0 && (
        <ul className="mt-2 space-y-1">
          {plan.omitted.map((item) => (
            <li key={`${item.label}-${item.kind}`} className="text-xs text-muted-foreground">
              Left out — {item.label} {item.kind}: {item.reason}
            </li>
          ))}
        </ul>
      )}

      {notes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {notes.map((note) => (
            <li key={note.wanted} className="text-xs text-amber-400">
              {note.message}
            </li>
          ))}
        </ul>
      )}

      {blocked && (
        <p className="mt-3 rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs leading-relaxed text-foreground">
          {plan.gate.reason} Missing: {plan.gate.missing.join(", ")}.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={ezyBusy} onClick={onEzy}>
          {ezyBusy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Clapperboard className="mr-2 h-4 w-4" />
          )}
          Render with Ezy — {plan.ezy_credits} credits
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={blocked || generate.isPending || !entry}
          onClick={() => generate.mutate()}
        >
          {generate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Render on the model's own platform — no credits
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen((prev) => !prev)}>
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          {open ? "Hide advanced" : "Advanced"}
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-4 rounded-lg border border-border/60 p-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Pre-filled from the Director's choice. Changing anything here changes this press only —
            it never edits canonical truth.
          </p>
          <Select
            value={chosenId}
            onValueChange={(next) => {
              setModelId(next);
              setOverrides(null);
            }}
          >
            <SelectTrigger aria-label="Model for this scene">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {MODELS.filter((model) => model.surface === "video").map((model) => {
                const modelNotes = formatNotesFor(model);
                const reachable = platforms.length === 0 || platforms.includes(platformOf(model));
                return (
                  <SelectItem key={model.id} value={model.id} disabled={!reachable}>
                    {model.label}
                    {reachable ? "" : " — needs your own key"}
                    {modelNotes.length
                      ? ` — ${modelNotes.map((n) => `no ${n.wanted}, offers ${n.offered}`).join("; ")}`
                      : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {entry && (
            <SettingsRail
              entry={entry}
              settings={settings}
              disabled={generate.isPending}
              onChange={(key, value) =>
                setOverrides((prev) => ({ ...(prev ?? plan.settings), [key]: value }))
              }
            />
          )}
        </div>
      )}

      {(runs.data?.runs ?? []).length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            This scene's runs — history, never canon
          </p>
          <div className="mt-2">
            <RunGrid
              runs={runs.data?.runs ?? []}
              onRetry={() => generate.mutate()}
              onFavourite={(run) => star.mutate(run.id)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
