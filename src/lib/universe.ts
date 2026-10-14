/**
 * ROLLING UNIVERSE — pure, deterministic. No AI, no DB, no credits, no input mutation.
 *
 * A creator's universe lives on between films. After a film, its end state is
 * merged in: LOCKED traits (name, face, hair, skin, body, height, build,
 * reference images) are never overwritten — an empty locked field may be filled
 * once, a different value is reported as a conflict. MUTABLE traits (wardrobe,
 * injuries, relationships, location, knowledge, status, place condition) move on.
 * A film that contradicts the universe (a dead character returns) produces a
 * conflict; the caller must ask the creator instead of applying silently.
 */

export const LOCKED_CHARACTER_FIELDS = [
  "name",
  "face",
  "hair",
  "skin",
  "body",
  "height",
  "build",
] as const;
export type LockedCharacterField = (typeof LOCKED_CHARACTER_FIELDS)[number];

export const LOCKED_LOCATION_FIELDS = ["name", "architecture", "layout", "materials"] as const;
export type LockedLocationField = (typeof LOCKED_LOCATION_FIELDS)[number];

export type CharacterStatus = "alive" | "dead" | "missing" | "unknown";

export type UniverseCharacter = {
  canonical_id: string;
  locked: Record<LockedCharacterField, string>;
  reference_assets: string[];
  mutable: {
    status: CharacterStatus;
    wardrobe: string;
    location: string;
    injuries: string[];
    relationships: string[];
    knowledge: string[];
  };
  first_film_id: string | null;
  last_film_id: string | null;
};

export type UniverseLocation = {
  canonical_id: string;
  locked: Record<LockedLocationField, string>;
  reference_assets: string[];
  mutable: { condition: string; notes: string[] };
  first_film_id: string | null;
  last_film_id: string | null;
};

export type UniverseEvent = {
  film_id: string;
  film_title: string;
  scene_number: number | null;
  description: string;
};

export type UniverseSnapshot = {
  characters: UniverseCharacter[];
  locations: UniverseLocation[];
  style: { name: string; reference_assets: string[] };
  timeline: UniverseEvent[];
};

/** What one film ended with — the input to an update. */
export type FilmOutcome = {
  film_id: string;
  film_title: string;
  style?: { name: string; reference_assets: string[] } | undefined;
  characters: {
    canonical_id: string;
    locked: Partial<Record<LockedCharacterField, string>>;
    reference_assets?: string[] | undefined;
    end: Partial<UniverseCharacter["mutable"]>;
  }[];
  locations: {
    canonical_id: string;
    locked: Partial<Record<LockedLocationField, string>>;
    reference_assets?: string[] | undefined;
    end: Partial<UniverseLocation["mutable"]>;
  }[];
  events: { scene_number: number | null; description: string }[];
};

export type UniverseConflict = {
  kind: "dead_returns" | "locked_mismatch";
  subject_type: "character" | "location";
  canonical_id: string;
  name: string;
  field: string | null;
  universe_value: string;
  film_value: string;
};

export function emptyUniverse(): UniverseSnapshot {
  return { characters: [], locations: [], style: { name: "", reference_assets: [] }, timeline: [] };
}

/** Same rule as canon identity: trim + whitespace collapse + lowercase only. */
export function identityKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const uniq = (list: string[]) => Array.from(new Set(list.map(clean).filter(Boolean)));

const DEATH = /\b(dies|died|dead|killed|is killed|murdered|passes away|passed away)\b/i;
const MISSING = /\b(vanishes|vanished|disappears|disappeared|missing)\b/i;

/** Reads a status from free-text physical state; never guesses beyond the words. */
export function statusFromText(text: string): CharacterStatus | null {
  if (DEATH.test(text)) return "dead";
  if (MISSING.test(text)) return "missing";
  return null;
}

function blankLocked<T extends string>(fields: readonly T[]): Record<T, string> {
  return Object.fromEntries(fields.map((f) => [f, ""])) as Record<T, string>;
}

/** Locked merge: fill empties, never overwrite, report differences. */
function mergeLocked<T extends string>(
  fields: readonly T[],
  current: Record<T, string>,
  incoming: Partial<Record<T, string>>,
  report: (field: T, had: string, got: string) => void,
): Record<T, string> {
  const next = { ...current };
  for (const field of fields) {
    const got = clean(incoming[field]);
    if (!got) continue;
    const had = clean(current[field]);
    if (!had) next[field] = got;
    else if (identityKey(had) !== identityKey(got)) report(field, had, got);
  }
  return next;
}

