import { REQUIRED_TRUTH_FIELDS } from "@/lib/scene-truth";
import type { StoryState } from "@/lib/story-state";

import {
  CONTINUITY_RULES,
  SEVERITY_RANK,
  type Evidence,
  type Finding,
  type RuleId,
} from "@/lib/continuity-rules";

/**
 * DETERMINISTIC CONTINUITY ENGINE.
 *
 * check(state) → Finding[]
 *
 * Pure, read-only, AI-free, credit-free and advisory. It reads the canonical
 * StoryState (which is itself derived from the Film Bible, Scene Truth, the Plot
 * Twist library and the generation records) and reports only contradictions the
 * structured state actually proves. It never mutates its input, never invents an
 * entity, never asks a model and never blocks a render.
 *
 * FALSE POSITIVE RULE: when a rule's required information is absent, the rule
 * skips. Unknown always beats a false positive.
 */

/* ------------------------------------------------------------------ atoms */

const norm = (value: string | null | undefined): string =>
  (value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const names = (value: string | null | undefined): string[] =>
  (value ?? "")
    .split(/[,;/]|(?:\band\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);

/** First plausible 3–4 digit story year in a label, or null. */
function year(value: string | null | undefined): number | null {
  const match = /\b(1\d{3}|20\d{2}|21\d{2})\b/.exec(value ?? "");
  return match ? Number(match[1]) : null;
}

function birthYear(character: StoryState["characters"][number]): number | null {
  const haystack = [character.age, character.appearance, character.role].filter(Boolean).join(" ");
  const match = /\bborn\s+(?:in\s+)?(1\d{3}|20\d{2})\b/i.exec(haystack);
  return match ? Number(match[1]) : null;
}

function statedAge(character: StoryState["characters"][number]): number | null {
  const raw = character.age ?? "";
  const match = /\b(\d{1,3})\b(?!\s*(?:st|nd|rd|th))/.exec(raw.replace(/\bborn\s+\d{4}\b/i, ""));
  if (!match) return null;
  const value = Number(match[1]);
  return value > 0 && value < 130 ? value : null;
}

/** Deterministic id: rule + a stable key derived only from state content. */
function finding(ruleId: RuleId, key: string, message: string, evidence: Evidence[]): Finding {
  const rule = CONTINUITY_RULES[ruleId];
  return {
    id: `${ruleId}:${key}`,
    ruleId,
    severity: rule.severity,
    category: rule.category,
    title: rule.title,
    message,
    evidence,
    suggestedActions: [...rule.suggestedActions],
  };
}

/* ------------------------------------------------------------------ rules */

function missingEntity(state: StoryState): Finding[] {
  const known = new Set(state.characters.map((c) => norm(c.name)).filter(Boolean));
  if (!known.size) return []; // no cast recorded — nothing can be proven missing
  const out: Finding[] = [];

  for (const scene of state.scenes) {
    for (const raw of scene.characters) {
      const name = norm(raw);
      if (!name || known.has(name)) continue;
      // A partial match (first name, or a name inside a longer label) is not a
      // contradiction — only report a name nothing in the cast contains.
      if (Array.from(known).some((k) => k.includes(name) || name.includes(k))) continue;
      out.push(
        finding(
          "CONTINUITY_MISSING_ENTITY",
          `scene-${scene.scene_number}-${norm(raw).replace(/\s/g, "-")}`,
          `Scene ${scene.scene_number} references "${raw.trim()}", who is not in the film's cast.`,
          [
            { sceneId: scene.id, sceneNumber: scene.scene_number, entityType: "scene" },
            { entityType: "character", field: "name", value: raw.trim() },
          ],
        ),
      );
    }
  }
  return out;
}

function duplicateEntity(state: StoryState): Finding[] {
  const out: Finding[] = [];

  const byKey = (
    entries: { id: string; label: string }[],
    entityType: NonNullable<Evidence["entityType"]>,
    keyOf: (entry: { id: string; label: string }) => string,
    field: string,
  ) => {
    const seen = new Map<string, string[]>();
    for (const entry of entries) {
      const key = keyOf(entry);
      if (!key) continue;
      seen.set(key, [...(seen.get(key) ?? []), entry.id]);
    }
    for (const [key, ids] of Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      if (ids.length < 2) continue;
      out.push(
        finding(
          "CONTINUITY_DUPLICATE_ENTITY",
          `${entityType}-${field}-${key.replace(/\s/g, "-")}`,
          `${ids.length} ${entityType} records share the same ${field} "${key}".`,
          ids.map((id) => ({ entityType, entityId: id, field, value: key })),
        ),
      );
    }
  };

  byKey(
    state.characters.map((c) => ({ id: c.id, label: c.name })),
    "character",
    (e) => norm(e.label),
    "name",
  );
  byKey(
    state.world.locations.map((l) => ({ id: l.id, label: l.name })),
    "location",
    (e) => e.id,
    "id",
  );
  byKey(
    state.world.objects.map((o) => ({ id: o.id, label: o.name })),
    "object",
    (e) => e.id,
    "id",
  );
  byKey(
    state.facts.map((f) => ({ id: f.id, label: f.statement })),
    "fact",
    (e) => e.id,
    "id",
  );
  byKey(
    state.scenes.map((s) => ({ id: s.id, label: String(s.scene_number) })),
    "scene",
    (e) => e.label,
    "scene_number",
  );

  return out;
}

/* --------------------------------------------------------- phase 2.2 rules */

/**
 * Two facts that answer the same question differently. Only fires on an exact
 * normalized category match with differing values — similar-but-not-equal
 * wording is never treated as a contradiction.
 */
function factContradiction(state: StoryState): Finding[] {
  const out: Finding[] = [];
  const byCategory = new Map<string, StoryState["facts"]>();
  for (const fact of state.facts) {
    const key = norm(fact.category);
    if (!key) continue; // uncategorised facts cannot be proven to collide
    byCategory.set(key, [...(byCategory.get(key) ?? []), fact]);
  }
  for (const key of Array.from(byCategory.keys()).sort()) {
    const group = byCategory.get(key)!;
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i]!;
        const b = group[j]!;
        const valueA = norm(a.statement);
        const valueB = norm(b.statement);
        if (!valueA || !valueB || valueA === valueB) continue;
        if (a.status !== "true" || b.status !== "true") continue; // history, not conflict
        out.push(
          finding(
            "CONTINUITY_FACT_CONTRADICTION",
            `${a.id}-vs-${b.id}`,
            `Two active facts share the category "${a.category}" but say different things: "${a.statement}" and "${b.statement}".`,
            [
              { entityType: "fact", entityId: a.id, field: "statement", value: a.statement },
              { entityType: "fact", entityId: b.id, field: "statement", value: b.statement },
            ],
          ),
        );
      }
    }
  }
  return out;
}

