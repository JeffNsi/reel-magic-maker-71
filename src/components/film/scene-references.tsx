import type { SceneReferencePlan } from "@/lib/canon.functions";

/**
 * What the creator sees BEFORE pressing generate: the exact reference images a
 * scene would be built from, why each was chosen, and whether the identity lock
 * can actually be enforced by the engine. This is also the honest answer to
 * "why did scene 7 look wrong".
 */
export function SceneReferences({ plan }: { plan: SceneReferencePlan | undefined }) {
  if (!plan) return null;

  const enforced = plan.mode === "image-conditioned" && plan.provider_conditions_on_images;
  const badge = enforced
    ? "Image-conditioned continuity"
    : plan.mode === "image-conditioned"
      ? "Text-only continuity — this engine cannot read reference images"
      : "Text-only continuity — no reference pack for this scene";

  return (
    <div className="mt-4 rounded-xl border border-border/60 bg-background/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          References — {plan.shot_type}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] ${
            enforced
              ? "border-emerald-500/40 text-emerald-400"
              : "border-border/70 text-muted-foreground"
          }`}
        >
          {badge}
        </span>
      </div>

      {plan.selections.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          No canonical reference images exist for this scene yet. Generate a reference pack in the
          Continuity Center to lock identity.
        </p>
      )}

      <ul className="mt-3 space-y-3">
        {plan.selections.map((selection) => (
          <li key={selection.label}>
            <p className="text-xs font-semibold text-foreground">{selection.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{selection.reason}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {selection.images.map((image) => (
                <div key={`${selection.label}-${image.kind}`} className="w-16">
                  <div className="aspect-square overflow-hidden rounded-md border border-border/70 bg-black">
                    {image.url ? (
                      <img
                        src={image.url}
                        alt={`${selection.label} ${image.kind}`}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-[10px] text-muted-foreground">{image.kind}</p>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {plan.previous_scene_status && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Carried over — {plan.previous_scene_status}
        </p>
      )}

      {plan.missing.length > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Missing from the reference pack: {plan.missing.join(", ")}.
        </p>
      )}
    </div>
  );
}