export type MergeResult = {
  next: UniverseSnapshot;
  conflicts: UniverseConflict[];
  changed: string[];
};

/**
 * Merge a film's end state into the universe. `allowReturns` lists character ids
 * the creator explicitly approved coming back; without it a dead character's
 * appearance is a conflict and its state is left untouched.
 */
export function mergeUniverse(
  prev: UniverseSnapshot | null,
  outcome: FilmOutcome,
  options: { allowReturns?: string[] } = {},
): MergeResult {
  const base = prev ?? emptyUniverse();
  const allow = new Set(options.allowReturns ?? []);
  const conflicts: UniverseConflict[] = [];
  const changed: string[] = [];

  const characters = base.characters.map((c) => ({
    ...c,
    locked: { ...c.locked },
    reference_assets: [...c.reference_assets],
    mutable: {
      ...c.mutable,
      injuries: [...c.mutable.injuries],
      relationships: [...c.mutable.relationships],
      knowledge: [...c.mutable.knowledge],
    },
  }));

  for (const incoming of outcome.characters) {
    const name = clean(incoming.locked.name);
    let index = characters.findIndex((c) => c.canonical_id === incoming.canonical_id);
    if (index < 0 && name) {
      index = characters.findIndex((c) => identityKey(c.locked.name) === identityKey(name));
    }

    if (index < 0) {
      const status = incoming.end.status ?? "alive";
      characters.push({
        canonical_id: incoming.canonical_id,
        locked: mergeLocked(LOCKED_CHARACTER_FIELDS, blankLocked(LOCKED_CHARACTER_FIELDS), incoming.locked, () => {}),
        reference_assets: uniq(incoming.reference_assets ?? []),
        mutable: {
          status,
          wardrobe: clean(incoming.end.wardrobe),
          location: clean(incoming.end.location),
          injuries: uniq(incoming.end.injuries ?? []),
          relationships: uniq(incoming.end.relationships ?? []),
          knowledge: uniq(incoming.end.knowledge ?? []),
        },
        first_film_id: outcome.film_id,
        last_film_id: outcome.film_id,
      });
      changed.push(`character:${incoming.canonical_id}`);
      continue;
    }

    const current = characters[index]!;
    const displayName = current.locked.name || name || current.canonical_id;

    if (current.mutable.status === "dead" && !allow.has(current.canonical_id)) {
      conflicts.push({
        kind: "dead_returns",
        subject_type: "character",
        canonical_id: current.canonical_id,
        name: displayName,
        field: "status",
        universe_value: "dead",
        film_value: incoming.end.status ?? "appears",
      });
      continue;
    }

    current.locked = mergeLocked(LOCKED_CHARACTER_FIELDS, current.locked, incoming.locked, (field, had, got) =>
      conflicts.push({
        kind: "locked_mismatch",
        subject_type: "character",
        canonical_id: current.canonical_id,
        name: displayName,
        field,
        universe_value: had,
        film_value: got,
      }),
    );
    // Reference images are locked: the universe keeps its own; new ones only fill an empty pack.
    if (!current.reference_assets.length) current.reference_assets = uniq(incoming.reference_assets ?? []);

    const end = incoming.end;
    const m = current.mutable;
    current.mutable = {
      status: end.status ?? (m.status === "dead" ? "alive" : m.status),
      wardrobe: clean(end.wardrobe) || m.wardrobe,
      location: clean(end.location) || m.location,
      injuries: end.injuries ? uniq(end.injuries) : m.injuries,
      relationships: uniq([...m.relationships, ...(end.relationships ?? [])]),
      knowledge: uniq([...m.knowledge, ...(end.knowledge ?? [])]),
    };
    current.last_film_id = outcome.film_id;
    changed.push(`character:${current.canonical_id}`);
  }

  const locations = base.locations.map((l) => ({
    ...l,
    locked: { ...l.locked },
    reference_assets: [...l.reference_assets],
    mutable: { ...l.mutable, notes: [...l.mutable.notes] },
  }));

  for (const incoming of outcome.locations) {
    const name = clean(incoming.locked.name);
    let index = locations.findIndex((l) => l.canonical_id === incoming.canonical_id);
    if (index < 0 && name) {
      index = locations.findIndex((l) => identityKey(l.locked.name) === identityKey(name));
    }
    if (index < 0) {
      locations.push({
        canonical_id: incoming.canonical_id,
        locked: mergeLocked(LOCKED_LOCATION_FIELDS, blankLocked(LOCKED_LOCATION_FIELDS), incoming.locked, () => {}),
        reference_assets: uniq(incoming.reference_assets ?? []),
        mutable: { condition: clean(incoming.end.condition), notes: uniq(incoming.end.notes ?? []) },
        first_film_id: outcome.film_id,
        last_film_id: outcome.film_id,
      });
      changed.push(`location:${incoming.canonical_id}`);
      continue;
    }
    const current = locations[index]!;
    const displayName = current.locked.name || name || current.canonical_id;
    current.locked = mergeLocked(LOCKED_LOCATION_FIELDS, current.locked, incoming.locked, (field, had, got) =>
      conflicts.push({
        kind: "locked_mismatch",
        subject_type: "location",
        canonical_id: current.canonical_id,
        name: displayName,
        field,
        universe_value: had,
        film_value: got,
      }),
    );
    if (!current.reference_assets.length) current.reference_assets = uniq(incoming.reference_assets ?? []);
    current.mutable = {
      condition: clean(incoming.end.condition) || current.mutable.condition,
      notes: uniq([...current.mutable.notes, ...(incoming.end.notes ?? [])]),
    };
    current.last_film_id = outcome.film_id;
    changed.push(`location:${current.canonical_id}`);
  }

  const style =
    base.style.name || base.style.reference_assets.length
      ? { name: base.style.name, reference_assets: [...base.style.reference_assets] }
      : {
          name: clean(outcome.style?.name),
          reference_assets: uniq(outcome.style?.reference_assets ?? []),
        };

  const timeline = [
    ...base.timeline.filter((e) => e.film_id !== outcome.film_id),
    ...outcome.events
      .filter((e) => clean(e.description))
      .map((e) => ({
        film_id: outcome.film_id,
        film_title: outcome.film_title,
        scene_number: e.scene_number,
        description: clean(e.description),
      })),
  ];

  return { next: { characters, locations, style, timeline }, conflicts, changed };
}