/** A changed or retracted fact that knowledge or a thread still leans on. */
function retractedFactInUse(state: StoryState): Finding[] {
  const out: Finding[] = [];
  const stale = new Map(
    state.facts.filter((f) => f.status !== "true").map((f) => [f.id, f] as const),
  );
  if (!stale.size) return [];

  for (const event of state.knowledge_events) {
    if (!event.fact_id) continue;
    const fact = stale.get(event.fact_id);
    if (!fact) continue;
    out.push(
      finding(
        "CONTINUITY_RETRACTED_FACT_IN_USE",
        `knowledge-${event.id}-fact-${fact.id}`,
        `Knowledge event "${event.id}" still references fact "${fact.id}", which is marked ${fact.status}.`,
        [
          { entityType: "knowledge_event", entityId: event.id, field: "fact_id" },
          { entityType: "fact", entityId: fact.id, field: "status", value: fact.status },
        ],
      ),
    );
  }

  for (const thread of state.open_threads) {
    for (const id of thread.facts) {
      const fact = stale.get(id);
      if (!fact) continue;
      out.push(
        finding(
          "CONTINUITY_RETRACTED_FACT_IN_USE",
          `thread-${thread.id}-fact-${fact.id}`,
          `Thread "${thread.id}" still references fact "${fact.id}", which is marked ${fact.status}.`,
          [
            { entityType: "thread", entityId: thread.id, field: "facts" },
            { entityType: "fact", entityId: fact.id, field: "status", value: fact.status },
          ],
        ),
      );
    }
  }
  return out;
}

