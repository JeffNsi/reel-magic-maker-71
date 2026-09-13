import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Clapperboard, Loader2, Sparkles, Users, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveStory, writeStoryPack, type StoryConcept } from "@/lib/story.functions";

/**
 * Theme in, several finished film concepts out — each with its cast, its setting
 * and one prompt per scene, ready to generate or to open in the scene editor.
 */
export function StoryPack({
  style,
  sessionId,
  theme,
  setTheme,
  onUsePrompt,
  onOpenStudio,
}: {
  style: string;
  sessionId: string;
  theme: string;
  setTheme: (v: string) => void;
  onUsePrompt?: (prompt: string) => void;
  onOpenStudio: (storyId: string) => void;
}) {
  const [sceneCount, setSceneCount] = useState("3");
  const [concepts, setConcepts] = useState<StoryConcept[]>([]);

  const write = useServerFn(writeStoryPack);
  const save = useServerFn(saveStory);

  const pack = useMutation({
    mutationFn: () => write({ data: { theme, style, scene_count: Number(sceneCount) } }),
    onSuccess: (result) => {
      setConcepts(result.concepts);
      toast.success(`${result.concepts.length} concepts ready.`);
    },
    onError: (err: Error) => toast.error(err.message || "The story writer had a hiccup."),
  });

  const build = useMutation({
    mutationFn: (concept: StoryConcept) =>
      save({ data: { session_id: sessionId, theme, style, concept } }),
    onSuccess: (result) => onOpenStudio(result.story_id),
    onError: (err: Error) => toast.error(err.message || "Could not open this story."),
  });

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-5 flex items-center gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">Story generator</p>
            <p className="text-xs text-muted-foreground">
              Give a theme — get three films with cast, setting and scene-by-scene prompts.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={theme}
            onChange={(e) => setTheme(e.target.value.slice(0, 200))}
            placeholder="Lonely lighthouse keeper"
            className="h-12 rounded-xl border-border bg-background/60 text-base"
            onKeyDown={(e) => {
              if (e.key === "Enter" && theme.trim() && !pack.isPending) pack.mutate();
            }}
          />
          <Select value={sceneCount} onValueChange={setSceneCount}>
            <SelectTrigger className="h-12 w-full rounded-xl border-border bg-background/60 text-base sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} {n === 1 ? "scene" : "scenes"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              if (!theme.trim()) {
                toast.error("Give me a theme first.");
                return;
              }
              pack.mutate();
            }}
            disabled={pack.isPending}
            variant="outline"
            className="h-12 shrink-0 rounded-xl px-6 text-xs font-semibold uppercase tracking-[0.2em]"
          >
            {pack.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Writing
              </>
            ) : (
              <>
                <Wand2 className="mr-2 size-4" /> Write stories
              </>
            )}
          </Button>
        </div>
      </div>

      {concepts.map((concept, index) => (
        <article
          key={`${concept.title}-${index}`}
          className="rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
        >
          <header className="mb-4">
            <h3 className="font-display text-2xl italic text-foreground">
              {concept.title || `Concept ${index + 1}`}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{concept.logline}</p>
          </header>

          {concept.characters.length > 0 && (
            <div className="mb-4 rounded-xl border border-border/70 bg-background/40 p-4">
              <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <Users className="size-3.5" aria-hidden /> Cast
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {concept.characters.map((character) => (
                  <li key={character.name}>
                    <span className="text-foreground">{character.name}</span> — {character.look}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {concept.setting && (
            <p className="mb-4 text-sm text-muted-foreground">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">Setting</span>{" "}
              — {concept.setting}
            </p>
          )}

          <ol className="space-y-3">
            {concept.scenes.map((scene, sceneIndex) => (
              <li
                key={`${scene.title}-${sceneIndex}`}
                className="rounded-xl border border-border/70 bg-background/40 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                  Scene {sceneIndex + 1}
                  {scene.title ? ` · ${scene.title}` : ""}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-foreground/90">{scene.prompt}</p>
                {scene.narration && (
                  <p className="mt-2 text-xs italic text-muted-foreground">“{scene.narration}”</p>
                )}
                {onUsePrompt && (
                  <Button
                    onClick={() => {
                      onUsePrompt(scene.prompt.slice(0, 500));
                      toast.success("Prompt loaded — edit it or hit Generate.");
                    }}
                    variant="ghost"
                    className="mt-3 h-9 rounded-lg px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary"
                  >
                    Use this prompt
                  </Button>
                )}
              </li>
            ))}
          </ol>

          <Button
            onClick={() => build.mutate(concept)}
            disabled={build.isPending}
            className="mt-5 h-12 w-full rounded-xl bg-primary text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground hover:shadow-[0_0_24px_var(--glow)]"
          >
            {build.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Opening
              </>
            ) : (
              <>
                <Clapperboard className="mr-2 size-4" /> Build this in the scene editor
              </>
            )}
          </Button>
        </article>
      ))}
    </section>
  );
}
