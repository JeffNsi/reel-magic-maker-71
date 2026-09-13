import { useState } from "react";
import { Play } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Reveal } from "./reveal";

type Example = {
  id: string;
  title: string;
  style: string;
  prompt: string;
  tint: string;
};

const EXAMPLES: Example[] = [
  {
    id: "ex-1",
    title: "Last Train Home",
    style: "Cinematic",
    prompt:
      "A woman in a red coat runs through a rain-soaked station as the last train pulls away, neon reflections on wet stone.",
    tint: "from-rose-500/20",
  },
  {
    id: "ex-2",
    title: "Rooftop Oath",
    style: "Anime",
    prompt:
      "A teenage hero stands on a rooftop at dusk, wind pulling at their scarf, city lights waking below.",
    tint: "from-violet-500/20",
  },
  {
    id: "ex-3",
    title: "The Third Envelope",
    style: "Noir",
    prompt:
      "A detective opens a locked drawer in a dark office, blinds cutting hard shadows across his face, smoke drifting.",
    tint: "from-neutral-500/20",
  },
  {
    id: "ex-4",
    title: "Harbour, 04:50",
    style: "Documentary",
    prompt:
      "A fisherman hauls rope onto a small boat as dawn breaks over a quiet northern harbour, handheld camera.",
    tint: "from-amber-500/20",
  },
  {
    id: "ex-5",
    title: "Desert Radio",
    style: "Retro Film",
    prompt:
      "A vintage car crosses an empty desert highway in golden light, grain and light leaks across the frame.",
    tint: "from-orange-500/20",
  },
  {
    id: "ex-6",
    title: "Red Planet Visor",
    style: "Hyperreal",
    prompt:
      "Extreme close-up of an astronaut's visor reflecting a red desert planet, dust catching the light.",
    tint: "from-red-500/20",
  },
];

/** "Made with Jeje Inc Vibe" — six example shorts below the generator. */
export function Gallery() {
  const [open, setOpen] = useState<Example | null>(null);

  return (
    <section id="gallery" className="mt-24 scroll-mt-24">
      <Reveal>
        <h2 className="font-display text-3xl italic text-foreground sm:text-4xl">
          Made with <span className="text-primary">Jeje Inc Vibe</span>
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Real shorts created from a single prompt.
        </p>
      </Reveal>

      <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {EXAMPLES.map((example, i) => (
          <Reveal as="li" key={example.id} delay={i * 60}>
            <button
              type="button"
              onClick={() => setOpen(example)}
              aria-label={`Open ${example.title} — ${example.style}`}
              className="group w-full overflow-hidden rounded-2xl border border-border bg-card text-left transition-all duration-300 hover:scale-[1.02] hover:border-primary/50 hover:shadow-[0_0_24px_var(--glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <div className="relative aspect-[9/16] w-full overflow-hidden bg-gradient-to-br from-background to-card">
                <div
                  className={`absolute inset-0 bg-gradient-to-t ${example.tint} to-transparent opacity-60`}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="flex size-14 items-center justify-center rounded-full border border-primary/40 bg-background/60 text-primary backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
                    <Play className="size-5" fill="currentColor" aria-hidden />
                  </span>
                </div>
                <span className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent" />
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary">
                    {example.style}
                  </span>
                </div>
                <h3 className="mt-2 text-base font-medium text-foreground">
                  {example.title}
                </h3>
              </div>
            </button>
          </Reveal>
        ))}
      </ul>

      <Dialog open={!!open} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="max-w-sm border-border bg-card">
          {open && (
            <>
              <DialogTitle className="font-display text-2xl italic text-foreground">
                {open.title}
              </DialogTitle>
              <DialogDescription className="text-xs uppercase tracking-widest text-primary">
                {open.style}
              </DialogDescription>

              <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-gradient-to-br from-background to-card">
                <div
                  className={`absolute inset-0 bg-gradient-to-t ${open.tint} to-transparent opacity-60`}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <span className="flex size-16 items-center justify-center rounded-full border border-primary/40 bg-background/60 text-primary backdrop-blur-sm">
                    <Play className="size-6" fill="currentColor" aria-hidden />
                  </span>
                  <span className="rounded-full bg-background/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-foreground backdrop-blur-sm">
                    Video placeholder
                  </span>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Original prompt
                </p>
                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <p className="font-mono text-sm leading-relaxed text-foreground/90">
                    {open.prompt}
                  </p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