/** The same question asked twice. Exact normalized match only. */
function duplicateThread(state: StoryState): Finding[] {
  const out: Finding[] = [];
  const seen = new Map<string, string[]>();
  for (const thread of state.open_threads) {
    const key = norm(thread.question);
    if (!key) continue;
    seen.set(key, [...(seen.get(key) ?? []), thread.id]);
  }
  for (const [key, ids] of Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (ids.length < 2) continue;
    out.push(
      finding(
        "CONTINUITY_DUPLICATE_THREAD",
        `thread-${key.replace(/\s/g, "-")}`,
        `${ids.length} open threads ask the same question: "${key}".`,
        ids.map((id) => ({ entityType: "thread", entityId: id, field: "question", value: key })),
      ),
    );
  }
  return out;
}

/** A payoff cannot be paid off in no scene. */
function payoffStatusInconsistent(state: StoryState): Finding[] {
  return state.payoffs
    .filter((payoff) => payoff.status === "paid_off" && payoff.payoff_scene === null)
    .map((payoff) =>
      finding(
        "CONTINUITY_PAYOFF_STATUS_INCONSISTENT",
        payoff.id,
        `Payoff "${payoff.requirement}" is marked paid off, but no scene is recorded for it.`,
        [
          { entityType: "payoff", entityId: payoff.id, field: "status", value: payoff.status },
          { entityType: "payoff", entityId: payoff.id, field: "payoff_scene" },
        ],
      ),
    );
}

/** A thread explicitly closed with no scene claiming the resolution. */
function threadResolvedWithoutScene(state: StoryState): Finding[] {
  const claimed = new Set(state.scenes.flatMap((scene) => scene.threads_resolved));
  return state.open_threads
    .filter((thread) => thread.status === "resolved" && !claimed.has(thread.id))
    .map((thread) =>
      finding(
        "CONTINUITY_THREAD_RESOLVED_WITHOUT_SCENE",
        thread.id,
        `Thread "${thread.question}" is marked resolved, but no scene records resolving it.`,
        [
          { entityType: "thread", entityId: thread.id, field: "status", value: thread.status },
          { entityType: "thread", entityId: thread.id, field: "question", value: thread.question },
        ],
      ),
    );
}

