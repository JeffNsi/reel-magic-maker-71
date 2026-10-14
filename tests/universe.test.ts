import { describe, expect, it } from "vitest";

import {
  currentSnapshot,
  mergeUniverse,
  planRestore,
  planUniverseUpdate,
  statusFromText,
  type FilmOutcome,
  type UniverseVersionRow,
} from "@/lib/universe";

const film1: FilmOutcome = {
  film_id: "f1",
  film_title: "Film One",
  characters: [
    {
      canonical_id: "AMARA_01",
      locked: { name: "Amara", face: "oval, freckles", hair: "black braids" },
      reference_assets: ["a/front.png"],
      end: {
        status: "alive",
        wardrobe: "red coat",
        location: "harbour",
        injuries: ["cut on cheek"],
      },
    },
    {
      canonical_id: "JULIAN_01",
      locked: { name: "Julian" },
      end: { status: "dead" },
    },
  ],
  locations: [
    {
      canonical_id: "TOWER_01",
      locked: { name: "Clock Tower", architecture: "stone" },
      end: { condition: "intact" },
    },
  ],
  events: [{ scene_number: 3, description: "Julian falls from the tower." }],
};

function apply(history: UniverseVersionRow[], outcome: FilmOutcome, opts = {}) {
  const plan = planUniverseUpdate(history, outcome, opts);
  if (plan.kind === "skip") return history;
  return [
    ...history,
    {
      version: plan.version,
      status: plan.kind === "apply" ? "applied" : "pending",
      film_id: outcome.film_id,
      fingerprint: plan.fingerprint,
      snapshot: plan.snapshot,
    } as UniverseVersionRow,
  ];
}

describe("universe locked fields", () => {
  it("never overwrites face, name or reference images, and reports the mismatch", () => {
    const first = mergeUniverse(null, film1).next;
    const result = mergeUniverse(first, {
      film_id: "f2",
      film_title: "Film Two",
      characters: [
        {
          canonical_id: "AMARA_01",
          locked: { name: "Amara", face: "square jaw", build: "athletic" },
          reference_assets: ["other.png"],
          end: { wardrobe: "grey hoodie", location: "station", injuries: [] },
        },
      ],
      locations: [],
      events: [],
    });
    const amara = result.next.characters.find((c) => c.canonical_id === "AMARA_01")!;
    expect(amara.locked.face).toBe("oval, freckles");
    expect(amara.locked.build).toBe("athletic"); // empty locked field filled once
    expect(amara.reference_assets).toEqual(["a/front.png"]);
    expect(amara.mutable.wardrobe).toBe("grey hoodie");
    expect(amara.mutable.location).toBe("station");
    expect(amara.mutable.injuries).toEqual([]);
    expect(result.conflicts).toContainEqual(
      expect.objectContaining({
        kind: "locked_mismatch",
        field: "face",
        universe_value: "oval, freckles",
      }),
    );
  });

  it("does not mutate its input", () => {
    const first = mergeUniverse(null, film1).next;
    const frozen = JSON.stringify(first);
    mergeUniverse(first, { ...film1, film_id: "f2" });
    expect(JSON.stringify(first)).toBe(frozen);
  });

  it("matches by normalized name only — Julian and Julian Reyes stay two people", () => {
    const first = mergeUniverse(null, film1).next;
    const next = mergeUniverse(first, {
      film_id: "f2",
      film_title: "Two",
      characters: [{ canonical_id: "X_01", locked: { name: "Julian Reyes" }, end: {} }],
      locations: [],
      events: [],
    }).next;
    expect(next.characters.map((c) => c.locked.name)).toEqual(["Amara", "Julian", "Julian Reyes"]);
  });

  it("lets places change state, e.g. a building that burned", () => {
    const first = mergeUniverse(null, film1).next;
    const next = mergeUniverse(first, {
      film_id: "f2",
      film_title: "Two",
      characters: [],
      locations: [
        {
          canonical_id: "TOWER_01",
          locked: { name: "Clock Tower" },
          end: { condition: "burned down" },
        },
      ],
      events: [],
    }).next;
    expect(next.locations[0]!.mutable.condition).toBe("burned down");
    expect(next.locations[0]!.locked.architecture).toBe("stone");
  });
});

describe("universe versioning", () => {
  it("appends a new version per film and skips a film already recorded", () => {
    let history = apply([], film1);
    history = apply(history, film1);
    expect(history).toHaveLength(1);
    history = apply(history, {
      ...film1,
      film_id: "f2",
      characters: [film1.characters[0]!],
      events: [{ scene_number: 1, description: "Amara leaves town." }],
    });
    expect(history.map((r) => r.version)).toEqual([1, 2]);
    expect(currentSnapshot(history).timeline.map((e) => e.film_id)).toEqual(["f1", "f2"]);
  });

  it("flags a dead character returning as pending instead of applying", () => {
    const history = apply([], film1);
    const plan = planUniverseUpdate(history, {
      film_id: "f2",
      film_title: "Two",
      characters: [
        { canonical_id: "JULIAN_01", locked: { name: "Julian" }, end: { location: "cafe" } },
      ],
      locations: [],
      events: [],
    });
    expect(plan.kind).toBe("pending");
    if (plan.kind !== "skip") {
      expect(plan.conflicts[0]!.kind).toBe("dead_returns");
      const julian = plan.snapshot.characters.find((c) => c.canonical_id === "JULIAN_01")!;
      expect(julian.mutable.status).toBe("dead");
      expect(julian.mutable.location).toBe("");
    }
  });

  it("applies the return only when the creator approves it", () => {
    const history = apply([], film1);
    const plan = planUniverseUpdate(
      history,
      {
        film_id: "f2",
        film_title: "Two",
        characters: [
          { canonical_id: "JULIAN_01", locked: { name: "Julian" }, end: { location: "cafe" } },
        ],
        locations: [],
        events: [],
      },
      { allowReturns: ["JULIAN_01"] },
    );
    expect(plan.kind).toBe("apply");
    if (plan.kind !== "skip") {
      const julian = plan.snapshot.characters.find((c) => c.canonical_id === "JULIAN_01")!;
      expect(julian.mutable.status).toBe("alive");
    }
  });

  it("restores an earlier version as a new version without deleting history", () => {
    let history = apply([], film1);
    history = apply(history, {
      ...film1,
      film_id: "f2",
      characters: [],
      events: [{ scene_number: 1, description: "x" }],
    });
    const restore = planRestore(history, 1)!;
    expect(restore.version).toBe(3);
    expect(restore.snapshot.timeline.map((e) => e.film_id)).toEqual(["f1"]);
    expect(planRestore(history, 99)).toBeNull();
  });

  it("reads death only from explicit words", () => {
    expect(statusFromText("He is killed on the bridge")).toBe("dead");
    expect(statusFromText("She vanished at dawn")).toBe("missing");
    expect(statusFromText("tired and soaked")).toBeNull();
  });
});
