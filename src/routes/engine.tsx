import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AssetPicker } from "@/components/engine/asset-picker";
import { KeyLamp } from "@/components/engine/key-lamp";
import { RunGrid } from "@/components/engine/run-grid";
import { SettingsRail } from "@/components/engine/settings-rail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MODELS, defaultSettings, getModel, supportsVertical } from "@/generation/catalog";
import type { MediaItem, MediaRole } from "@/generation/catalog/types";
import {
  listRuns,
  pollRuns,
  retryRun,
  setRunFavourite,
  submitRuns,
  type RunRow,
} from "@/lib/generation-run.functions";

export const Route = createFileRoute("/engine")({
  head: () => ({
    meta: [
      { title: "Engine room — STORYREEL" },
      {
        name: "description",
        content:
          "Run any of 38 image and video models on your own generation account. Four results per press, each on its own clock, with every run kept in your history.",
      },
      { property: "og:title", content: "Engine room — STORYREEL" },
      {
        property: "og:description",
        content:
          "Pick a model, write the shot, press once. STORYREEL runs it on your own generation account and keeps every run.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EnginePage,
});

const ROLE_LABEL: Record<MediaRole, string> = {
  start: "Start frame",
  end: "End frame",
  reference: "Reference",
  video: "Source clip",
  audio: "Audio",
};

function EnginePage() {
  const queryClient = useQueryClient();
  const submit = useServerFn(submitRuns);
  const list = useServerFn(listRuns);
  const poll = useServerFn(pollRuns);
  const retry = useServerFn(retryRun);
  const favourite = useServerFn(setRunFavourite);

  const [modelId, setModelId] = useState(MODELS[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState<Record<string, unknown>>(() => {
    const first = MODELS[0];
    return first ? defaultSettings(first) : {};
  });
  const [media, setMedia] = useState<Partial<Record<MediaRole, MediaItem[]>>>({});
  const [count, setCount] = useState(1);
  const [keyOpen, setKeyOpen] = useState(false);
  const [pickerRole, setPickerRole] = useState<MediaRole | null>(null);

  const entry = useMemo(() => getModel(modelId), [modelId]);

  const runs = useQuery({
    queryKey: ["generation-runs"],
    queryFn: () => list({ data: { limit: 48 } }),
  });

  const open = (runs.data?.runs ?? []).filter(
    (run) => run.status === "queued" || run.status === "processing",
  );

  // Reload-safe: the clock reads persisted rows, not in-memory promises.
  useQuery({
    queryKey: ["generation-runs-poll"],
    queryFn: async () => {
      const result = await poll({});
      if (result.key_missing) setKeyOpen(true);
      await queryClient.invalidateQueries({ queryKey: ["generation-runs"] });
      return result;
    },
    enabled: open.length > 0,
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
  });

  function chooseModel(id: string) {
    const next = getModel(id);
    setModelId(id);
    setSettings(next ? defaultSettings(next) : {});
    setMedia({});
  }

  const generate = useMutation({
    mutationFn: () =>
      submit({
        data: {
          plane: { model: modelId, prompt: { text: prompt }, media, settings },
          count,
        },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["generation-runs"] });
      const failed = result.runs.filter((run) => run.status === "failed");
      for (const run of failed) {
        if (run.error_category === "key") setKeyOpen(true);
        toast.error(run.error_message ?? "The platform refused this run.");
      }
    },
    onError: (error: Error) => {
      if (/api key|platform api key|rejected this api key/i.test(error.message)) setKeyOpen(true);
      toast.error(error.message);
    },
  });

  const restore = useMutation({
    mutationFn: (run: RunRow) => retry({ data: { run_id: run.id } }),
    onSuccess: (result) => {
      chooseModel(result.plane.model);
      setPrompt(result.plane.prompt.text);
      setSettings(result.plane.settings);
      setMedia(result.plane.media);
      toast.success("Prompt, model, media and settings restored — press generate when ready.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const star = useMutation({
    mutationFn: (run: RunRow) =>
      favourite({ data: { run_id: run.id, favourite: !run.favourite } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["generation-runs"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const vertical = entry ? supportsVertical(entry) : true;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl italic tracking-tight">Engine room</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {MODELS.length} models on your own generation account. Every run is kept.
          </p>
        </div>
        <KeyLamp busy={open.length > 0} open={keyOpen} onOpenChange={setKeyOpen} />
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-serif text-2xl italic">The shot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={3}
                placeholder="One sentence: who, where, what happens."
                aria-label="Prompt"
              />

              {entry && Object.keys(entry.roles).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(entry.roles) as MediaRole[]).map((role) => {
                    const items = media[role] ?? [];
                    const cap = entry.roles[role] ?? 0;
                    return (
                      <div key={role} className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={items.length >= cap}
                          onClick={() => setPickerRole(role)}
                        >
                          {ROLE_LABEL[role]} {items.length}/{cap}
                        </Button>
                        {items.length > 0 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setMedia((prev) => ({ ...prev, [role]: [] }))}
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="count">Results</Label>
                  <Select
                    value={String(count)}
                    onValueChange={(next) => setCount(Number(next))}
                  >
                    <SelectTrigger id="count" className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  disabled={!entry || !prompt.trim() || generate.isPending}
                  onClick={() => generate.mutate()}
                >
                  {generate.isPending ? "Sending…" : `Generate ${count}`}
                </Button>
                {!vertical && (
                  <Badge variant="outline" className="border-border/70 text-muted-foreground">
                    This model cannot do 9:16
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <RunGrid
            runs={runs.data?.runs ?? []}
            onRetry={(run) => restore.mutate(run)}
            onFavourite={(run) => star.mutate(run)}
          />
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-serif text-2xl italic">Model</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <Select value={modelId} onValueChange={chooseModel}>
                <SelectTrigger aria-label="Model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {MODELS.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {entry && (
                <SettingsRail
                  entry={entry}
                  settings={settings}
                  disabled={generate.isPending}
                  onChange={(key, value) => setSettings((prev) => ({ ...prev, [key]: value }))}
                />
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      {pickerRole && (
        <AssetPicker
          role={pickerRole}
          open
          onOpenChange={(next) => !next && setPickerRole(null)}
          onPick={(item) =>
            setMedia((prev) => {
              const cap = entry?.roles[pickerRole] ?? 1;
              const existing = prev[pickerRole] ?? [];
              return { ...prev, [pickerRole]: [...existing, item].slice(-cap) };
            })
          }
        />
      )}
    </main>
  );
}