function invalidReference(state: StoryState): Finding[] {
  const out: Finding[] = [];
  const characterIds = new Set(state.characters.map((c) => c.id));
  const factIds = new Set(state.facts.map((f) => f.id));
  const threadIds = new Set(state.open_threads.map((t) => t.id));
  const payoffIds = new Set(state.payoffs.map((p) => p.id));
  const relationshipIds = new Set(state.relationships.map((r) => r.id));
  const sceneNumbers = new Set(state.scenes.map((s) => s.scene_number));

  const report = (key: string, message: string, evidence: Evidence[]) =>
    out.push(finding("CONTINUITY_INVALID_REFERENCE", key, message, evidence));

  for (const scene of state.scenes) {
    for (const id of scene.payoffs) {
      if (payoffIds.has(id)) continue;
      report(
        `scene-${scene.scene_number}-payoff-${id}`,
        `Scene ${scene.scene_number} references payoff "${id}", which does not exist.`,
        [
          { sceneId: scene.id, sceneNumber: scene.scene_number, entityType: "scene" },
          { entityType: "payoff", entityId: id, field: "payoffs" },
        ],
      );
    }
  }

  for (const payoff of state.payoffs) {
    if (payoff.thread_id && !threadIds.has(payoff.thread_id)) {
      report(
        `payoff-${payoff.id}-thread-${payoff.thread_id}`,
        `Payoff "${payoff.id}" references thread "${payoff.thread_id}", which does not exist.`,
        [
          { entityType: "payoff", entityId: payoff.id, field: "thread_id" },
          { entityType: "thread", entityId: payoff.thread_id },
        ],
      );
    }
    if (
      payoff.payoff_scene !== null &&
      sceneNumbers.size > 0 &&
      !sceneNumbers.has(payoff.payoff_scene)
    ) {
      report(
        `payoff-${payoff.id}-scene-${payoff.payoff_scene}`,
        `Payoff "${payoff.id}" pays off in scene ${payoff.payoff_scene}, which does not exist.`,
        [
          { entityType: "payoff", entityId: payoff.id, field: "payoff_scene" },
          { entityType: "scene", sceneNumber: payoff.payoff_scene },
        ],
      );
    }
  }

  for (const thread of state.open_threads) {
    for (const id of thread.facts) {
      if (factIds.has(id)) continue;
      report(
        `thread-${thread.id}-fact-${id}`,
        `Thread "${thread.id}" references fact "${id}", which does not exist.`,
        [
          { entityType: "thread", entityId: thread.id, field: "facts" },
          { entityType: "fact", entityId: id },
        ],
      );
    }
  }

  for (const character of state.characters) {
    for (const id of character.relationships) {
      if (relationshipIds.has(id)) continue;
      report(
        `character-${character.id}-relationship-${id}`,
        `${character.name} references relationship "${id}", which does not exist.`,
        [
          { entityType: "character", entityId: character.id, field: "relationships" },
          { entityType: "relationship", entityId: id },
        ],
      );
    }
  }

  // Phase 2.1 character state / knowledge events: broken canonical references
  // stay detectable. Absent optional references are never treated as broken.
  for (const entry of state.character_states) {
    if (entry.character_id && !characterIds.has(entry.character_id)) {
      report(
        `character-state-${entry.character_id}`,
        `Character state history references character "${entry.character_id}", who does not exist.`,
        [
          { entityType: "character_state_event", field: "character_id" },
          { entityType: "character", entityId: entry.character_id },
        ],
      );
    }
    for (const event of entry.events) {
      if (
        event.scene_number !== null &&
        sceneNumbers.size > 0 &&
        !sceneNumbers.has(event.scene_number)
      ) {
        report(
          `character-state-event-${event.id}-scene-${event.scene_number}`,
          `State event "${event.id}" references scene ${event.scene_number}, which does not exist.`,
          [
            { entityType: "character_state_event", entityId: event.id, field: "scene_number" },
            { entityType: "scene", sceneNumber: event.scene_number },
          ],
        );
      }
    }
  }

  for (const event of state.knowledge_events) {
    if (event.character_id && !characterIds.has(event.character_id)) {
      report(
        `knowledge-${event.id}-character-${event.character_id}`,
        `Knowledge event "${event.id}" references character "${event.character_id}", who does not exist.`,
        [
          { entityType: "knowledge_event", entityId: event.id, field: "character_id" },
          { entityType: "character", entityId: event.character_id },
        ],
      );
    }
    if (event.fact_id && !factIds.has(event.fact_id)) {
      report(
        `knowledge-${event.id}-fact-${event.fact_id}`,
        `Knowledge event "${event.id}" references fact "${event.fact_id}", which does not exist.`,
        [
          { entityType: "knowledge_event", entityId: event.id, field: "fact_id" },
          { entityType: "fact", entityId: event.fact_id },
        ],
      );
    }
    if (
      event.scene_number !== null &&
      sceneNumbers.size > 0 &&
      !sceneNumbers.has(event.scene_number)
    ) {
      report(
        `knowledge-${event.id}-scene-${event.scene_number}`,
        `Knowledge event "${event.id}" references scene ${event.scene_number}, which does not exist.`,
        [
          { entityType: "knowledge_event", entityId: event.id, field: "scene_number" },
          { entityType: "scene", sceneNumber: event.scene_number },
        ],
      );
    }
  }

  for (const relationship of state.relationships) {
    for (const side of ["character_a", "character_b"] as const) {
      const id = relationship[side];
      if (!id || characterIds.has(id)) continue;
      report(
        `relationship-${relationship.id}-${side}-${id}`,
        `Relationship "${relationship.id}" references character "${id}", who does not exist.`,
        [
          { entityType: "relationship", entityId: relationship.id, field: side },
          { entityType: "character", entityId: id },
        ],
      );
    }
  }

  if (
    state.twist.present &&
    state.twist.reveal_scene !== null &&
    sceneNumbers.size > 0 &&
    !sceneNumbers.has(state.twist.reveal_scene)
  ) {
    report(
      `twist-reveal-scene-${state.twist.reveal_scene}`,
      `The twist reveals in scene ${state.twist.reveal_scene}, which does not exist.`,
      [
        { entityType: "twist", field: "reveal_scene", value: String(state.twist.reveal_scene) },
        { entityType: "scene", sceneNumber: state.twist.reveal_scene },
      ],
    );
  }

  return out;
}

