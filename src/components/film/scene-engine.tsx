import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Clapperboard, Loader2, SlidersHorizontal } from "lucide-react";

import { FalBalanceCard } from "@/components/engine/fal-balance";
import { RunGrid } from "@/components/engine/run-grid";
import { SettingsRail } from "@/components/engine/settings-rail";
import { getFalBalance } from "@/lib/fal-balance.functions";
import { budgetView, readBudget, readRate, writeBudget, writeRate } from "@/lib/fal-prices";
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
import {
  listRuns,
  pollRuns,
  setRunBorrowed,
  setRunFavourite,
} from "@/lib/generation-run.functions";
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
  const readBalance = useServerFn(getFalBalance);

  /* Which generation accounts are reachable: the creator's own pasted key, and
   * the house fal.ai account. Models on neither are listed but not pressable. */
  const availability = useQuery({
    queryKey: ["platform-key"],
    retry: false,
    queryFn: () => keyStatus({}),
  });
  const platforms = availability.data?.platforms ?? [];
  const keySource = availability.data?.source ?? null;

  /* Shares its cache with FalBalanceCard. A confirmed empty house account locks
   * the press — the card already says "generation is locked", so the button
   * must agree instead of letting fal.ai refuse after the fact. */
  const balance = useQuery({
    queryKey: ["fal-balance"],
    queryFn: () => readBalance(),
    retry: false,
  });
  const balanceEmpty =
    balance.data?.status === "ok" && balance.data.balance <= 0 && keySource !== "browser";

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

  /* Clips the owner marked as borrowed references on OTHER scenes of this film.
   * They are reused by opening them — nothing is re-run, nothing is charged, and
   * they are never sent to the model as canonical truth. */
  const filmRuns = useQuery({
    queryKey: ["film-clips", filmId],
    enabled: !!plan?.scene_id,
    retry: false,
    queryFn: () => list({ data: { story_id: filmId, limit: 60 } }),
  });
  const borrowed = (filmRuns.data?.runs ?? []).filter(
    (run) =>
      run.borrowed_reference &&
      run.status === "completed" &&
      run.scene_id !== plan?.scene_id &&
      (run.video_url || run.images.length > 0),
  );

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

  const borrow = useServerFn(setRunBorrowed);
  const toggleBorrow = useMutation({
    mutationFn: (run: { id: string; borrowed_reference: boolean }) =>
      borrow({ data: { run_id: run.id, borrowed: !run.borrowed_reference } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["scene-runs", plan?.scene_id] });
      await queryClient.invalidateQueries({ queryKey: ["film-clips", filmId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [rate, setRate] = useState<number | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  useEffect(() => {
    setRate(readRate(chosenId));
  }, [chosenId]);
  useEffect(() => {
    if (plan?.scene_id) setBudget(readBudget(plan.scene_id));
  }, [plan?.scene_id]);

  if (!plan) return null;

  /* Budget in seconds, not money: fal.ai prices are not held in this app, so the
   * panel shows what a press produces and what this scene has already used. */
  const durationSetting = settings["duration"];
  const secondsPerRun =
    typeof durationSetting === "number"
      ? durationSetting
      : typeof durationSetting === "string" && Number.isFinite(Number(durationSetting))
        ? Number(durationSetting)
        : plan.format.duration;
  const sceneRuns = runs.data?.runs ?? [];
  const completedRuns = sceneRuns.filter((run) => run.status === "completed").length;
  const finishedClips = sceneRuns.filter(
    (run) => run.status === "completed" && (run.video_url || run.images.length > 0),
  );

  const notes = entry ? formatNotesFor(entry) : plan.format.notes;
  const blocked = !plan.gate.allowed;
  /* History is priced with the Director's own choice, not the Advanced rail's
   * current selection — otherwise switching model or duration would rewrite
   * what this scene has already used and flicker the budget warning. */
  const history = budgetView(
    readRate(plan.model.id),
    plan.format.duration || null,
    completedRuns * (plan.format.duration || 0),
    budget,
  );
  const money = {
    ...history,
    perRun: rate !== null && secondsPerRun ? rate * secondsPerRun : null,
  };

  return (
    <div className="mt-4 rounded-xl border border-border/60 bg-background/60 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        The Director's engine
      </p>

      <p className="mt-2 text-xs font-semibold text-foreground">
        {plan.model.label} · {plan.model.platform === "fal" ? "fal.ai" : "queue platform"}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{plan.model.reason}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {keySource === "project"
          ? "Running on the key configured on this project — no credits."
          : keySource === "browser"
            ? "Running on the key you pasted in this browser — no credits."
            : "No platform key held yet, so only the house account's models can be pressed."}
      </p>

      <div className="mt-3 rounded-lg border border-border/60 p-2 text-xs leading-relaxed text-muted-foreground">
        <p className="font-semibold text-foreground">Budget / Budget</p>
        <p>
          {secondsPerRun
            ? `One press = 1 run × ${secondsPerRun}s of video. / Ett tryck = 1 körning × ${secondsPerRun} s video.`
            : "This model does not declare a length. / Modellen anger ingen längd."}
        </p>
        <p>
          {`This scene so far: ${sceneRuns.length} run(s), ${completedRuns} finished${
            secondsPerRun ? ` ≈ ${completedRuns * secondsPerRun}s` : ""
          }. / Scenen hittills: ${sceneRuns.length} körning(ar), ${completedRuns} klara${
            secondsPerRun ? ` ≈ ${completedRuns * secondsPerRun} s` : ""
          }.`}
        </p>
        <p className="text-foreground">
          {money.perRun !== null
            ? `≈ $${money.perRun.toFixed(2)} per press · ≈ $${(money.spent ?? 0).toFixed(2)} used on this scene / per tryck · använt i scenen`
            : "No price known for this model — enter one below. / Inget pris känt — fyll i nedan."}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">
            USD/s
            <input
              type="number"
              min={0}
              step={0.001}
              aria-label="fal.ai price per second"
              className="w-20 rounded border border-border bg-background px-1 py-0.5 text-foreground"
              value={rate ?? ""}
              onChange={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                setRate(v);
                writeRate(chosenId, v);
              }}
            />
          </label>
          <label className="flex items-center gap-1">
            Scene budget / Scenbudget $
            <input
              type="number"
              min={0}
              step={0.5}
              aria-label="Scene budget in USD"
              className="w-20 rounded border border-border bg-background px-1 py-0.5 text-foreground"
              value={budget ?? ""}
              onChange={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                setBudget(v);
                writeBudget(plan.scene_id, v);
              }}
            />
          </label>
        </div>
        {money.over && (
          <p className="mt-2 rounded border border-amber-400/50 p-2 text-amber-400">
            The next press would pass this scene's budget. You can still press. / Nästa tryck går
            över scenens budget. Du kan fortfarande trycka.
          </p>
        )}
        <p className="mt-1">
          Estimate only — fal.ai charges by its own price list. / Endast uppskattning — fal.ai
          debiterar enligt sin egen prislista.
        </p>
        <div className="mt-3">
          <FalBalanceCard />
        </div>
      </div>

      {borrowed.length > 0 && (
        <div className="mt-3 text-xs leading-relaxed text-muted-foreground">
          <p className="font-semibold text-foreground">
            Borrowed references from other scenes — not canon / Lånade referenser — inte kanon
          </p>
          <ul className="mt-1 space-y-1">
            {borrowed.map((run) => (
              <li key={run.id}>
                {run.model_label} ·{" "}
                <a
                  href={run.video_url ?? run.images[0]}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  open / öppna
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-1">
            Reuse them without re-running. They are not sent to the model, which only takes text and
            canonical packs. / Återanvänd utan ny körning. De skickas inte till modellen.
          </p>
        </div>
      )}

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
          disabled={blocked || generate.isPending || !entry || balanceEmpty}
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
          {finishedClips.length > 0 && (
            <ul className="mt-2 space-y-1">
              {finishedClips.map((run) => (
                <li key={run.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{run.model_label}</span>
                  <Button
                    size="sm"
                    variant={run.borrowed_reference ? "secondary" : "outline"}
                    disabled={toggleBorrow.isPending}
                    onClick={() => toggleBorrow.mutate(run)}
                  >
                    {run.borrowed_reference
                      ? "Borrowed reference — undo / Lånad referens — ångra"
                      : "Use as borrowed reference / Använd som lånad referens"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
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
