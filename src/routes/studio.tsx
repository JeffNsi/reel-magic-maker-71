import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Clapperboard,
  Film,
  History as HistoryIcon,
  Loader2,
  Plus,
  Save,
  Trash2,
  Wand2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilmPlayer } from "@/components/film-player";
import { SeriesPlayer } from "@/components/series-player";
import { StoryPack } from "@/components/story-pack";
import { getSessionId } from "@/lib/session";
import { checkStatus } from "@/lib/storyreel.functions";
import {
  deleteScene,
  generateScene,
  getStory,
  listStories,
  MUSIC_BEDS,
  narrateGeneration,
  saveBible,
  saveScene,
  VOICES,
  type SceneView,
  type StoryCharacter,
  type StoryView,
} from "@/lib/story.functions";

export const Route = createFileRoute("/studio")({
  validateSearch: (search: Record<string, unknown>) => ({
    story: typeof search["story"] === "string" ? (search["story"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Scene editor — STORYREEL multi-scene short films" },
      {
        name: "description",
        content:
          "Write your short film scene by scene, keep the same characters and setting, and generate each scene with its own voice-over.",
      },
      { property: "og:title", content: "STORYREEL scene editor — build a multi-scene short" },
      {
        property: "og:description",
        content:
          "Write your short film scene by scene, keep the same characters and setting, and generate each scene with its own voice-over.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

function Studio() {
  const { story: storyId } = Route.useSearch();
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState("");
  const [theme, setTheme] = useState("");

  useEffect(() => setSessionId(getSessionId()), []);

  const open = (id: string) => navigate({ to: "/studio", search: { story: id } });

  return (
    <div className="min-h-screen bg-background selection:bg-primary/30">
      <StudioHeader />
      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 sm:px-6">
        {storyId && sessionId ? (
          <StoryEditor storyId={storyId} sessionId={sessionId} />
        ) : (
          <>
            <header className="mb-10 text-center">
              <h1 className="font-display text-4xl italic leading-tight text-foreground sm:text-6xl">
                Write it <span className="text-primary">scene by scene.</span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-balance text-base font-light text-muted-foreground">
                Start from a theme or an empty page. Your cast and setting stay locked across every
                scene you generate.
              </p>
            </header>

            {sessionId && (
              <>
                <StoryPack
                  style="cinematic"
                  sessionId={sessionId}
                  theme={theme}
                  setTheme={setTheme}
                  onOpenStudio={open}
                />
                <StoryList sessionId={sessionId} onOpen={open} />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function StudioHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          to="/"
          className="font-display text-2xl italic tracking-tight text-primary transition-opacity hover:opacity-80"
        >
          STORYREEL
        </Link>
        <nav className="flex items-center gap-6">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Film className="size-4" aria-hidden /> Create
          </Link>
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Clapperboard className="size-4" aria-hidden /> Scene editor
          </span>
          <Link
            to="/history"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <HistoryIcon className="size-4" aria-hidden /> My shorts
          </Link>
        </nav>
      </div>
    </header>
  );
}

function StoryList({ sessionId, onOpen }: { sessionId: string; onOpen: (id: string) => void }) {
  const load = useServerFn(listStories);
  const { data } = useQuery({
    queryKey: ["stories", sessionId],
    queryFn: () => load({ data: { session_id: sessionId } }),
  });

  if (!data?.length) return null;

  return (
    <section className="mt-12">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Your stories
      </h2>
      <ul className="space-y-3">
        {data.map((story) => (
          <li key={story.id}>
            <button
              type="button"
              onClick={() => onOpen(story.id)}
              className="w-full rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/40"
            >
              <p className="font-display text-xl italic text-foreground">
                {story.title || "Untitled"}
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{story.logline}</p>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StoryEditor({ storyId, sessionId }: { storyId: string; sessionId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getStory);
  const poll = useServerFn(checkStatus);

  const storyQuery = useQuery({
    queryKey: ["story", storyId, sessionId],
    queryFn: () => load({ data: { story_id: storyId, session_id: sessionId } }),
  });

  const story = storyQuery.data;
  const pendingIds = (story?.scenes ?? [])
    .filter((scene) => scene.status === "queued" || scene.status === "processing")
    .map((scene) => scene.generation_id)
    .filter((id): id is string => !!id);

  // Advance any in-flight scene with the video service, then refresh the story.
  useQuery({
    queryKey: ["story-poll", storyId, pendingIds.join(",")],
    enabled: pendingIds.length > 0,
    refetchInterval: 5000,
    queryFn: async () => {
      let changed = false;
      for (const id of pendingIds) {
        const result = await poll({ data: { generation_id: id, session_id: sessionId } });
        if (result.status === "completed" || result.status === "failed") changed = true;
      }
      if (changed) {
        await queryClient.invalidateQueries({ queryKey: ["story", storyId, sessionId] });
      }
      return pendingIds.length;
    },
  });

  const setStory = (next: StoryView) =>
    queryClient.setQueryData(["story", storyId, sessionId], next);

  if (storyQuery.isPending) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  if (storyQuery.isError || !story) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">That story could not be loaded.</p>
        <Button asChild variant="outline" className="mt-5 h-11 rounded-xl px-6">
          <Link to="/studio" search={{ story: undefined }}>
            Back to stories
          </Link>
        </Button>
      </div>
    );
  }

  const finished = story.scenes
    .filter((scene): scene is SceneView & { video_url: string } => !!scene.video_url)
    .map((scene) => ({
      id: scene.id,
      scene_number: scene.scene_number,
      title: scene.title,
      video_url: scene.video_url,
      voice_url: scene.voice_url,
    }));

  return (
    <div className="space-y-8">
      <Link
        to="/studio"
        search={{ story: undefined }}
        className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> All stories
      </Link>

      <BibleCard story={story} sessionId={sessionId} onSaved={setStory} />

      {finished.length > 0 && (
        <SeriesPlayer title={story.title || "storyreel-series"} scenes={finished} />
      )}

      <div className="space-y-6">
        {story.scenes.map((scene) => (
          <SceneCard
            key={scene.id}
            story={story}
            scene={scene}
            sessionId={sessionId}
            onSaved={setStory}
          />
        ))}
      </div>

      <NewSceneButton story={story} sessionId={sessionId} onSaved={setStory} />
    </div>
  );
}

function BibleCard({
  story,
  sessionId,
  onSaved,
}: {
  story: StoryView;
  sessionId: string;
  onSaved: (s: StoryView) => void;
}) {
  const [title, setTitle] = useState(story.title);
  const [setting, setSetting] = useState(story.setting);
  const [characters, setCharacters] = useState<StoryCharacter[]>(
    story.characters.length ? story.characters : [{ name: "", look: "" }],
  );

  const save = useServerFn(saveBible);
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          story_id: story.id,
          session_id: sessionId,
          title,
          setting,
          characters: characters.filter((c) => c.name.trim() || c.look.trim()),
        },
      }),
    onSuccess: (result) => {
      onSaved(result);
      toast.success("Story bible saved — every new scene uses it.");
    },
    onError: (err: Error) => toast.error(err.message || "Could not save."),
  });

  return (
    <section className="rounded-3xl border border-border bg-card p-6 sm:p-8">
      <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Story bible — kept identical in every scene
      </p>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, 120))}
        placeholder="Film title"
        className="h-14 rounded-xl border-border bg-background/50 font-display text-2xl italic"
      />

      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Setting
        </p>
        <Textarea
          value={setting}
          onChange={(e) => setSetting(e.target.value.slice(0, 400))}
          rows={2}
          placeholder="A storm-lashed island lighthouse at dusk..."
          className="resize-none rounded-xl border-border bg-background/50 text-sm"
        />
      </div>

      <div className="mt-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Characters
        </p>
        {characters.map((character, index) => (
          <div key={index} className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={character.name}
              onChange={(e) => {
                const next = [...characters];
                next[index] = { ...character, name: e.target.value.slice(0, 80) };
                setCharacters(next);
              }}
              placeholder="Name"
              className="h-11 rounded-xl border-border bg-background/50 text-sm sm:w-40"
            />
            <Input
              value={character.look}
              onChange={(e) => {
                const next = [...characters];
                next[index] = { ...character, look: e.target.value.slice(0, 300) };
                setCharacters(next);
              }}
              placeholder="Age, build, hair, clothing — anything that must stay the same"
              className="h-11 flex-1 rounded-xl border-border bg-background/50 text-sm"
            />
            <Button
              onClick={() => setCharacters(characters.filter((_, i) => i !== index))}
              variant="ghost"
              className="h-11 shrink-0 rounded-xl px-3 text-muted-foreground"
              aria-label={`Remove character ${index + 1}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          onClick={() => setCharacters([...characters, { name: "", look: "" }])}
          variant="ghost"
          className="h-10 rounded-xl px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary"
        >
          <Plus className="mr-2 size-4" /> Add character
        </Button>
      </div>

      <Button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        variant="outline"
        className="mt-6 h-12 w-full rounded-xl text-xs font-semibold uppercase tracking-[0.2em]"
      >
        {mutation.isPending ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" /> Saving
          </>
        ) : (
          <>
            <Save className="mr-2 size-4" /> Save story bible
          </>
        )}
      </Button>
    </section>
  );
}

function SceneCard({
  story,
  scene,
  sessionId,
  onSaved,
}: {
  story: StoryView;
  scene: SceneView;
  sessionId: string;
  onSaved: (s: StoryView) => void;
}) {
  const [title, setTitle] = useState(scene.title);
  const [idea, setIdea] = useState(scene.idea);
  const [narration, setNarration] = useState(scene.narration);
  const [audio, setAudio] = useState(true);
  const [voice, setVoice] = useState("alloy");
  const [music, setMusic] = useState("wonder");
  const [voiceUrl, setVoiceUrl] = useState<string | null>(scene.voice_url);
  const narratedFor = useRef<string | null>(null);

  useEffect(() => setVoiceUrl(scene.voice_url), [scene.voice_url]);

  const persist = useServerFn(saveScene);
  const remove = useServerFn(deleteScene);
  const render = useServerFn(generateScene);
  const narrate = useServerFn(narrateGeneration);

  const saveMutation = useMutation({
    mutationFn: () =>
      persist({
        data: {
          story_id: story.id,
          session_id: sessionId,
          scene_number: scene.scene_number,
          title,
          idea,
          narration,
        },
      }),
    onSuccess: (result) => {
      onSaved(result);
      toast.success(`Scene ${scene.scene_number} saved.`);
    },
    onError: (err: Error) => toast.error(err.message || "Could not save this scene."),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      remove({ data: { story_id: story.id, session_id: sessionId, scene_id: scene.id } }),
    onSuccess: onSaved,
    onError: (err: Error) => toast.error(err.message || "Could not remove this scene."),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      await persist({
        data: {
          story_id: story.id,
          session_id: sessionId,
          scene_number: scene.scene_number,
          title,
          idea,
          narration,
        },
      });
      return render({
        data: { story_id: story.id, session_id: sessionId, scene_id: scene.id, audio },
      });
    },
    onSuccess: (result) => {
      onSaved(result.story);
      toast.success(`Scene ${scene.scene_number} is rendering.`);
    },
    onError: (err: Error) => toast.error(err.message || "Could not generate this scene."),
  });

  const narrateMutation = useMutation({
    mutationFn: (input: { text: string; voice: string; music: string }) =>
      narrate({
        data: {
          session_id: sessionId,
          generation_id: scene.generation_id!,
          text: input.text,
          voice: input.voice,
          music: input.music,
        },
      }),
    onSuccess: (result) => {
      setVoiceUrl(result.voice_url);
      toast.success("Voice-over added.");
    },
    onError: (err: Error) => toast.error(err.message || "Could not record the voice-over."),
  });

  const busy = scene.status === "queued" || scene.status === "processing";

  return (
    <section className="rounded-3xl border border-border bg-card p-6 sm:p-8">
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Scene {scene.scene_number}
        </p>
        <Button
          onClick={() => deleteMutation.mutate()}
          disabled={deleteMutation.isPending}
          variant="ghost"
          className="h-9 rounded-lg px-3 text-muted-foreground"
          aria-label={`Remove scene ${scene.scene_number}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, 120))}
        placeholder="Scene title"
        className="h-12 rounded-xl border-border bg-background/50 text-base"
      />

      <Textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value.slice(0, 500))}
        rows={4}
        placeholder="What happens in this 5-second shot?"
        className="mt-4 resize-none rounded-xl border-border bg-background/50 text-sm leading-relaxed"
      />

      <Input
        value={narration}
        onChange={(e) => setNarration(e.target.value.slice(0, 300))}
        placeholder="Voice-over line for this scene (optional)"
        className="mt-3 h-11 rounded-xl border-border bg-background/50 text-sm"
      />

      <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-background/40 px-4 py-3">
        <label htmlFor={`audio-${scene.id}`} className="text-sm text-muted-foreground">
          Let the video model add its own sound
        </label>
        <Switch id={`audio-${scene.id}`} checked={audio} onCheckedChange={setAudio} />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          variant="outline"
          className="h-12 flex-1 rounded-xl text-xs font-semibold uppercase tracking-[0.2em]"
        >
          <Save className="mr-2 size-4" /> Save
        </Button>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending || busy || !idea.trim()}
          className="h-12 flex-1 rounded-xl bg-primary text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground hover:shadow-[0_0_24px_var(--glow)]"
        >
          {generateMutation.isPending || busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {busy ? "Rendering" : "Starting"}
            </>
          ) : (
            <>
              <Wand2 className="mr-2 size-4" /> {scene.video_url ? "Regenerate" : "Generate scene"}
            </>
          )}
        </Button>
      </div>

      {scene.status === "failed" && scene.error_message && (
        <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          {scene.error_message}
        </p>
      )}

      {busy && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Filming this scene — about 2–3 minutes. You can keep writing the next one.
        </p>
      )}

      {scene.video_url && (
        <div className="mt-6">
          <FilmPlayer
            videoUrl={scene.video_url}
            voiceUrl={voiceUrl}
            narration={narration}
            generationId={scene.generation_id}
            onNarrate={(input) => narrateMutation.mutate(input)}
            narrating={narrateMutation.isPending}
          />
        </div>
      )}
    </section>
  );
}

function NewSceneButton({
  story,
  sessionId,
  onSaved,
}: {
  story: StoryView;
  sessionId: string;
  onSaved: (s: StoryView) => void;
}) {
  const persist = useServerFn(saveScene);
  const next = (story.scenes.at(-1)?.scene_number ?? 0) + 1;

  const mutation = useMutation({
    mutationFn: () =>
      persist({
        data: {
          story_id: story.id,
          session_id: sessionId,
          scene_number: next,
          title: `Scene ${next}`,
          idea: "",
          narration: "",
        },
      }),
    onSuccess: onSaved,
    onError: (err: Error) => toast.error(err.message || "Could not add a scene."),
  });

  return (
    <Button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      variant="outline"
      className="h-14 w-full rounded-2xl border-dashed text-xs font-semibold uppercase tracking-[0.2em]"
    >
      {mutation.isPending ? (
        <Loader2 className="mr-2 size-4 animate-spin" />
      ) : (
        <Plus className="mr-2 size-4" />
      )}
      Add scene {next}
    </Button>
  );
}