function ageMismatch(state: StoryState): Finding[] {
  const out: Finding[] = [];
  const sceneYear = new Map<number, number>();
  for (const event of state.timeline) {
    const y = year(event.story_time);
    if (y !== null && event.scene_number !== null) sceneYear.set(event.scene_number, y);
  }
  for (const scene of state.scenes) {
    if (sceneYear.has(scene.scene_number)) continue;
    const y = year(scene.time);
    if (y !== null) sceneYear.set(scene.scene_number, y);
  }
  if (!sceneYear.size) return [];

  for (const character of state.characters) {
    const born = birthYear(character);
    const age = statedAge(character);
    if (born === null || age === null) continue; // insufficient information — skip

    for (const scene of state.scenes) {
      const y = sceneYear.get(scene.scene_number);
      if (y === undefined) continue;
      const present = scene.characters.some((raw) => {
        const name = norm(raw);
        const known = norm(character.name);
        return Boolean(name && known) && (name === known || name.includes(known));
      });
      if (!present) continue;
      const expected = y - born;
      if (Math.abs(expected - age) <= 1) continue;
      out.push(
        finding(
          "CONTINUITY_AGE_MISMATCH",
          `character-${character.id}-scene-${scene.scene_number}`,
          `${character.name} is stated as ${age}, but born ${born} would be ${expected} in scene ${scene.scene_number} (${y}).`,
          [
            { entityType: "character", entityId: character.id, field: "age", value: String(age) },
            { entityType: "character", entityId: character.id, field: "born", value: String(born) },
            {
              sceneId: scene.id,
              sceneNumber: scene.scene_number,
              field: "story_time",
              value: String(y),
            },
          ],
        ),
      );
    }
  }
  return out;
}

function timelineOrder(state: StoryState): Finding[] {
  const dated = state.timeline
    .map((event) => ({ event, year: year(event.story_time) }))
    .filter((entry): entry is { event: typeof entry.event; year: number } => entry.year !== null)
    .sort((a, b) => a.event.sequence - b.event.sequence);
  if (dated.length < 2) return [];

  const out: Finding[] = [];
  for (let i = 1; i < dated.length; i += 1) {
    const prev = dated[i - 1]!;
    const curr = dated[i]!;
    if (curr.year >= prev.year) continue;
    out.push(
      finding(
        "CONTINUITY_TIMELINE_ORDER",
        `${prev.event.id}-after-${curr.event.id}`,
        `Scene ${curr.event.scene_number ?? curr.event.sequence} is set in ${curr.year} but follows a scene set in ${prev.year}.`,
        [
          {
            entityType: "scene",
            sceneNumber: prev.event.scene_number ?? undefined,
            field: "story_time",
            value: String(prev.year),
          },
          {
            entityType: "scene",
            sceneNumber: curr.event.scene_number ?? undefined,
            field: "story_time",
            value: String(curr.year),
          },
        ],
      ),
    );
  }
  return out;
}

