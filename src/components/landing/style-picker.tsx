import { Check } from "lucide-react";

import { STYLES } from "@/lib/storyreel.functions";
import cinematicThumb from "@/assets/styles/cinematic.jpg";
import animeThumb from "@/assets/styles/anime.jpg";
import noirThumb from "@/assets/styles/noir.jpg";
import documentaryThumb from "@/assets/styles/documentary.jpg";
import retroThumb from "@/assets/styles/retro.jpg";
import hyperrealThumb from "@/assets/styles/hyperreal.jpg";

export const STYLE_THUMBS: Record<string, string> = {
  cinematic: cinematicThumb,
  anime: animeThumb,
  noir: noirThumb,
  documentary: documentaryThumb,
  retro: retroThumb,
  hyperreal: hyperrealThumb,
};

/** Visual style chooser with a still frame per look. */
export function StylePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Visual style
      </legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {STYLES.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`group relative overflow-hidden rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                selected
                  ? "border-primary shadow-[0_0_20px_var(--glow)]"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <img
                src={STYLE_THUMBS[option.value]}
                alt={`${option.label} style example frame`}
                loading="lazy"
                width={512}
                height={896}
                className="aspect-[9/16] w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-background via-background/80 to-transparent px-2 pb-1.5 pt-6 text-[11px] font-medium text-foreground">
                {option.label}
                {selected && <Check className="size-3 shrink-0 text-primary" aria-hidden />}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
