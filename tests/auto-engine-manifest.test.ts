import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildFilmManifest,
  canonicalJson,
  combineManifests,
  DEFAULT_CLIP_MS,
  manifestHash,
  MAX_SEGMENTS,
  type ManifestGenerationInput,
  type ManifestSceneInput,
} from "@/lib/auto-engine/manifest";
import {
  FilmNotFoundError,
  loadFilmManifest,
  type ManifestReader,
} from "@/lib/auto-engine/manifest.server";

/**
 * Auto Engine step 1 — the manifest is pure, credit-free and mirrors the film
 * page: a scene's clip is its generation_id, and only a completed, stored clip
 * counts. Fixtures use the real ids of the two finished films; which of the
 * duplicate takes is linked for QA Homecoming scenes 1–2 is a fixture choice.
 */

const QA = "d893842c-16fb-4416-ad8e-8714ef269dbb";
const QA_TAKES = {
  s1: "b83e4819-15de-4f5d-8fad-33e727257897",
  s1_unused: "6c9457f5-b01c-478a-b206-f85599755864",
  s2: "8e0d85f4-fc6b-49a9-b76f-cdc2c21648f5",
  s2_unused: "28c6ec4e-02c4-4abc-a9fd-783f5f9bb340",
  s3: "7e1e4b6a-9640-4ada-8516-df52c21f2732",
  s4: "2943f718-daa3-41ab-968a-8127d384ad7a",
  s5: "f3e060b3-60a9-41c2-8090-edab2c797d68",
};
const QA_TITLES = [
  "01 · Arrival / Ankomst",
  "02 · Discovery / Upptäckt",
  "03 · Choice / Val",
  "04 · Consequence / Följd",
  "05 · Ending / Slut",
];

function gen(
  id: string,
  story_id: string,
  extra: Partial<ManifestGenerationInput> = {},
): ManifestGenerationInput {
  return {
    id,
    story_id,
    status: "completed",
    video_url: `${id}.mp4`,
    voiceover_url: null,
    provider: "lovable",
    ...extra,
  };
}

function qaHomecoming() {
  const linked = [QA_TAKES.s1, QA_TAKES.s2, QA_TAKES.s3, QA_TAKES.s4, QA_TAKES.s5];
  const scenes: ManifestSceneInput[] = linked.map((generation_id, i) => ({
    id: `qa-scene-${i + 1}`,
    scene_number: i + 1,
    title: QA_TITLES[i] ?? null,
    narration: "",
    generation_id,
  }));
  const generations = [...linked, QA_TAKES.s1_unused, QA_TAKES.s2_unused].map((id) => gen(id, QA));
  return { story: { id: QA, title: "QA Homecoming" }, scenes, generations };
}

const TIDE = "6985b3d0-cad6-463b-92a6-d59f834b82ca";
function vanishingTide() {
  const rows: [string, string, string][] = [
    [
      "ad6a1f34-4417-4f81-841f-d8e0e0036f04",
      "Dragging to the Edge",
      "There was only one way to wipe the slate clean.",
    ],
    [
      "359679cd-f716-4396-82fc-27532dce8124",
      "Into the Swell",
      "Out past the breakers, the debt could not follow.",
    ],
    [
      "6c30d63c-94f9-47c1-b5c8-6b4c7fee258a",
      "The Cast Off",
      "A man can only drown if he stays with the boat.",
    ],
    [
      "8afa47c4-4f3b-41ec-b834-4329f9c76fc6",
      "The Dune Ghost",
      "By nightfall, John Darwin was officially dead.",
    ],
  ];
  return {
    story: { id: TIDE, title: "The Vanishing Tide" },
    scenes: rows.map(([generation_id, title, narration], i) => ({
      id: `tide-scene-${i + 1}`,
      scene_number: i + 1,
      title,
      narration,
      generation_id,
    })),
    generations: rows.map(([id]) => gen(id, TIDE)),
  };
}

