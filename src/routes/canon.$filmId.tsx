import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Lock, Unlock, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSessionId } from "@/lib/session";
import { getContinuityReport } from "@/lib/continuity.functions";
import {
  getCanon,
  saveCanonCharacter,
  saveCanonEnvironment,
  saveCanonProp,
  saveCanonWardrobe,
  type CanonCharacter,
  type CanonEnvironment,
  type CanonLocks,
  type CanonProp,
  type CanonView,
  type CanonWardrobe,
} from "@/lib/canon.functions";

/**
 * CONTINUITY CENTER — the canonical film truth, in one place, editable.
 *
 * Four views: Characters, World, Timeline and Conflicts. Editing writes canon;
 * nothing here renders a scene, spends a credit or blocks a render. The conflict
 * list is the existing advisory continuity report, unchanged.
 */

export const Route = createFileRoute("/canon/$filmId")({
  head: () => ({
    meta: [
      { title: "Continuity Center — your film's canonical truth | STORYREEL" },
      {
        name: "description",
        content:
          "Edit the permanent truth of your film: characters, locations, wardrobe, props, the scene timeline and every continuity conflict found.",
      },
      { property: "og:title", content: "Continuity Center — STORYREEL" },
      {
        property: "og:description",
        content:
          "One canonical world state for your film: characters, locations, wardrobe, props, timeline and conflicts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ContinuityCenter,
});

const CARD = "rounded-2xl border border-border bg-card p-5";
const FIELD = "text-xs uppercase tracking-widest text-muted-foreground";

const LOCK_FIELDS: (keyof CanonLocks)[] = [
  "identity",
  "face",
  "hair",
  "skin",
  "body",
  "wardrobe",
  "accessories",
];

function ContinuityCenter() {
  const { filmId } = Route.useParams();
  const [sessionId, setSessionId] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => setSessionId(getSessionId()), []);

  const fetchCanon = useServerFn(getCanon);
  const canonQuery = useQuery({
    queryKey: ["canon", filmId, sessionId],
    enabled: !!sessionId,
    retry: false,
    queryFn: () => fetchCanon({ data: { film_id: filmId, session_id: sessionId } }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["canon", filmId] });
  const canon = canonQuery.data;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-8">
      <Link
        to="/film/$filmId"
        params={{ filmId }}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to the film
      </Link>

      <h1 className="mt-6 font-serif text-3xl italic">Continuity Center</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {canon ? canon.title : "Your film"} — the permanent truth every scene is built from. What you
        change here is canon; a bad take never rewrites it.
      </p>

      {canonQuery.isLoading && (
        <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading your film's canon…
        </p>
      )}
      {canonQuery.error && (
        <p className="mt-8 text-sm text-primary">{(canonQuery.error as Error).message}</p>
      )}

      {canon && (
        <Tabs defaultValue="characters" className="mt-8">
          <TabsList className="flex w-full flex-wrap justify-start">
            <TabsTrigger value="characters">Characters</TabsTrigger>
            <TabsTrigger value="world">World</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="conflicts">Conflicts</TabsTrigger>
          </TabsList>

          <TabsContent value="characters" className="mt-6 space-y-5">
            {canon.characters.length === 0 && (
              <p className={CARD}>This film has no named characters yet.</p>
            )}
            {canon.characters.map((character) => (
              <CharacterCard
                key={character.canonical_id}
                filmId={filmId}
                sessionId={sessionId}
                character={character}
                onSaved={refresh}
              />
            ))}
          </TabsContent>

          <TabsContent value="world" className="mt-6 space-y-5">
            {canon.environments.map((environment) => (
              <EnvironmentCard
                key={environment.canonical_id}
                filmId={filmId}
                sessionId={sessionId}
                environment={environment}
                onSaved={refresh}
              />
            ))}
            <WardrobeList
              filmId={filmId}
              sessionId={sessionId}
              canon={canon}
              onSaved={refresh}
            />
            <PropList filmId={filmId} sessionId={sessionId} canon={canon} onSaved={refresh} />
          </TabsContent>

          <TabsContent value="timeline" className="mt-6">
            <SceneTimeline canon={canon} />
          </TabsContent>

          <TabsContent value="conflicts" className="mt-6">
            <ConflictCenter filmId={filmId} sessionId={sessionId} />
          </TabsContent>
        </Tabs>
      )}
    </main>
  );
}

/* ------------------------------------------------------------- characters */

function CharacterCard({
  filmId,
  sessionId,
  character,
  onSaved,
}: {
  filmId: string;
  sessionId: string;
  character: CanonCharacter;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(character);
  const save = useServerFn(saveCanonCharacter);

  useEffect(() => setDraft(character), [character]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          film_id: filmId,
          session_id: sessionId,
          canonical_id: draft.canonical_id,
          name: draft.name,
          age: draft.age,
          appearance: draft.appearance,
          face: draft.face,
          hair: draft.hair,
          skin: draft.skin,
          body: draft.body,
          height: draft.height,
          build: draft.build,
          personality: draft.personality,
          expression_profile: draft.expression_profile,
          locks: draft.locks,
          continuity_constraints: draft.continuity_constraints,
        },
      }),
    onSuccess: (result) => {
      onSaved();
      toast.success(
        result.affected_scenes.length
          ? `Saved as version ${result.version}. This affects scene ${result.affected_scenes.join(", ")} — nothing was regenerated.`
          : `Saved as version ${result.version}.`,
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const set = (key: keyof CanonCharacter, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <section className={CARD}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-serif text-xl italic">{draft.name || draft.canonical_id}</h2>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {draft.canonical_id} · version {draft.version}
            {draft.appears_in.length > 0 && ` · scenes ${draft.appears_in.join(", ")}`}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {draft.reference_pack_ready
            ? `${draft.reference_assets.length} reference image(s)`
            : "Reference pack missing"}
        </p>
      </header>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Labeled label="Name">
          <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </Labeled>
        <Labeled label="Age">
          <Input value={draft.age} onChange={(e) => set("age", e.target.value)} />
        </Labeled>
        <Labeled label="Face">
          <Textarea rows={2} value={draft.face} onChange={(e) => set("face", e.target.value)} />
        </Labeled>
        <Labeled label="Hair">
          <Textarea rows={2} value={draft.hair} onChange={(e) => set("hair", e.target.value)} />
        </Labeled>
        <Labeled label="Skin">
          <Textarea rows={2} value={draft.skin} onChange={(e) => set("skin", e.target.value)} />
        </Labeled>
        <Labeled label="Body">
          <Textarea rows={2} value={draft.body} onChange={(e) => set("body", e.target.value)} />
        </Labeled>
        <Labeled label="Height">
          <Input value={draft.height} onChange={(e) => set("height", e.target.value)} />
        </Labeled>
        <Labeled label="Build">
          <Input value={draft.build} onChange={(e) => set("build", e.target.value)} />
        </Labeled>
        <div className="sm:col-span-2">
          <Labeled label="Overall appearance">
            <Textarea
              rows={3}
              value={draft.appearance}
              onChange={(e) => set("appearance", e.target.value)}
            />
          </Labeled>
        </div>
        <Labeled label="Personality">
          <Textarea
            rows={2}
            value={draft.personality}
            onChange={(e) => set("personality", e.target.value)}
          />
        </Labeled>
        <Labeled label="Expressions">
          <Textarea
            rows={2}
            value={draft.expression_profile}
            onChange={(e) => set("expression_profile", e.target.value)}
          />
        </Labeled>
      </div>

      <div className="mt-5">
        <p className={FIELD}>Locked truth</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Locked details must stay identical in every scene. Pose, emotion, movement, camera,
          lighting and action are always free to change.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {LOCK_FIELDS.map((field) => {
            const on = draft.locks[field];
            return (
              <button
                key={field}
                type="button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    locks: { ...prev.locks, [field]: !prev.locks[field] },
                  }))
                }
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs capitalize ${
                  on
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {on ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                {field}
              </button>
            );
          })}
        </div>
      </div>

      <Button
        className="mt-5"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Saving…" : "Save as canon"}
      </Button>
    </section>
  );
}

/* -------------------------------------------------------------- world */

function EnvironmentCard({
  filmId,
  sessionId,
  environment,
  onSaved,
}: {
  filmId: string;
  sessionId: string;
  environment: CanonEnvironment;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(environment);
  const save = useServerFn(saveCanonEnvironment);

  useEffect(() => setDraft(environment), [environment]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          film_id: filmId,
          session_id: sessionId,
          canonical_id: draft.canonical_id,
          name: draft.name,
          architecture: draft.architecture,
          layout: draft.layout,
          furniture: draft.furniture,
          materials: draft.materials,
          palette: draft.palette,
          lighting: draft.lighting,
          props: draft.props,
          continuity_constraints: draft.continuity_constraints,
        },
      }),
    onSuccess: (result) => {
      onSaved();
      toast.success(
        result.affected_scenes.length
          ? `Saved as version ${result.version}. Used by scene ${result.affected_scenes.join(", ")} — nothing was regenerated.`
          : `Saved as version ${result.version}.`,
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const set = (key: keyof CanonEnvironment, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <section className={CARD}>
      <header>
        <h2 className="font-serif text-xl italic">{draft.name || draft.canonical_id}</h2>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {draft.canonical_id} · version {draft.version}
          {draft.used_by.length > 0 && ` · scenes ${draft.used_by.join(", ")}`}
        </p>
      </header>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Labeled label="Name">
          <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </Labeled>
        <Labeled label="Lighting">
          <Input value={draft.lighting} onChange={(e) => set("lighting", e.target.value)} />
        </Labeled>
        <Labeled label="Architecture">
          <Textarea
            rows={2}
            value={draft.architecture}
            onChange={(e) => set("architecture", e.target.value)}
          />
        </Labeled>
        <Labeled label="Layout">
          <Textarea rows={2} value={draft.layout} onChange={(e) => set("layout", e.target.value)} />
        </Labeled>
        <Labeled label="Furniture">
          <Textarea
            rows={2}
            value={draft.furniture}
            onChange={(e) => set("furniture", e.target.value)}
          />
        </Labeled>
        <Labeled label="Materials">
          <Textarea
            rows={2}
            value={draft.materials}
            onChange={(e) => set("materials", e.target.value)}
          />
        </Labeled>
        <div className="sm:col-span-2">
          <Labeled label="Colour palette">
            <Input value={draft.palette} onChange={(e) => set("palette", e.target.value)} />
          </Labeled>
        </div>
      </div>

      <Button className="mt-5" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Saving…" : "Save as canon"}
      </Button>
    </section>
  );
}

function WardrobeList({
  filmId,
  sessionId,
  canon,
  onSaved,
}: {
  filmId: string;
  sessionId: string;
  canon: CanonView;
  onSaved: () => void;
}) {
  const save = useServerFn(saveCanonWardrobe);
  const [drafts, setDrafts] = useState<Record<string, CanonWardrobe>>({});

  useEffect(() => {
    setDrafts(Object.fromEntries(canon.wardrobe.map((w) => [w.canonical_id, w])));
  }, [canon.wardrobe]);

  const mutation = useMutation({
    mutationFn: (entry: CanonWardrobe) =>
      save({
        data: {
          film_id: filmId,
          session_id: sessionId,
          canonical_id: entry.canonical_id,
          description: entry.description,
          accessories: entry.accessories,
          changed_in_scene: entry.changed_in_scene,
          reason: entry.reason,
        },
      }),
    onSuccess: () => {
      onSaved();
      toast.success("Wardrobe state saved.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const nameOf = (id: string) =>
    canon.characters.find((c) => c.canonical_id === id)?.name ?? id;

  return (
    <section className={CARD}>
      <h2 className="font-serif text-xl italic">Wardrobe</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        What each character wears, from which scene, and why it changed. A change is always a story
        event — never something that drifts between scenes.
      </p>

      {canon.wardrobe.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          No scene has established a wardrobe yet.
        </p>
      )}

      <div className="mt-4 space-y-5">
        {canon.wardrobe.map((entry) => {
          const draft = drafts[entry.canonical_id] ?? entry;
          const set = (key: keyof CanonWardrobe, value: string | number | null) =>
            setDrafts((prev) => ({
              ...prev,
              [entry.canonical_id]: { ...draft, [key]: value },
            }));
          return (
            <div key={entry.canonical_id} className="rounded-xl border border-border p-4">
              <p className="text-sm">
                {nameOf(entry.character_canonical_id)}
                {entry.from_scene !== null && (
                  <span className="text-muted-foreground"> — from scene {entry.from_scene}</span>
                )}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Labeled label="Worn">
                  <Textarea
                    rows={2}
                    value={draft.description}
                    onChange={(e) => set("description", e.target.value)}
                  />
                </Labeled>
                <Labeled label="Accessories">
                  <Textarea
                    rows={2}
                    value={draft.accessories}
                    onChange={(e) => set("accessories", e.target.value)}
                  />
                </Labeled>
                <Labeled label="Changed in scene">
                  <Input
                    value={draft.changed_in_scene === null ? "" : String(draft.changed_in_scene)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      set("changed_in_scene", e.target.value === "" || !n ? null : n);
                    }}
                  />
                </Labeled>
                <Labeled label="Why it changed">
                  <Input value={draft.reason} onChange={(e) => set("reason", e.target.value)} />
                </Labeled>
              </div>
              <Button
                variant="secondary"
                className="mt-3"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(draft)}
              >
                Save wardrobe state
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PropList({
  filmId,
  sessionId,
  canon,
  onSaved,
}: {
  filmId: string;
  sessionId: string;
  canon: CanonView;
  onSaved: () => void;
}) {
  const save = useServerFn(saveCanonProp);
  const [drafts, setDrafts] = useState<Record<string, CanonProp>>({});

  useEffect(() => {
    setDrafts(Object.fromEntries(canon.props.map((p) => [p.canonical_id, p])));
  }, [canon.props]);

  const mutation = useMutation({
    mutationFn: (entry: CanonProp) =>
      save({
        data: {
          film_id: filmId,
          session_id: sessionId,
          canonical_id: entry.canonical_id,
          name: entry.name,
          appearance: entry.appearance,
          owner_canonical_id: entry.owner_canonical_id,
          location: entry.location,
          state: entry.state,
          scene_number: entry.scene_number,
        },
      }),
    onSuccess: () => {
      onSaved();
      toast.success("Prop saved.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <section className={CARD}>
      <h2 className="font-serif text-xl italic">Props</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Objects that matter, with who holds them and where they sit right now.
      </p>

      {canon.props.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No props are tracked for this film yet.</p>
      )}

      <div className="mt-4 space-y-5">
        {canon.props.map((entry) => {
          const draft = drafts[entry.canonical_id] ?? entry;
          const set = (key: keyof CanonProp, value: string | number | null) =>
            setDrafts((prev) => ({ ...prev, [entry.canonical_id]: { ...draft, [key]: value } }));
          return (
            <div key={entry.canonical_id} className="rounded-xl border border-border p-4">
              <p className="font-mono text-xs text-muted-foreground">{entry.canonical_id}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Labeled label="Name">
                  <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
                </Labeled>
                <Labeled label="Held by">
                  <Input
                    value={draft.owner_canonical_id ?? ""}
                    onChange={(e) => set("owner_canonical_id", e.target.value || null)}
                  />
                </Labeled>
                <Labeled label="Where it is">
                  <Input value={draft.location} onChange={(e) => set("location", e.target.value)} />
                </Labeled>
                <Labeled label="Its state">
                  <Input value={draft.state} onChange={(e) => set("state", e.target.value)} />
                </Labeled>
                <div className="sm:col-span-2">
                  <Labeled label="Appearance">
                    <Textarea
                      rows={2}
                      value={draft.appearance}
                      onChange={(e) => set("appearance", e.target.value)}
                    />
                  </Labeled>
                </div>
              </div>
              <Button
                variant="secondary"
                className="mt-3"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(draft)}
              >
                Save prop
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ timeline */

function SceneTimeline({ canon }: { canon: CanonView }) {
  const nameOf = (id: string) => canon.characters.find((c) => c.canonical_id === id)?.name ?? id;
  const envOf = (id: string | null) =>
    canon.environments.find((e) => e.canonical_id === id)?.name ?? null;

  return (
    <section className={CARD}>
      <h2 className="font-serif text-xl italic">Scene timeline</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Every scene in order, with the scene it follows. No scene stands alone.
      </p>

      <ol className="mt-5 space-y-4">
        {canon.scenes.map((scene) => (
          <li key={scene.scene_id} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  {String(scene.scene_number).padStart(2, "0")}
                </span>{" "}
                {scene.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {scene.has_clip ? "Clip rendered" : scene.status}
              </p>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {envOf(scene.environment_id) ?? "Location not established"}
              {scene.characters.length > 0 && ` · ${scene.characters.map(nameOf).join(", ")}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {scene.previous_scene_id
                ? `Continues from scene ${scene.scene_number - 1}`
                : "Opens the film"}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ----------------------------------------------------------- conflicts */

function ConflictCenter({ filmId, sessionId }: { filmId: string; sessionId: string }) {
  const fetchReport = useServerFn(getContinuityReport);
  const query = useQuery({
    queryKey: ["continuity", filmId, sessionId],
    enabled: !!sessionId,
    retry: false,
    queryFn: () => fetchReport({ data: { film_id: filmId, session_id: sessionId } }),
  });

  const report = query.data;

  return (
    <section className={CARD}>
      <h2 className="font-serif text-xl italic">Conflicts</h2>
      <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="h-4 w-4" /> Advisory only. Nothing is blocked and the check costs no
        credits.
      </p>

      {query.isLoading && <p className="mt-4 text-sm text-muted-foreground">Checking…</p>}
      {query.error && <p className="mt-4 text-sm text-primary">{(query.error as Error).message}</p>}

      {report && report.findings.length === 0 && (
        <p className="mt-4 text-sm text-emerald-400">No continuity issues found.</p>
      )}

      <div className="mt-4 space-y-4">
        {(report?.findings ?? []).map((finding) => (
          <div key={`${finding.rule_id}-${finding.message}`} className="rounded-xl border border-border p-4">
            <p className="text-sm">{finding.title}</p>
            <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
              {finding.severity}
              {finding.scene_numbers.length > 0 && ` · scene ${finding.scene_numbers.join(", ")}`}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{finding.message}</p>
            {finding.suggested_actions.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                {finding.suggested_actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={FIELD}>{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