function impossibleState(state: StoryState): Finding[] {
  const out: Finding[] = [];
  const byCharacter = new Map<string, { scene: StoryState["scenes"][number]; time: string }[]>();

  for (const scene of state.scenes) {
    const time = norm(scene.time);
    if (!time) continue;
    for (const raw of scene.characters) {
      const key = norm(raw);
      if (!key) continue;
      byCharacter.set(key, [...(byCharacter.get(key) ?? []), { scene, time }]);
    }
  }

  for (const key of Array.from(byCharacter.keys()).sort()) {
    const entries = byCharacter.get(key)!;
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i]!;
        const b = entries[j]!;
        if (a.time !== b.time) continue;
        const locationA = norm(a.scene.location);
        const locationB = norm(b.scene.location);
        if (!locationA || !locationB || locationA === locationB) continue;
        out.push(
          finding(
            "CONTINUITY_IMPOSSIBLE_STATE",
            `${key.replace(/\s/g, "-")}-${a.scene.scene_number}-${b.scene.scene_number}`,
            `The same character is in two different places at the same story time (${a.scene.time}): scene ${a.scene.scene_number} and scene ${b.scene.scene_number}.`,
            [
              {
                sceneId: a.scene.id,
                sceneNumber: a.scene.scene_number,
                field: "location",
                value: a.scene.location ?? "",
              },
              {
                sceneId: b.scene.id,
                sceneNumber: b.scene.scene_number,
                field: "location",
                value: b.scene.location ?? "",
              },
              { entityType: "character", field: "characters", value: key },
            ],
          ),
        );
      }
    }
  }
  return out;
}

/** Relationship types that are mutual by definition. */
const MUTUAL = new Set([
  "sibling",
  "siblings",
  "brother",
  "sister",
  "twin",
  "twins",
  "spouse",
  "married",
  "partner",
  "partners",
  "friend",
  "friends",
  "cousin",
  "cousins",
  "colleague",
  "colleagues",
  "rival",
  "rivals",
  "enemy",
  "enemies",
  "neighbour",
  "neighbor",
]);

function relationshipAsymmetry(state: StoryState): Finding[] {
  const out: Finding[] = [];
  const byId = new Map(state.characters.map((c) => [c.id, c] as const));

  for (const relationship of state.relationships) {
    const type = norm(relationship.type);
    if (!type || !MUTUAL.has(type)) continue; // one-directional or unknown — skip
    const a = byId.get(relationship.character_a);
    const b = byId.get(relationship.character_b);
    if (!a || !b) continue; // broken reference is another rule's finding
    const holdsA = a.relationships.includes(relationship.id);
    const holdsB = b.relationships.includes(relationship.id);
    if (holdsA === holdsB) continue; // both or neither recorded — nothing proven
    const missing = holdsA ? b : a;
    out.push(
      finding(
        "CONTINUITY_RELATIONSHIP_ASYMMETRY",
        `${relationship.id}-${missing.id}`,
        `${a.name} and ${b.name} are ${relationship.type}, but ${missing.name} does not carry that relationship.`,
        [
          { entityType: "relationship", entityId: relationship.id, field: "type", value: type },
          { entityType: "character", entityId: missing.id, field: "relationships" },
        ],
      ),
    );
  }
  return out;
}

function payoffWithoutSetup(state: StoryState): Finding[] {
  return state.payoffs
    .filter((payoff) => payoff.setups.length === 0)
    .map((payoff) =>
      finding(
        "CONTINUITY_PAYOFF_WITHOUT_SETUP",
        payoff.id,
        `Payoff "${payoff.requirement}" has no recorded setup.`,
        [
          {
            entityType: "payoff",
            entityId: payoff.id,
            field: "setups",
            value: payoff.requirement,
          },
          ...(payoff.payoff_scene !== null
            ? [{ entityType: "scene" as const, sceneNumber: payoff.payoff_scene }]
            : []),
        ],
      ),
    );
}