/** Stable fingerprint of an outcome, so re-opening a film does not create a new version. */
export function outcomeFingerprint(outcome: FilmOutcome): string {
  const s = JSON.stringify(outcome);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${outcome.film_id}:${(h >>> 0).toString(16)}`;
}

/** "Previously in your universe" — the last few events plus each character's standing. */
export function previouslySummary(snapshot: UniverseSnapshot, limit = 4): string[] {
  const lines = snapshot.timeline.slice(-limit).map((e) => `${e.film_title}: ${e.description}`);
  for (const c of snapshot.characters) {
    const bits = [
      c.mutable.status !== "alive" ? c.mutable.status : "",
      c.mutable.location ? `at ${c.mutable.location}` : "",
      c.mutable.injuries.length ? `marked by ${c.mutable.injuries.join(", ")}` : "",
    ].filter(Boolean);
    if (bits.length) lines.push(`${c.locked.name || c.canonical_id} — ${bits.join(", ")}`);
  }
  return lines;
}

/** The selected slice carried into a new film. Dead characters are kept but flagged. */
export function selectCarry(
  snapshot: UniverseSnapshot,
  characterIds: string[],
  locationIds: string[],
): Pick<UniverseSnapshot, "characters" | "locations" | "style"> {
  const c = new Set(characterIds);
  const l = new Set(locationIds);
  return {
    characters: snapshot.characters.filter((x) => c.has(x.canonical_id)),
    locations: snapshot.locations.filter((x) => l.has(x.canonical_id)),
    style: snapshot.style,
  };
}

export function readSnapshot(value: unknown): UniverseSnapshot {
  const v = (value ?? {}) as Partial<UniverseSnapshot>;
  return {
    characters: Array.isArray(v.characters) ? v.characters : [],
    locations: Array.isArray(v.locations) ? v.locations : [],
    style: v.style ?? { name: "", reference_assets: [] },
    timeline: Array.isArray(v.timeline) ? v.timeline : [],
  };
}

/* ------------------------------------------------------------- versioning */

export type UniverseVersionRow = {
  version: number;
  status: "applied" | "pending" | "rejected";
  film_id: string | null;
  fingerprint: string;
  snapshot: UniverseSnapshot;
};

export type UpdatePlan =
  | { kind: "skip"; reason: "already_recorded" }
  | {
      kind: "apply" | "pending";
      version: number;
      snapshot: UniverseSnapshot;
      conflicts: UniverseConflict[];
      fingerprint: string;
    };

/** Latest applied snapshot — the universe as it stands now. */
export function currentSnapshot(history: UniverseVersionRow[]): UniverseSnapshot {
  const applied = history
    .filter((r) => r.status === "applied")
    .sort((a, b) => b.version - a.version)[0];
  return applied ? readSnapshot(applied.snapshot) : emptyUniverse();
}

export function nextVersion(history: UniverseVersionRow[]): number {
  return history.reduce((max, r) => Math.max(max, r.version), 0) + 1;
}

/**
 * Append-only: every update is a NEW row. A film already recorded with the same
 * fingerprint is skipped. Conflicts produce a pending row that waits for the creator.
 */
export function planUniverseUpdate(
  history: UniverseVersionRow[],
  outcome: FilmOutcome,
  options: { allowReturns?: string[]; force?: boolean } = {},
): UpdatePlan {
  const fingerprint = outcomeFingerprint(outcome);
  if (!options.force && history.some((r) => r.fingerprint === fingerprint)) {
    return { kind: "skip", reason: "already_recorded" };
  }
  const merged = mergeUniverse(currentSnapshot(history), outcome, options);
  const blocking = merged.conflicts.filter((c) => c.kind === "dead_returns");
  return {
    kind: blocking.length ? "pending" : "apply",
    version: nextVersion(history),
    snapshot: merged.next,
    conflicts: merged.conflicts,
    fingerprint,
  };
}

/** Going back never deletes: the old snapshot is re-applied as a new version. */
export function planRestore(
  history: UniverseVersionRow[],
  version: number,
): { version: number; snapshot: UniverseSnapshot } | null {
  const target = history.find((r) => r.version === version && r.status === "applied");
  if (!target) return null;
  return { version: nextVersion(history), snapshot: readSnapshot(target.snapshot) };
}

/* ------------------------------------------------------- carry into a film */

export type UniverseCarry = Pick<UniverseSnapshot, "characters" | "locations" | "style">;

export function readCarry(value: unknown): UniverseCarry | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<UniverseCarry>;
  return {
    characters: Array.isArray(v.characters) ? v.characters : [],
    locations: Array.isArray(v.locations) ? v.locations : [],
    style: v.style ?? { name: "", reference_assets: [] },
  };
}

type SeedCharacter = { canonical_id: string; name: string } & Partial<Record<LockedCharacterField, string>>;

/**
 * Seeding with a carry: a character the film shares with the universe gets the
 * universe's locked traits (they are the truth); carried characters the new
 * story does not mention yet are added. Returns which film id maps to which
 * universe character, so reference images can follow.
 */
export function applyCarryToCharacters<T extends SeedCharacter>(
  seed: T[],
  carry: UniverseCarry | null,
): { rows: (T | SeedCharacter)[]; links: { canonical_id: string; universe: UniverseCharacter }[] } {
  if (!carry?.characters.length) return { rows: seed, links: [] };
  const links: { canonical_id: string; universe: UniverseCharacter }[] = [];
  const used = new Set<string>();
  const rows: (T | SeedCharacter)[] = seed.map((row) => {
    const match = carry.characters.find(
      (c) => !used.has(c.canonical_id) && identityKey(c.locked.name) === identityKey(row.name),
    );
    if (!match) return row;
    used.add(match.canonical_id);
    links.push({ canonical_id: row.canonical_id, universe: match });
    const next = { ...row };
    for (const field of LOCKED_CHARACTER_FIELDS) {
      if (field === "name") continue;
      const v = clean(match.locked[field]);
      if (v) (next as Record<string, unknown>)[field] = v;
    }
    return next;
  });
  const taken = new Set(rows.map((r) => r.canonical_id));
  for (const c of carry.characters) {
    if (used.has(c.canonical_id) || taken.has(c.canonical_id)) continue;
    const row: SeedCharacter = { canonical_id: c.canonical_id, name: c.locked.name || c.canonical_id };
    for (const field of LOCKED_CHARACTER_FIELDS) if (field !== "name") row[field] = c.locked[field];
    rows.push(row);
    links.push({ canonical_id: c.canonical_id, universe: c });
  }
  return { rows, links };
}

/** Carried characters the universe says are dead — the Director must ask before using them. */
export function carryWarnings(carry: UniverseCarry | null): string[] {
  return (carry?.characters ?? [])
    .filter((c) => c.mutable.status === "dead" || c.mutable.status === "missing")
    .map((c) => `${c.locked.name || c.canonical_id} is ${c.mutable.status} in your universe.`);
}
