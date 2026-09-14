import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2, Sparkles, Wand2 } from "lucide-react";

import {
  answerDirector,
  finishDirector,
  saveBlueprint,
  startDirector,
  type DirectorState,
} from "@/lib/director.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const DIMENSION_LABELS: Record<string, string> = {
  story: "Story",
  character: "Character",
  emotion: "Emotion",
  world: "World",
  camera: "Camera",
  audience: "Audience",
  turn: "The turn",
  ending: "Ending",
};

/**
 * The adaptive interview. One question at a time, always re-derived from
 * everything the creator has said, ending in a film bible and a blueprint.
 */
export function DirectorPanel({
  sessionId,
  idea,
  style,
  generating,
  onGenerate,
  onCancel,
}: {
  sessionId: string;
  idea: string;
  style: string;
  generating: boolean;
  onGenerate: (blueprint: string, directorSessionId: string) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<DirectorState | null>(null);
  const [answer, setAnswer] = useState("");
  const [blueprint, setBlueprint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);

  const begin = useServerFn(startDirector);
  const reply = useServerFn(answerDirector);
  const finish = useServerFn(finishDirector);
  const persist = useServerFn(saveBlueprint);

  const apply = (next: DirectorState) => {
    setState(next);
    setAnswer("");
    setError(null);
    if (next.blueprint) setBlueprint(next.blueprint);
  };

  const fail = (err: Error) => setError(err.message);

  const startMutation = useMutation({
    mutationFn: () => begin({ data: { idea, style, session_id: sessionId } }),
    onSuccess: apply,
    onError: fail,
  });

  const answerMutation = useMutation({
    mutationFn: (skip: boolean) =>
      reply({
        data: {
          director_session_id: state!.id,
          session_id: sessionId,
          answer: skip ? "" : answer,
          skip,
        },
      }),
    onSuccess: apply,
    onError: fail,
  });

  const finishMutation = useMutation({
    mutationFn: () =>
      finish({ data: { director_session_id: state!.id, session_id: sessionId } }),
    onSuccess: apply,
    onError: fail,
  });

  useEffect(() => {
    if (started.current || !sessionId) return;
    started.current = true;
    startMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (state?.question) answerRef.current?.focus();
  }, [state?.question?.text]);

  const thinking =
    startMutation.isPending || answerMutation.isPending || finishMutation.isPending;

  const generate = async () => {
    const text = blueprint.trim();
    if (!text || !state) return;
    try {
      if (text !== state.blueprint) {
        await persist({
          data: { director_session_id: state.id, session_id: sessionId, blueprint: text },
        });
      }
    } catch {
      /* an unsaved edit still generates — the text is passed along either way */
    }
    onGenerate(text, state.id);
  };

  return (
    <section className="relative mt-8 overflow-hidden rounded-3xl border border-border/80 bg-card/70 p-5 shadow-[var(--shadow-cinema)] backdrop-blur-xl sm:mt-10 sm:p-8">
      <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-primary/10 blur-[110px]" />

      <div className="relative space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-primary">
              Creative director
            </p>
            <h2 className="mt-2 font-display text-2xl italic text-foreground sm:text-3xl">
              {state?.status === "ready" ? "Your film is designed." : "Let's shape your film."}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Back
          </button>
        </header>

        {state?.understanding && (
          <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
              What I understand so far
            </p>
            <p className="mt-2 text-sm leading-relaxed text-foreground">{state.understanding}</p>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              {state.confidence.map((item) => (
                <div key={item.dimension}>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
                    {DIMENSION_LABELS[item.dimension] ?? item.dimension}
                  </p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-border/60">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${item.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {thinking && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin text-primary" />
            Thinking about what matters most...
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4">
            <p className="text-sm text-foreground">{error}</p>
            <Button
              variant="outline"
              onClick={() => (state ? finishMutation.mutate() : startMutation.mutate())}
              className="mt-3 h-10 rounded-xl text-[10px] uppercase tracking-[0.2em]"
            >
              Try again
            </Button>
          </div>
        )}

        {!thinking && state?.breakthrough && (
          <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary">
              This changes the film
            </p>
            <p className="mt-2 text-sm leading-relaxed text-foreground">{state.breakthrough}</p>
          </div>
        )}

        {!thinking && state?.conflict && (
          <div className="rounded-2xl border border-primary/40 bg-background/40 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary">
              I noticed a story conflict
            </p>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              {state.conflict.message}
            </p>
          </div>
        )}

        {!thinking && state?.question && (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
                Question {state.question_count}
              </p>
              {state.question.preface && (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {state.question.preface}
                </p>
              )}
              <p className="mt-2 font-display text-xl italic leading-snug text-foreground sm:text-2xl">
                {state.question.text}
              </p>
              {state.question.why && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Why I'm asking: {state.question.why}
                </p>
              )}
            </div>

            {(state.conflict?.options.length || state.question.suggestions.length) > 0 && (
              <div className="flex flex-wrap gap-2">
                {(state.conflict?.options.length
                  ? state.conflict.options
                  : state.question.suggestions
                ).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setAnswer(suggestion)}
                    className="rounded-full border border-border/70 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            <Textarea
              ref={answerRef}
              value={answer}
              onChange={(event) => setAnswer(event.target.value.slice(0, 400))}
              rows={3}
              placeholder="Answer in your own words..."
              className="min-h-[96px] resize-none rounded-2xl border-border/70 bg-background/40 p-4 text-base leading-relaxed placeholder:text-muted-foreground/60 focus-visible:border-primary/50"
            />

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={() => answerMutation.mutate(false)}
                disabled={!answer.trim()}
                className="group h-14 flex-1 rounded-2xl bg-primary text-xs font-semibold uppercase tracking-[0.25em] text-primary-foreground hover:shadow-[0_0_28px_var(--glow)]"
              >
                Continue
                <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
              </Button>
              <Button
                variant="outline"
                onClick={() => answerMutation.mutate(true)}
                className="h-14 rounded-2xl text-xs font-semibold uppercase tracking-[0.25em]"
              >
                You decide
              </Button>
            </div>

            <button
              type="button"
              onClick={() => finishMutation.mutate()}
              className="w-full text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Wand2 className="mr-1 inline size-3" /> Make my film now
            </button>
          </div>
        )}

        {!thinking && state?.status === "ready" && (
          <div className="space-y-5">
            <p className="text-[10px] uppercase tracking-[0.3em] text-primary">
              I have enough to direct this
            </p>

            {state.film_bible && (
              <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
                  Film bible
                </p>
                <h3 className="mt-2 font-display text-xl italic text-foreground">
                  {state.film_bible.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {state.film_bible.premise}
                </p>
                <dl className="mt-4 space-y-2 text-sm">
                  {[
                    ["Cast", state.film_bible.cast.join(", ")],
                    ["Setting", state.film_bible.setting],
                    ["Mood", state.film_bible.mood],
                    ["Look", state.film_bible.look],
                    ["Camera", state.film_bible.camera],
                    ["Arc", state.film_bible.emotional_arc],
                    ["Ending", state.film_bible.ending],
                  ]
                    .filter(([, value]) => value)
                    .map(([label, value]) => (
                      <div key={label} className="flex gap-3">
                        <dt className="w-16 shrink-0 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
                          {label}
                        </dt>
                        <dd className="text-foreground">{value}</dd>
                      </div>
                    ))}
                </dl>
                {(state.film_bible.decisions.length > 0 ||
                  state.film_bible.assumptions.length > 0) && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {[
                      ["Your decisions", state.film_bible.decisions],
                      ["My assumptions", state.film_bible.assumptions],
                    ]
                      .filter(([, items]) => (items as string[]).length > 0)
                      .map(([label, items]) => (
                        <div key={label as string}>
                          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
                            {label as string}
                          </p>
                          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                            {(items as string[]).map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <p className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
                <Sparkles className="size-3 text-primary" /> Creative blueprint — edit if you like
              </p>
              <Textarea
                value={blueprint}
                onChange={(event) => setBlueprint(event.target.value.slice(0, 500))}
                rows={5}
                className="min-h-[140px] resize-none rounded-2xl border-border/70 bg-background/40 p-4 text-base leading-relaxed focus-visible:border-primary/50"
              />
            </div>

            <div className="space-y-3">
              <Button
                onClick={() => void generate()}
                disabled={generating || !blueprint.trim()}
                className="group h-14 w-full rounded-2xl bg-primary text-xs font-semibold uppercase tracking-[0.25em] text-primary-foreground hover:shadow-[0_0_28px_var(--glow)]"
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Generating
                  </>
                ) : (
                  <>
                    Generate this film
                    <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </Button>
              <p className="text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
                Vertical 9:16 · 5 seconds
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
