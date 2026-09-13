import { Check } from "lucide-react";

import { STYLES } from "@/lib/storyreel.functions";
import cinematicThumb from "@/assets/styles/cinematic.jpg";
import animeThumb from "@/assets/styles/anime.jpg";
import noirThumb from "@/assets/styles/noir.jpg";
import documentaryThumb from "@/assets/styles/documentary.jpg";
import retroThumb from "@/assets/styles/retro.jpg";
import hyperrealThumb from "@/assets/styles/hyperreal.jpg";
import realisticThumb from "@/assets/styles/realistic.jpg";
import claymationThumb from "@/assets/styles/claymation.jpg";

export const STYLE_THUMBS: Record<string, string> = {
  cinematic: cinematicThumb,
  anime: animeThumb,
  noir: noirThumb,
  documentary: documentaryThumb,
  retro: retroThumb,
  hyperreal: hyperrealThumb,
  realistic: realisticThumb,
  claymation: claymationThumb,
};

/** Visual style chooser with thumbnail and name; `only` narrows it to the V1 set. */
export function StylePicker({
  value,
  onChange,
  only,
}: {
  value: string;
  onChange: (value: string) => void;
  only?: string[] | undefined;
}) {
  const options = only ? STYLES.filter((s) => only.includes(s.value)) : STYLES;

  return (
    <fieldset>
      <legend className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
        Style
      </legend>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`group relative flex w-[150px] shrink-0 flex-col overflow-hidden rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-[170px] ${
                selected
                  ? "border-primary shadow-[0_0_20px_var(--glow)]"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-background">
                <img
                  src={STYLE_THUMBS[option.value]}
                  alt=""
                  loading="lazy"
                  width={320}
                  height={200}
                  className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
                {selected && (
                  <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                    <Check className="size-3" strokeWidth={3} aria-hidden />
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between bg-card p-3">
                <div>
                  <span className="block text-sm font-medium text-foreground">
                    {option.label}
                  </span>
                  <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                    {option.description}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
