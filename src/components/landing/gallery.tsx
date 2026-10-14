import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { STYLES, listShowcase } from "@/lib/storyreel.functions";
import { Button } from "@/components/ui/button";
import { STYLE_THUMBS } from "./style-picker";
import { showcaseLogline, showcaseTitle } from "./copy";
import { Reveal } from "./reveal";

type Example = {
  id: string;
  title: string;
  style: string;
  /** The raw idea, kept for the dialog's "Original prompt" panel. */
  prompt: string;
  /** One line about the film itself — shown under the title on the card. */
  logline: string;
  tint: string;
  video?: string;
};

const EXAMPLES: Example[] = [
  {
    id: "ex-1",
    title: "Last Train Home",
    style: "Cinematic",
    prompt:
      "A woman in a red coat runs through a rain-soaked station as the last train pulls away, neon reflections on wet stone.",
    logline: "She runs for the last train and the life she left behind.",
    tint: "from-rose-500/20",
  },
  {
    id: "ex-2",
    title: "Rooftop Oath",
    style: "Anime",
    prompt:
      "A teenage hero stands on a rooftop at dusk, wind pulling at their scarf, city lights waking below.",
    logline: "He takes the oath that will make the city afraid of him.",
    tint: "from-violet-500/20",
  },
  {
    id: "ex-3",
    title: "The Third Envelope",
    style: "Noir",
    prompt:
      "A detective opens a locked drawer in a dark office, blinds cutting hard shadows across his face, smoke drifting.",
    logline: "The case he closed years ago is waiting in his drawer.",
    tint: "from-neutral-500/20",
  },
  {
    id: "ex-4",
    title: "Harbour, 04:50",
    style: "Documentary",
    prompt:
      "A fisherman hauls rope onto a small boat as dawn breaks over a quiet northern harbour, handheld camera.",
    logline: "He fishes the same waters his father did, and says nothing.",
    tint: "from-amber-500/20",
  },
  {
    id: "ex-5",
    title: "Desert Radio",
    style: "Retro Film",
    prompt:
      "A vintage car crosses an empty desert highway in golden light, grain and light leaks across the frame.",
    logline: "She drives west with a radio that only plays one voice.",
    tint: "from-orange-500/20",
  },
  {
    id: "ex-6",
    title: "Red Planet Visor",
    style: "Hyperreal",
    prompt:
      "Extreme close-up of an astronaut's visor reflecting a red desert planet, dust catching the light.",
    logline: "The last human on Mars notices the dust moving on its own.",
    tint: "from-red-500/20",
  },
];

const TINTS = [
  "from-rose-500/20",
  "from-violet-500/20",
  "from-neutral-500/20",
  "from-amber-500/20",
  "from-orange-500/20",
  "from-red-500/20",
];

function styleLabel(value: string) {
  return STYLES.find((s) => s.value === value)?.label ?? "Cinematic";
}

/** "Made with Shortizereel" — real finished shorts, topped up with example concepts. */
export function Gallery() {
  const [open, setOpen] = useState<Example | null>(null);
  const fetchShowcase = useServerFn(listShowcase);

  const { data: real } = useQuery({
    queryKey: ["showcase"],
    queryFn: () => fetchShowcase(),
    staleTime: 5 * 60 * 1000,
  });

  const realCards: Example[] = (real ?? []).map((short, i) => ({
    id: short.id,
    title: showcaseTitle(short.idea, styleLabel(short.style), i),
    style: styleLabel(short.style),
    prompt: short.idea,
    logline: showcaseLogline(short.idea, styleLabel(short.style), i),
    tint: TINTS[i % TINTS.length] as string,
    video: short.video_url,
  }));

  const cards = [...realCards, ...EXAMPLES].slice(0, 6);

  return (
    <section id="gallery" className="mt-24 scroll-mt-24">
      <Reveal>
        <h2 className="font-display text-3xl italic text-foreground sm:text-4xl">
          Made with <span className="text-primary">Shortizereel</span>
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Real shorts, developed with the Director.
        </p>
      </Reveal>

      <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((example, i) => (
          <Reveal as="li" key={example.id} delay={i * 60}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setOpen(example)}
              aria-label={`Open ${example.title} — ${example.style}`}
              className="group block h-auto w-full whitespace-normal p-0 overflow-hidden rounded-lg border border-border bg-card text-left transition-all duration-300 hover:scale-[1.02] hover:border-primary/50 hover:shadow-[0_0_24px_var(--glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <div className="relative aspect-[9/16] w-full overflow-hidden bg-gradient-to-br from-background to-card">
                {example.video ? (
                  <video
                    src={example.video}
                    className="absolute inset-0 size-full object-cover"
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
                    onMouseLeave={(e) => e.currentTarget.pause()}
                  />
                ) : (
                  <img
                    src={
                      STYLE_THUMBS[
                        STYLES.find((style) => style.label === example.style)?.value ?? "cinematic"
                      ]
                    }
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 size-full object-cover"
                  />
                )}
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
                  {example.video && (
                    <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Finished clip
                    </span>
                  )}
                </div>
                <h3 className="mt-2 break-words text-base font-medium text-foreground">
                  {example.title}
                </h3>
                <p className="mt-2 break-words text-sm font-normal leading-relaxed text-muted-foreground">
                  {example.logline}
                </p>
              </div>
            </Button>
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
                {open.video ? (
                  <video
                    src={open.video}
                    className="absolute inset-0 size-full object-cover"
                    controls
                    autoPlay
                    playsInline
                  />
                ) : (
                  <>
                    <div
                      className={`absolute inset-0 bg-gradient-to-t ${open.tint} to-transparent opacity-60`}
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <span className="flex size-16 items-center justify-center rounded-full border border-primary/40 bg-background/60 text-primary backdrop-blur-sm">
                        <Play className="size-6" fill="currentColor" aria-hidden />
                      </span>
                      <span className="rounded-full bg-background/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-foreground backdrop-blur-sm">
                        Example concept
                      </span>
                    </div>
                  </>
                )}
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