function twistBeforeForeshadowing(state: StoryState): Finding[] {
  const twist = state.twist;
  if (!twist.present || twist.reveal_scene === null) return [];
  const foreshadowed = state.scenes
    .filter((scene) => (scene.truth?.foreshadowing ?? "").trim())
    .map((scene) => scene.scene_number)
    .sort((a, b) => a - b);
  if (!foreshadowed.length) return []; // nothing structured to compare — skip
  const earliest = foreshadowed[0]!;
  if (earliest < twist.reveal_scene) return [];
  return [
    finding(
      "CONTINUITY_TWIST_BEFORE_FORESHADOWING",
      `reveal-${twist.reveal_scene}-foreshadow-${earliest}`,
      `The twist reveals in scene ${twist.reveal_scene}, but the earliest foreshadowing is in scene ${earliest}.`,
      [
        { entityType: "twist", field: "reveal_scene", value: String(twist.reveal_scene) },
        { entityType: "scene", sceneNumber: earliest, field: "foreshadowing" },
      ],
    ),
  ];
}

function staleVersion(state: StoryState): Finding[] {
  const based = state.generation.based_on_version;
  const current = state.version.id;
  if (!based || !current || based === current) return [];
  if (state.generation.scenes_rendered < 1) return []; // nothing rendered — nothing stale
  return [
    finding(
      "CONTINUITY_STALE_VERSION",
      `${based}-vs-${current}`,
      `${state.generation.scenes_rendered} rendered scene(s) were based on story version ${based}; the current version is ${current}.`,
      [
        { entityType: "version", field: "based_on_version", value: based },
        { entityType: "version", field: "current", value: current },
      ],
    ),
  ];
}

function sceneTruthIncomplete(state: StoryState): Finding[] {
  const out: Finding[] = [];
  for (const scene of state.scenes) {
    const truth = scene.truth;
    if (!truth) continue; // no Scene Truth recorded at all — not this rule's business
    const missing = REQUIRED_TRUTH_FIELDS.filter((field) => !(truth[field] ?? "").trim());
    if (!missing.length) continue;
    out.push(
      finding(
        "CONTINUITY_SCENE_TRUTH_INCOMPLETE",
        `scene-${scene.scene_number}-${missing.join("-")}`,
        `Scene ${scene.scene_number} is missing required Scene Truth: ${missing.join(", ")}.`,
        missing.map((field) => ({
          sceneId: scene.id,
          sceneNumber: scene.scene_number,
          field,
        })),
      ),
    );
  }
  return out;
}

/* ----------------------------------------------------------------- engine */

const RULES: ((state: StoryState) => Finding[])[] = [
  missingEntity,
  duplicateEntity,
  invalidReference,
  ageMismatch,
  timelineOrder,
  impossibleState,
  relationshipAsymmetry,
  payoffWithoutSetup,
  twistBeforeForeshadowing,
  staleVersion,
  sceneTruthIncomplete,
  factContradiction,
  retractedFactInUse,
  duplicateThread,
  payoffStatusInconsistent,
  threadResolvedWithoutScene,
];

/** Stable ordering: severity, then rule, then finding id. */
export function sortFindings(findings: Finding[]): Finding[] {
  return findings.slice().sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const byRule = a.ruleId.localeCompare(b.ruleId);
    if (byRule !== 0) return byRule;
    return a.id.localeCompare(b.id);
  });
}

/**
 * The engine contract. Read-only and advisory: callers may display findings,
 * but nothing here blocks generation or changes state.
 */
export function check(state: StoryState): Finding[] {
  const findings: Finding[] = [];
  for (const rule of RULES) findings.push(...rule(state));
  return sortFindings(findings);
}

export type ContinuityReport = {
  findings: Finding[];
  counts: Record<Finding["severity"], number>;
  /** Which StoryState version produced this report. */
  version: string;
  advisory: true;
};

export function checkReport(state: StoryState): ContinuityReport {
  const findings = check(state);
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const item of findings) counts[item.severity] += 1;
  return { findings, counts, version: state.version.id, advisory: true };
}
