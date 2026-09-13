import { useState } from "react";
import { Play } from "lucide-react";

import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { STYLE_THUMBS } from "./style-picker";
import { Reveal } from "./reveal";

type Example = {
  id: string;
  title: string;
  style: string;
  styleKey: string;
  prompt: string;
  video: string;
};

const EXAMPLES: Example[] = [
  {
    id: "ex-1",
    title: "Last Train Home",
    style: "Cinematic",
    styleKey: "cinematic",
    prompt:
      "A woman in a red coat runs through a rain-soaked station as the last train pulls away, neon reflections on wet stone.",
    video: "/dramawave/videos/revenge-ep1.mp4",
  },
  {
    id: "ex-2",
    title: "Rooftop Oath",
    style: "Anime",
    styleKey: "anime",
    prompt:
      "A teenage hero stands on a rooftop at dusk, wind pulling at their scarf, city lights waking below.",
    video: "/dramawave/videos/revenge-ep2.mp4",
  },
  {
    id: "ex-3",
    title: "The Third Envelope",
    style: "Noir",
    styleKey: "noir",
    prompt:
      "A detective opens a locked drawer in a dark office, blinds cutting hard shadows across his face, smoke drifting.",
    video: "/dramawave/videos/revenge-ep3.mp4",
  },
  {
    id: "ex-4",
    title: "Harbour, 04:50",
    style: "Documentary",
    styleKey: "documentary",
    prompt:
      "A fisherman hauls rope onto a small boat as dawn breaks over a quiet northern harbour, handheld camera.",
    video: "/dramawave/videos/ceo-ep1.mp4",
  },
  {
    id: "ex-5",
    title: "Desert Radio",
    style: "Retro Film",
    styleKey: "retro",
    prompt:
      "A vintage car crosses an empty desert highway in golden light, grain and light leaks across the frame.",
    video: "/dramawave/videos/ceo-ep2.mp4",
  },
  {
    id: "ex-6",
    title: "Red Planet Visor",
    style: "Hyperreal",
    styleKey: "hyperreal",
    prompt:
      "Extreme close-up of an astronaut's visor reflecting a red desert planet, dust catching the light.",
    video: "/dramawave/videos/ceo-ep3.mp4",
  },
];

/** "Made with STORYREEL" — six sample shorts, each opening in a modal with its prompt. */
export function Gallery() {
  const [open, setOpen] = useState<Example | null>(null);

  return (
    <section id="gallery" className="mt-24 scroll-mt-24">
      <Reveal>
        <h2 className="font-display text-3xl italic text-foreground sm:text-4xl">
          Made with <span className="text-primary">STORYREEL</span>
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Six shorts, six styles. Open one to read the exact prompt behind it.
        </p>
      </Reveal>

      <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {EXAMPLES.map((example, i) => (
          <Reveal as="li" key={example.id} delay={i * 60}>
            <button
              type="button"
              onClick={() => setOpen(example)}
              aria-label={`Play ${example.title} — ${example.style} example`}
              className="group relative w-full overflow-hidden rounded-2xl border border-border text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <img
                src={STYLE_THUMBS[example.styleKey]}
                alt=""
                loading="lazy"
                width={512}
                height={896}
                className="aspect-[9/16] w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
              <span className="absolute left-3 top-3 rounded-full border border-primary/40 bg-background/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary backdrop-blur">
                {example.style}
              </span>
              <span className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{example.title}</span>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/90 text-primary-foreground transition-transform group-hover:scale-110">
                  <Play className="size-3.5" aria-hidden />
                </span>
              </span>
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
              <video
                key={open.id}
                src={open.video}
                poster={STYLE_THUMBS[open.styleKey]}
                controls
                playsInline
                autoPlay
                className="aspect-[9/16] w-full rounded-xl bg-black"
              />
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Prompt used
              </p>
              <p className="text-sm leading-relaxed text-foreground/90">{open.prompt}</p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
