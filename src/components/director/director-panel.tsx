import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2, ShieldCheck, Sparkles, Wand2, X } from "lucide-react";

import {
  answerDirector,
  applyChallenge,
  challengeFilm,
  keepMyVersion,
  finishDirector,
  reopenDirector,
  reviewBlueprint,
  saveBlueprint,
  startDirector,
  type BlueprintReview,
  type Challenge,
  type DirectorState,
} from "@/lib/director.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const DIMENSION_LABELS: Record<string, string> = {
  story: "Story",
  character: "Character",
  emotion: "Emotion",
  visual: "Visual",
  generation: "Ready to film",
};

const VERDICT_LABELS: Record<Challenge["verdict"], string> = {
  ready: "Ready to make",
  recommendation: "I have one recommendation",
  revision: "I found a creative problem",
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
  const [editing, setEditing] = useState(false);
  const [review, setReview] = useState<BlueprintReview | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [whatIfs, setWhatIfs] = useState(false);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);
  const challenged = useRef<string | null>(null);

  const begin = useServerFn(startDirector);
  const reply = useServerFn(answerDirector);
  const finish = useServerFn(finishDirector);
  const reopen = useServerFn(reopenDirector);
  const persist = useServerFn(saveBlueprint);
  const propagate = useServerFn(reviewBlueprint);
  const stressTest = useServerFn(challengeFilm);
  const acceptFix = useServerFn(applyChallenge);
  const keepVersion = useServerFn(keepMyVersion);

  const apply = (next: DirectorState) => {
    setState(next);
    setAnswer("");
    setError(next.notice ?? null);
    setEditing(false);
    setReview(null);
    setChallenge(null);
    setWhatIfs(false);
    challenged.current = null;
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
    mutationFn: () => finish({ data: { director_session_id: state!.id, session_id: sessionId } }),
    onSuccess: apply,
    onError: fail,
  });

  const reopenMutation = useMutation({
    mutationFn: () => reopen({ data: { director_session_id: state!.id, session_id: sessionId } }),
    onSuccess: apply,
    onError: fail,
  });

  /** Change propagation: an edited blueprint may pull other parts of the film with it. */
  const reviewMutation = useMutation({
    mutationFn: () =>
      propagate({
        data: {
          director_session_id: state!.id,
          session_id: sessionId,
          blueprint: blueprint.trim(),
        },
      }),
    onSuccess: (result) => {
      setReview(result);
      if (result.notice) setError(result.notice);
    },
    onError: fail,
  });

  /**
   * The stress test: the director challenges its own finished bible before the
   * creator approves it, so a weak concept is caught before credits are spent.
   */
  const challengeMutation = useMutation({
    mutationFn: () =>
      stressTest({ data: { director_session_id: state!.id, session_id: sessionId } }),
    onSuccess: (result) => {
      setChallenge(result);
      if (result.notice) setError(result.notice);
    },
    onError: fail,
  });

  /** The director's own fix becomes the blueprint, then it re-checks the result. */
  const acceptMutation = useMutation({
    mutationFn: () =>
      acceptFix({ data: { director_session_id: state!.id, session_id: sessionId } }),
    onSuccess: (result) => {
      setBlueprint(result.blueprint);
      setState((current) => (current ? { ...current, blueprint: result.blueprint } : current));
      setChallenge((current) =>
        current ? { ...current, verdict: "ready", weakness: null, recommendation: "" } : current,
      );
      setReview(null);
    },
    onError: fail,
  });

  /**
   * The creator's execution wins and the session remembers it, so the reality
   * check stops arguing for a simpler version it has already lost.
   */
  const keepMutation = useMutation({
    mutationFn: () =>
      keepVersion({ data: { director_session_id: state!.id, session_id: sessionId } }),
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

  useEffect(() => {
    if (!state || state.status !== "ready" || challenged.current === state.id) return;
    challenged.current = state.id;
    challengeMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status, state?.id]);

  const thinking =
    startMutation.isPending ||
    answerMutation.isPending ||
    finishMutation.isPending ||
    reopenMutation.isPending ||
    reviewMutation.isPending;

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
          <div className="relative rounded-2xl border border-primary/40 bg-primary/5 p-4 pr-12">
            <p role="alert" className="text-sm text-foreground">
              {error}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setError(null)}
              aria-label="Dismiss warning"
              className="absolute right-2 top-2 size-8"
            >
              <X className="size-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setError(null);
                if (challenge?.notice) {
                  challenged.current = null;
                  challengeMutation.mutate();
                  return;
                }
                if (state) finishMutation.mutate();
                else startMutation.mutate();
              }}
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
            <p className="mt-2 text-sm leading-relaxed text-foreground">{state.conflict.message}</p>
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

            {state.evolution && (
              <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-primary">
                  Creative evolution
                </p>
                <p className="mt-3 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
                  Your original idea
                </p>
                <p className="mt-1 text-sm italic leading-relaxed text-muted-foreground">
                  {state.evolution.original_idea}
                </p>

                {state.evolution.discoveries.length > 0 && (
                  <>
                    <p className="mt-4 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
                      What we discovered
                    </p>
                    <ul className="mt-1 space-y-1 text-sm text-foreground">
                      {state.evolution.discoveries.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                )}

                {state.evolution.how_it_evolved && (
                  <>
                    <p className="mt-4 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
                      How the story evolved
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-foreground">
                      {state.evolution.how_it_evolved}
                    </p>
                  </>
                )}

                {state.evolution.biggest_discovery && (
                  <>
                    <p className="mt-4 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
                      The biggest discovery
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-foreground">
                      {state.evolution.biggest_discovery}
                    </p>
                  </>
                )}

                {state.evolution.breakthrough && (
                  <>
                    <p className="mt-4 text-[10px] uppercase tracking-[0.15em] text-primary">
                      The creative breakthrough
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-foreground">
                      {state.evolution.breakthrough}
                    </p>
                  </>
                )}
              </div>
            )}

            {state.recommendation && (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-primary">
                  Director's recommendation
                </p>
                <p className="mt-2 text-sm leading-relaxed text-foreground">
                  {state.recommendation.rationale}
                </p>
                <dl className="mt-4 space-y-2 text-sm">
                  {[
                    ["Logline", state.recommendation.logline],
                    ["Direction", state.recommendation.story_direction],
                    ["Character", state.recommendation.main_character],
                    ["Conflict", state.recommendation.central_conflict],
                    ["Journey", state.recommendation.emotional_journey],
                    ["Visuals", state.recommendation.visual_direction],
                    ["Ending", state.recommendation.ending],
                  ]
                    .filter(([, value]) => value)
                    .map(([label, value]) => (
                      <div key={label} className="flex gap-3">
                        <dt className="w-20 shrink-0 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
                          {label}
                        </dt>
                        <dd className="text-foreground">{value}</dd>
                      </div>
                    ))}
                </dl>
              </div>
            )}

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
                {state.film_bible.twist && (
                  <div className="mt-4 rounded-2xl border border-primary/40 bg-primary/5 p-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-primary">
                      The turn I found in your story
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-foreground">
                      {state.film_bible.twist.statement}
                    </p>
                    {state.film_bible.twist.visual_clue && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        The audience sees it here: {state.film_bible.twist.visual_clue}
                      </p>
                    )}
                    {state.film_bible.twist.foreshadowing.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {state.film_bible.twist.foreshadowing.map((clue) => (
                          <li key={clue} className="text-xs leading-relaxed text-muted-foreground">
                            {clue}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {(state.film_bible.decisions.length > 0 ||
                  state.film_bible.assumptions.length > 0 ||
                  state.film_bible.discoveries.length > 0 ||
                  state.film_bible.recommendations.length > 0) && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {[
                      ["Your decisions", state.film_bible.decisions],
                      ["What I discovered", state.film_bible.discoveries],
                      ["My recommendations", state.film_bible.recommendations],
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

            {editing && (
              <div>
                <p className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
                  <Sparkles className="size-3 text-primary" /> Creative blueprint — this is what
                  gets filmed
                </p>
                <Textarea
                  value={blueprint}
                  onChange={(event) => {
                    setBlueprint(event.target.value.slice(0, 500));
                    setReview(null);
                  }}
                  rows={5}
                  className="min-h-[140px] resize-none rounded-2xl border-border/70 bg-background/40 p-4 text-base leading-relaxed focus-visible:border-primary/50"
                />
                {blueprint.trim() !== (state.blueprint ?? "") && !review && (
                  <button
                    type="button"
                    onClick={() => reviewMutation.mutate()}
                    className="mt-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    What does my change affect?
                  </button>
                )}
              </div>
            )}

            {review && (
              <div className="rounded-2xl border border-primary/40 bg-background/40 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-primary">
                  These elements may need updating
                </p>
                <p className="mt-2 text-sm leading-relaxed text-foreground">{review.message}</p>
                {review.affected.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {review.affected.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-border/70 bg-background/50 px-3 py-1 text-xs text-muted-foreground"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setBlueprint(review.updated_blueprint);
                      setReview(null);
                    }}
                    className="h-11 flex-1 rounded-xl text-[10px] uppercase tracking-[0.2em]"
                  >
                    Update all
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setReview(null)}
                    className="h-11 flex-1 rounded-xl text-[10px] uppercase tracking-[0.2em]"
                  >
                    Keep my version
                  </Button>
                </div>
              </div>
            )}

            {challengeMutation.isPending && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground"
              >
                <Loader2 className="size-4 animate-spin text-primary" />
                Challenging the story before we spend anything...
              </div>
            )}

            {challenge && (
              <div
                className={`rounded-2xl border p-4 ${
                  challenge.verdict === "ready"
                    ? "border-border/60 bg-background/40"
                    : "border-primary/40 bg-primary/5"
                }`}
              >
                <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-primary">
                  <ShieldCheck className="size-3" /> {VERDICT_LABELS[challenge.verdict]}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-foreground">{challenge.headline}</p>

                {challenge.weakness && (
                  <div className="mt-4">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
                      The weakness I'd challenge
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-foreground">
                      {challenge.weakness.problem}
                    </p>
                    {challenge.weakness.why_it_matters && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Why it matters: {challenge.weakness.why_it_matters}
                      </p>
                    )}
                    {challenge.weakness.solution && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        My fix: {challenge.weakness.solution}
                      </p>
                    )}
                  </div>
                )}

                {challenge.opportunity && (
                  <div className="mt-4">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
                      The one change that would make it stronger
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-foreground">
                      {challenge.opportunity.proposed_improvement}
                    </p>
                    {challenge.opportunity.why && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {challenge.opportunity.why}
                      </p>
                    )}
                  </div>
                )}

                {challenge.generation_risk && (
                  <div className="mt-4">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-primary">
                      Filming risk
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-foreground">
                      {challenge.generation_risk.problem}
                    </p>
                    {challenge.generation_risk.fix && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {challenge.generation_risk.fix}
                      </p>
                    )}
                  </div>
                )}

                {challenge.reality?.five_second_risk && (
                  <div className="mt-4">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-primary">
                      Five-second clarity risk
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-foreground">
                      {challenge.reality.five_second_risk.problem}
                    </p>
                    {challenge.reality.five_second_risk.alternative && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        A stronger way to keep it: {challenge.reality.five_second_risk.alternative}
                      </p>
                    )}
                    {challenge.reality.execution?.emotional_core && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        What must survive: {challenge.reality.execution.emotional_core}
                      </p>
                    )}
                  </div>
                )}

                {challenge.reality?.change && (
                  <div className="mt-4 space-y-1">
                    {challenge.reality.keep && (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        <span className="uppercase tracking-[0.15em] text-muted-foreground/70">
                          Keep
                        </span>{" "}
                        {challenge.reality.keep}
                      </p>
                    )}
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      <span className="uppercase tracking-[0.15em] text-muted-foreground/70">
                        Change
                      </span>{" "}
                      {challenge.reality.change}
                    </p>
                    {challenge.reality.why && (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        <span className="uppercase tracking-[0.15em] text-muted-foreground/70">
                          Why
                        </span>{" "}
                        {challenge.reality.why}
                      </p>
                    )}
                  </div>
                )}

                {(challenge.reality?.shot_split.length ?? 0) > 1 && (
                  <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                    Or keep it all and shoot it as separate beats:{" "}
                    {challenge.reality!.shot_split.join(" · ")}
                  </p>
                )}

                {challenge.predictability === "high" && challenge.predictability_note && (
                  <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                    I can see where this is going: {challenge.predictability_note}
                  </p>
                )}

                {challenge.verdict !== "ready" && challenge.recommendation && (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="outline"
                      onClick={() => acceptMutation.mutate()}
                      disabled={acceptMutation.isPending}
                      className="h-11 flex-1 rounded-xl text-[10px] uppercase tracking-[0.2em]"
                    >
                      {acceptMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : challenge.verdict === "revision" ? (
                        "Fix with AI"
                      ) : (
                        "Accept recommendation"
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        keepMutation.mutate();
                        setChallenge({ ...challenge, verdict: "ready", recommendation: "" });
                      }}
                      className="h-11 flex-1 rounded-xl text-[10px] uppercase tracking-[0.2em]"
                    >
                      Keep my version
                    </Button>
                  </div>
                )}

                {challenge.what_ifs.length > 0 && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => setWhatIfs((value) => !value)}
                      className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {whatIfs ? "Hide other directions" : "Show other directions I considered"}
                    </button>
                    {whatIfs && (
                      <ul className="mt-2 space-y-2 text-sm text-foreground">
                        {challenge.what_ifs.map((item) => (
                          <li key={item.text}>
                            {item.text}
                            <span className="ml-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
                              value {item.creative_value} · risk {item.risk}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

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
                    Make this film
                    <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => setEditing((value) => !value)}
                  className="h-12 flex-1 rounded-2xl text-[10px] uppercase tracking-[0.2em]"
                >
                  {editing ? "Hide blueprint" : "Edit blueprint"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => reopenMutation.mutate()}
                  className="h-12 flex-1 rounded-2xl text-[10px] uppercase tracking-[0.2em]"
                >
                  Go back to director
                </Button>
              </div>
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