const errors = (m: ReturnType<typeof buildFilmManifest>) =>
  m.issues.filter((i) => i.severity === "error").map((i) => `${i.code}@${i.scene_number}`);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe("buildFilmManifest — the two finished films", () => {
  it("QA Homecoming: five clips in scene order, the linked take only, ready", () => {
    const m = buildFilmManifest(qaHomecoming());
    expect(m.ready).toBe(true);
    expect(errors(m)).toEqual([]);
    expect(m.subject).toEqual({ type: "film", story_id: QA });
    expect(m.segments.map((s) => s.scene_number)).toEqual([1, 2, 3, 4, 5]);
    expect(m.segments.map((s) => s.clip_path)).toEqual([
      `${QA_TAKES.s1}.mp4`,
      `${QA_TAKES.s2}.mp4`,
      `${QA_TAKES.s3}.mp4`,
      `${QA_TAKES.s4}.mp4`,
      `${QA_TAKES.s5}.mp4`,
    ]);
    const used = m.segments.map((s) => s.generation_id);
    expect(used).not.toContain(QA_TAKES.s1_unused);
    expect(used).not.toContain(QA_TAKES.s2_unused);
    expect(m.segments.map((s) => s.title)).toEqual(QA_TITLES);
    expect(m.totals).toEqual({
      segments: 5,
      expected_duration_ms: 5 * DEFAULT_CLIP_MS,
      with_voice: 0,
      with_narration: 0,
    });
    expect(m.segments.map((s) => s.expected_start_ms)).toEqual([0, 5000, 10000, 15000, 20000]);
    expect(m.clip_bucket).toBe("videos");
    expect(m.aspect_ratio).toBe("9:16");
  });

  it("QA Homecoming: no narration is one warning, never a blocker", () => {
    const m = buildFilmManifest(qaHomecoming());
    expect(m.issues.map((i) => [i.code, i.severity])).toEqual([["no_narration", "warning"]]);
    expect(m.segments.every((s) => s.narration === null)).toBe(true);
  });

  it("The Vanishing Tide: four clips with narration for subtitles", () => {
    const m = buildFilmManifest(vanishingTide());
    expect(m.ready).toBe(true);
    expect(m.issues).toEqual([]);
    expect(m.totals.segments).toBe(4);
    expect(m.totals.with_narration).toBe(4);
    expect(m.totals.expected_duration_ms).toBe(20_000);
    expect(m.segments[3]?.narration).toBe("By nightfall, John Darwin was officially dead.");
  });
});

