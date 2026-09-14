/**
 * Plot Twist Intelligence Library — data layer.
 *
 * The library is a creative resource for the existing Creative Director, never
 * an authority over the creator: patterns are searched internally, ranked
 * against the current story model, and only a shortlist ever reaches the
 * director's reasoning. A twist is never mandatory, and "no twist" is a valid
 * result.
 *
 * Patterns are written as compact tuples so families stay readable and new
 * families can be added without touching the director.
 */

export type TwistFamily =
  | "identity"
  | "reality"
  | "time"
  | "relationship"
  | "mystery"
  | "perception"
  | "emotional"
  | "object"
  | "location"
  | "structure";

export type TwistPattern = {
  id: string;
  name: string;
  family: TwistFamily;
  subfamily: string;
  description: string;
  mechanism: string;
  emotional_effect: string;
  genres: string[];
  character_relationships: string[];
  /** Search tags — the cheap pre-filter before any ranking happens. */
  tags: string[];
  /** 0-10 scales. */
  visual_potential: number;
  foreshadowing_potential: number;
  complexity: number;
  cliche_risk: number;
  originality: number;
  generation_feasibility: number;
};

/**
 * Tuple order:
 * id, name, subfamily, mechanism, emotional_effect, genres, relationships,
 * tags, visual, foreshadowing, complexity, cliche_risk, feasibility.
 */
export type RawTwist = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  number,
  number,
  number,
  number,
  number,
];

const split = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

/** Originality is the inverse of cliché risk: a familiar shape needs adapting. */
export function buildFamily(family: TwistFamily, rows: RawTwist[]): TwistPattern[] {
  return rows.map(
    ([
      id,
      name,
      subfamily,
      mechanism,
      emotional_effect,
      genres,
      relationships,
      tags,
      visual_potential,
      foreshadowing_potential,
      complexity,
      cliche_risk,
      generation_feasibility,
    ]) => ({
      id: `${family}.${id}`,
      name,
      family,
      subfamily,
      description: `${name}: ${mechanism}`,
      mechanism,
      emotional_effect,
      genres: split(genres),
      character_relationships: split(relationships),
      tags: split(tags),
      visual_potential,
      foreshadowing_potential,
      complexity,
      cliche_risk,
      originality: 10 - cliche_risk,
      generation_feasibility,
    }),
  );
}
