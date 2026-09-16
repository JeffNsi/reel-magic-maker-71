import { CircleDot, Compass, Film, Lock, Shield, Sparkles } from "lucide-react";

import { COIN_COST } from "@/lib/storyreel.functions";
import { CLIP_PRICE_SEK } from "@/lib/clip-shop.functions";
import { Reveal } from "./reveal";

/**
 * Landing-page storytelling for the AI Director. Copy only — nothing here
 * touches the director engine, generation, credits or payments.
 */

const DIRECTOR_ABILITIES = [
  "Understands your idea",
  "Finds what matters",
  "Asks one useful question at a time",
  "Discovers cinematic possibilities",
  "Tests the scene",
  "Builds your Film Bible",
  "Directs the generation",
];

/** Sits directly above the idea box so the visitor knows what happens next. */
export function DirectorPrimer() {
  return (
    <section className="mt-10 rounded-3xl border border-border/70 bg-card/50 p-5 backdrop-blur-xl sm:p-6">
      <h2 className="font-display text-xl italic text-foreground sm:text-2xl">
        Your idea doesn&apos;t need to be finished.
      </h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        Start with a thought, a scene, a character, an emotion or a story. Your AI Director will
        help you discover what the idea could become.
      </p>

      <p className="mt-5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-primary">
        <Sparkles className="size-3.5" aria-hidden /> AI Director
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {DIRECTOR_ABILITIES.map((item) => (
          <li
            key={item}
            className="rounded-full border border-border/70 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground"
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Terms shown before any creative work begins — no late surprises. */
export function BeforeYouStart({ signedIn }: { signedIn: boolean }) {
  const rows = [
    {
      label: "Director",
      body: "Talking with the Director is free. Creative development happens before anything is generated.",
    },
    {
      label: "Generation",
      body: `Your film is generated only after you approve the direction. One film costs ${COIN_COST} credits.`,
    },
    {
      label: "Account",
      body: signedIn
        ? "You are signed in, so your films and sessions are saved to your account."
        : "You can explore the Director without an account. Signing in is needed to save and generate your film.",
    },
    {
      label: "Clips",
      body: `A finished clip can be bought for ${CLIP_PRICE_SEK} kr and plays and downloads as soon as the payment is confirmed.`,
    },
  ];

  return (
    <section className="mt-6 rounded-3xl border border-border/70 bg-background/40 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
        <Shield className="size-3.5 text-primary" aria-hidden /> Before you start
      </h2>
      <dl className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="border-b border-border/50 pb-3 last:border-0 last:pb-0">
            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
              {row.label}
            </dt>
            <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{row.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const CONCEPTS = [
  {
    icon: Compass,
    title: "Discover",
    body: "Your idea may contain something you haven't articulated yet.",
  },
  {
    icon: Sparkles,
    title: "Direct",
    body: "The Director turns those discoveries into cinematic choices.",
  },
  {
    icon: Film,
    title: "Generate",
    body: "Only after the direction is approved does the film move toward generation.",
  },
];

export function NotPromptToVideo() {
  return (
    <section id="director" className="mt-24 scroll-mt-24">
      <Reveal>
        <h2 className="font-display text-3xl italic text-foreground sm:text-4xl">
          This isn&apos;t just prompt-to-video.
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Most AI video tools start by asking what you want to generate. Reel Magic Maker starts one
          step earlier — it helps you discover what the film should actually be.
        </p>
      </Reveal>
      <ul className="mt-8 grid gap-3 sm:grid-cols-3">
        {CONCEPTS.map((concept, i) => (
          <Reveal as="li" key={concept.title} delay={i * 80}>
            <div className="surface-cinema h-full rounded-2xl border border-border/60 p-6">
              <span className="flex size-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                <concept.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
                {concept.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{concept.body}</p>
            </div>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

const INTELLIGENCE = [
  {
    title: "Emotional Core",
    body: "What your story is really about is written down and protected from every later change.",
  },
  {
    title: "What Must Survive",
    body: "The moments you decided on cannot be quietly dropped on the way to the film.",
  },
  {
    title: "Cinematic Candidate Search",
    body: "The Director looks for a stronger, more filmable way to stage the same feeling.",
  },
  {
    title: "Reality Check",
    body: "Each scene is tested for clarity and complexity before a single frame is made.",
  },
  {
    title: "Film Bible",
    body: "Cast, setting, mood, look, twist and ending, held in one place as the source of truth.",
  },
  {
    title: "Scene Truth",
    body: "Every approved detail travels with the scene into generation, unchanged.",
  },
  {
    title: "Generation Recovery",
    body: "If a shot can't be made, the Director finds another way to film it — the meaning stays.",
  },
];

export function CreativeIntelligence() {
  return (
    <section className="mt-24">
      <Reveal>
        <h2 className="font-display text-3xl italic text-foreground sm:text-4xl">
          Your idea can evolve without losing its meaning.
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
          The Director can challenge weak execution, find stronger visual solutions, explore twists
          and metaphors, and adapt difficult scenes — while protecting the emotional core of your
          idea.
        </p>
      </Reveal>
      <ul className="mt-8 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {INTELLIGENCE.map((item, i) => (
          <Reveal as="li" key={item.title} delay={i * 60}>
            <div className="flex gap-3 border-b border-border/50 pb-4">
              <CircleDot className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden />
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
                  {item.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

export const DIRECTOR_STEPS = [
  {
    number: "01",
    title: "Understand",
    body: "The Director reads your idea and identifies what matters.",
  },
  {
    number: "02",
    title: "Ask",
    body: "It asks one high-value question instead of overwhelming you with a questionnaire.",
  },
  {
    number: "03",
    title: "Discover",
    body: "Your answer can reveal a stronger story direction, image, emotion, conflict or possibility.",
  },
  {
    number: "04",
    title: "Direct",
    body: "The Director turns the discovery into concrete cinematic choices.",
  },
  {
    number: "05",
    title: "Test",
    body: "The scene is checked for emotional clarity, complexity and five-second readability.",
  },
  {
    number: "06",
    title: "Lock",
    body: "Your approved direction becomes the Film Bible and Scene Truth.",
  },
  { number: "07", title: "Make", body: "The approved scene is sent to generation." },
];

export function DirectorSequence() {
  return (
    <section id="how" className="mt-24 scroll-mt-24">
      <Reveal>
        <h2 className="font-display text-3xl italic text-foreground sm:text-4xl">
          What the Director actually does
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Seven steps from a first thought to an approved film.
        </p>
      </Reveal>
      <ol className="mt-8 space-y-3">
        {DIRECTOR_STEPS.map((step, i) => (
          <Reveal as="li" key={step.number} delay={i * 60}>
            <div className="flex items-baseline gap-4 border-b border-border/60 pb-4">
              <span className="font-display text-lg italic text-primary">{step.number}</span>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground">
                  {step.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

export function StayInControl() {
  return (
    <section className="mt-24">
      <Reveal>
        <div className="surface-cinema rounded-3xl border border-border/60 p-7 sm:p-10">
          <span className="flex size-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            <Lock className="size-5" aria-hidden />
          </span>
          <h2 className="mt-6 font-display text-3xl italic text-foreground sm:text-4xl">
            The Director directs. You decide.
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
            The AI can recommend. It can challenge. It can discover. But your decisions remain
            yours — accept the direction, edit it, go back, or keep your original version.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