describe("buildFilmManifest — order, gaps and broken clips", () => {
  it("sorts scenes by number whatever order the rows arrive in", () => {
    const input = qaHomecoming();
    const m = buildFilmManifest({ ...input, scenes: [...input.scenes].reverse() });
    expect(m.segments.map((s) => s.scene_number)).toEqual([1, 2, 3, 4, 5]);
    expect(m.segments.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("a scene without a clip blocks assembly and is named; the rest is still listed", () => {
    const input = qaHomecoming();
    const scenes = input.scenes.map((s) =>
      s.scene_number === 3 ? { ...s, generation_id: null } : s,
    );
    const m = buildFilmManifest({ ...input, scenes });
    expect(m.ready).toBe(false);
    expect(errors(m)).toEqual(["scene_not_rendered@3"]);
    expect(m.segments.map((s) => s.scene_number)).toEqual([1, 2, 4, 5]);
  });

  it.each([
    ["processing", "clip_not_ready"],
    ["queued", "clip_not_ready"],
    ["failed", "clip_not_ready"],
  ])("a %s clip is not used (%s)", (status, code) => {
    const input = qaHomecoming();
    const generations = input.generations.map((g) => (g.id === QA_TAKES.s4 ? { ...g, status } : g));
    expect(errors(buildFilmManifest({ ...input, generations }))).toEqual([`${code}@4`]);
  });

  it("a linked generation that no longer exists is reported", () => {
    const input = qaHomecoming();
    const generations = input.generations.filter((g) => g.id !== QA_TAKES.s5);
    expect(errors(buildFilmManifest({ ...input, generations }))).toEqual(["generation_missing@5"]);
  });

  it("a clip from another film is never spliced in", () => {
    const input = qaHomecoming();
    const generations = input.generations.map((g) =>
      g.id === QA_TAKES.s2 ? { ...g, story_id: TIDE } : g,
    );
    expect(errors(buildFilmManifest({ ...input, generations }))).toEqual([
      "generation_other_film@2",
    ]);
  });

  it("a completed generation without a stored clip is reported", () => {
    const input = qaHomecoming();
    const generations = input.generations.map((g) =>
      g.id === QA_TAKES.s1 ? { ...g, video_url: null } : g,
    );
    expect(errors(buildFilmManifest({ ...input, generations }))).toEqual(["clip_path_missing@1"]);
  });

  it.each([
    "https://evil.example.com/x.mp4",
    "../secrets/x.mp4",
    "/etc/x.mp4",
    "clip.mov",
    "folder\\clip.mp4",
    " ",
  ])("refuses a clip path the worker must not fetch: %j", (video_url) => {
    const input = qaHomecoming();
    const generations = input.generations.map((g) =>
      g.id === QA_TAKES.s1 ? { ...g, video_url } : g,
    );
    const m = buildFilmManifest({ ...input, generations });
    expect(m.ready).toBe(false);
    expect(m.segments.some((s) => s.scene_number === 1)).toBe(false);
  });

  it("keeps a valid voice-over and skips an unsafe one with a warning", () => {
    const input = qaHomecoming();
    const generations = input.generations.map((g) =>
      g.id === QA_TAKES.s1
        ? { ...g, voiceover_url: `${g.id}-voice.mp3` }
        : g.id === QA_TAKES.s2
          ? { ...g, voiceover_url: "https://cdn.example.com/v.mp3" }
          : g,
    );
    const m = buildFilmManifest({ ...input, generations });
    expect(m.ready).toBe(true);
    expect(m.segments[0]?.voice_path).toBe(`${QA_TAKES.s1}-voice.mp3`);
    expect(m.segments[1]?.voice_path).toBeNull();
    expect(m.totals.with_voice).toBe(1);
    expect(m.issues.find((i) => i.code === "voice_path_invalid")?.scene_number).toBe(2);
  });

  it("two scenes with the same number block assembly", () => {
    const input = qaHomecoming();
    const scenes = input.scenes.map((s) => (s.scene_number === 2 ? { ...s, scene_number: 1 } : s));
    expect(errors(buildFilmManifest({ ...input, scenes }))).toEqual(["duplicate_scene_number@1"]);
  });

  it("a film with no scenes is not ready", () => {
    const m = buildFilmManifest({ story: { id: QA, title: "Empty" }, scenes: [], generations: [] });
    expect(m.ready).toBe(false);
    expect(errors(m)).toEqual(["no_scenes@null"]);
  });

  it("reports partly missing narration per scene", () => {
    const input = vanishingTide();
    const scenes = input.scenes.map((s) => (s.scene_number === 2 ? { ...s, narration: "   " } : s));
    const m = buildFilmManifest({ ...input, scenes });
    expect(m.ready).toBe(true);
    expect(m.issues.map((i) => `${i.code}@${i.scene_number}`)).toEqual(["narration_missing@2"]);
  });

  it("every issue message is bilingual", () => {
    const input = qaHomecoming();
    const scenes = input.scenes.map((s) =>
      s.scene_number === 3 ? { ...s, generation_id: null } : s,
    );
    for (const i of buildFilmManifest({ ...input, scenes }).issues)
      expect(i.message).toContain(" / ");
  });
});

describe("buildFilmManifest — purity, privacy and spoilers", () => {
  it("never mutates its inputs", () => {
    const input = deepFreeze(qaHomecoming());
    expect(() => buildFilmManifest(input)).not.toThrow();
  });

  it("carries no Scene Truth, owner, billing or provider job data", () => {
    const input = qaHomecoming();
    // Rows read with extra columns must not leak through.
    const leaky = {
      story: { ...input.story, user_id: "owner-1", blueprint: "the twist is…" },
      scenes: input.scenes.map((s) => ({
        ...s,
        truth: { twist: "She was dead all along", reveal: "x", foreshadowing: "y" },
      })),
      generations: input.generations.map((g) => ({
        ...g,
        fal_request_id: "job-1",
        coins_spent: 14,
        charged_paid: 14,
        user_id: "owner-1",
        prompt_final: "secret prompt",
      })),
    };
    const json = JSON.stringify(buildFilmManifest(leaky));
    for (const forbidden of [
      "truth",
      "twist",
      "reveal",
      "foreshadowing",
      "blueprint",
      "user_id",
      "fal_request_id",
      "coins_spent",
      "charged_paid",
      "prompt_final",
      "She was dead all along",
      "secret prompt",
      "owner-1",
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });
});

describe("manifestHash", () => {
  it("is a 64-character hex SHA-256 and stable for the same cut", async () => {
    const a = await manifestHash(buildFilmManifest(qaHomecoming()));
    const input = qaHomecoming();
    const b = await manifestHash(
      buildFilmManifest({
        ...input,
        scenes: [...input.scenes].reverse(),
        generations: [...input.generations].reverse(),
      }),
    );
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a);
  });

  it("changes when a scene uses another take, not when the film is renamed", async () => {
    const base = await manifestHash(buildFilmManifest(qaHomecoming()));
    const renamed = qaHomecoming();
    expect(
      await manifestHash(
        buildFilmManifest({ ...renamed, story: { ...renamed.story, title: "New" } }),
      ),
    ).toBe(base);
    const retake = qaHomecoming();
    const scenes = retake.scenes.map((s) =>
      s.scene_number === 1 ? { ...s, generation_id: QA_TAKES.s1_unused } : s,
    );
    expect(await manifestHash(buildFilmManifest({ ...retake, scenes }))).not.toBe(base);
  });

  it("canonicalJson sorts keys at every level", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}',
    );
  });
});

describe("combineManifests — episodes of several films", () => {
  const episode = {
    drama_id: "00000000-0000-4000-8000-000000005701",
    episode_number: 1,
    title: "Episode 1",
  };

  it("joins films in the given order with one continuous timeline", () => {
    const m = combineManifests(
      [buildFilmManifest(qaHomecoming()), buildFilmManifest(vanishingTide())],
      episode,
    );
    expect(m.ready).toBe(true);
    expect(m.subject).toEqual({ type: "episode", drama_id: episode.drama_id, episode_number: 1 });
    expect(m.story_ids).toEqual([QA, TIDE]);
    expect(m.totals.segments).toBe(9);
    expect(m.segments.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(m.segments[5]).toMatchObject({
      story_id: TIDE,
      scene_number: 1,
      expected_start_ms: 25_000,
    });
    expect(m.totals.expected_duration_ms).toBe(45_000);
  });

  it("one unfinished scene keeps the episode from assembling and says where", () => {
    const tide = vanishingTide();
    const generations = tide.generations.map((g, i) =>
      i === 2 ? { ...g, status: "processing" } : g,
    );
    const m = combineManifests(
      [buildFilmManifest(qaHomecoming()), buildFilmManifest({ ...tide, generations })],
      episode,
    );
    expect(m.ready).toBe(false);
    expect(m.issues.find((i) => i.severity === "error")).toMatchObject({
      code: "clip_not_ready",
      story_id: TIDE,
      scene_number: 3,
    });
  });

  it("an episode needs at least one film", () => {
    const m = combineManifests([], episode);
    expect(m.ready).toBe(false);
    expect(m.issues.map((i) => i.code)).toEqual(["no_films"]);
  });

  it("supports long episodes: 24 films of 5 scenes = 10 minutes", () => {
    const films = Array.from({ length: 24 }, (_, f) => {
      const story = `film-${f}`;
      const ids = Array.from({ length: 5 }, (_, s) => `g-${f}-${s}`);
      return buildFilmManifest({
        story: { id: story, title: `Part ${f + 1}` },
        scenes: ids.map((generation_id, s) => ({
          id: `s-${f}-${s}`,
          scene_number: s + 1,
          title: null,
          narration: "Line.",
          generation_id,
        })),
        generations: ids.map((id) => gen(id, story)),
      });
    });
    const m = combineManifests(films, episode);
    expect(m.ready).toBe(true);
    expect(m.totals.segments).toBe(120);
    expect(m.totals.expected_duration_ms).toBe(10 * 60 * 1000);
    expect(m.segments.at(-1)?.expected_start_ms).toBe(10 * 60 * 1000 - DEFAULT_CLIP_MS);
  });

  it(`refuses more than ${MAX_SEGMENTS} clips in one cut`, () => {
    const story = "huge";
    const ids = Array.from({ length: MAX_SEGMENTS + 1 }, (_, i) => `g-${i}`);
    const m = buildFilmManifest({
      story: { id: story, title: "Huge" },
      scenes: ids.map((generation_id, i) => ({
        id: `s-${i}`,
        scene_number: i + 1,
        title: null,
        narration: null,
        generation_id,
      })),
      generations: ids.map((id) => gen(id, story)),
    });
    expect(m.ready).toBe(false);
    expect(m.issues.some((i) => i.code === "too_many_segments")).toBe(true);
  });
});

describe("loadFilmManifest — read-only loader over an injected reader", () => {
  function fakeReader(data = qaHomecoming()) {
    const calls: string[] = [];
    const reader: ManifestReader = {
      async story(id) {
        calls.push(`story:${id}`);
        return id === data.story.id ? data.story : null;
      },
      async scenes(id) {
        calls.push(`scenes:${id}`);
        return id === data.story.id ? data.scenes : [];
      },
      async generations(ids) {
        calls.push(`generations:${ids.length}`);
        return data.generations.filter((g) => ids.includes(g.id));
      },
    };
    return { reader, calls };
  }

  it("asks only for the linked clips and builds the same manifest", async () => {
    const { reader, calls } = fakeReader();
    const m = await loadFilmManifest(QA, reader);
    expect(m).toEqual(buildFilmManifest(qaHomecoming()));
    expect(calls).toEqual([`story:${QA}`, `scenes:${QA}`, "generations:5"]);
  });

  it("an unknown film is a clear not-found, with no further reads", async () => {
    const { reader, calls } = fakeReader();
    await expect(
      loadFilmManifest("00000000-0000-4000-8000-000000000000", reader),
    ).rejects.toBeInstanceOf(FilmNotFoundError);
    expect(calls).toHaveLength(1);
  });
});

describe("Auto Engine source guards", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

  it("the manifest endpoint is admin-only, checked on the server before any read", () => {
    const fn = read("src/lib/auto-engine/manifest.functions.ts");
    expect(fn).toContain("requireSupabaseAuth");
    expect(fn).toMatch(
      /rpc\("has_role", \{\s*_user_id: context\.userId,\s*_role: "admin",?\s*\}\)/,
    );
    expect(fn.indexOf("isAdmin !== true")).toBeLessThan(fn.indexOf("loadFilmManifest("));
    // The service-role module is only loaded inside the handler, never bundled for the browser.
    expect(fn).not.toMatch(/^import .*manifest\.server/m);
    expect(fn).not.toMatch(/client\.server/);
  });

  it("the manifest code never calls a provider, spends credits or writes", () => {
    for (const path of [
      "src/lib/auto-engine/manifest.ts",
      "src/lib/auto-engine/manifest.server.ts",
      "src/lib/auto-engine/manifest.functions.ts",
    ]) {
      const src = read(path);
      expect(src).not.toMatch(
        /fetch\(|submitVideo|spend_coins|refund_coins|\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.storage\b/,
      );
      expect(src).not.toMatch(/SERVICE_ROLE_KEY|LOVABLE_API_KEY|FAL_KEY/);
    }
  });
});
