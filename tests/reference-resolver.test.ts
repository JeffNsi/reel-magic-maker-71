import { describe, expect, it } from "vitest";

import {
  referenceImageUrls,
  resolveSceneReferences,
  shotTypeFor,
  type ResolverCanon,
} from "@/lib/reference-resolver";
import { buildGenerationRequest, emptySceneTruth, mergeSceneTruth } from "@/lib/scene-truth";
import { PROVIDER_ACCEPTS_IMAGE_REFERENCES, REFERENCE_WEIGHT } from "@/lib/storyreel-core.server";

const image = (kind: string, version = 1) => ({
  kind,
  storage_path: `path/${kind}-v${version}.png`,
  version,
  url: `https://example.test/${kind}-v${version}.png`,
});

const CHARACTER_KINDS = [
  "front",
  "three-quarter-left",
  "three-quarter-right",
  "profile",
  "full-body",
  "close-up",
];

function canon(overrides: Partial<ResolverCanon> = {}): ResolverCanon {
  return {
    characters: [
      {
        canonical_id: "AMARA_01",
        name: "Amara",
        face: "sharp cheekbones, freckles",
        hair: "black, cropped",
        skin: "deep brown",
        body: "slim",
        height: "168 cm",
        build: "narrow shoulders",
        locks: { identity: true, face: true, hair: true, skin: true, body: true },
        reference_assets: CHARACTER_KINDS.map((kind) => image(kind)),
      },
    ],
    environments: [
      {
        canonical_id: "AMARA_APARTMENT_01",
        name: "Amara's apartment",
        reference_assets: [image("wide"), image("detail"), image("lighting")],
      },
    ],
    style_assets: [image("style-frame-1"), image("style-frame-2"), image("style-frame-3")],
    scenes: [
      {
        scene_id: "s1",
        scene_number: 1,
        title: "Arrival",
        characters: ["AMARA_01"],
        environment_id: "AMARA_APARTMENT_01",
        camera: "medium shot, dialogue",
        wardrobe: "grey coat",
        props: ["PHONE_01"],
        location: "AMARA_APARTMENT_01",
      },
      {
        scene_id: "s2",
        scene_number: 2,
        title: "The note",
        characters: ["AMARA_01"],
        environment_id: "AMARA_APARTMENT_01",
        camera: "extreme close-up of the note",
        wardrobe: "grey coat",
        props: [],
        location: "AMARA_APARTMENT_01",
      },
      {
        scene_id: "s3",
        scene_number: 3,
        title: "The street",
        characters: ["AMARA_01"],
        environment_id: "AMARA_APARTMENT_01",
        camera: "wide establishing shot",
        wardrobe: null,
        props: [],
        location: null,
      },
      {
        scene_id: "s4",
        scene_number: 4,
        title: "Behind her",
        characters: ["AMARA_01"],
        environment_id: "AMARA_APARTMENT_01",
        camera: "over-the-shoulder, camera right",
        wardrobe: null,
        props: [],
        location: null,
      },
      {
        scene_id: "s5",
        scene_number: 5,
        title: "No camera line",
        characters: ["AMARA_01"],
        environment_id: null,
        camera: null,
        wardrobe: null,
        props: [],
        location: null,
      },
    ],
    ...overrides,
  };
}

describe("shot type", () => {
  it("reads the four shot types from the camera line", () => {
    expect(shotTypeFor("extreme close-up")).toBe("close-up");
    expect(shotTypeFor("medium two-shot")).toBe("medium");
    expect(shotTypeFor("wide establishing")).toBe("wide");
    expect(shotTypeFor("over-the-shoulder")).toBe("profile");
  });
});

describe("resolveSceneReferences", () => {
  it("close-up picks close-up + front", () => {
    const refs = resolveSceneReferences(canon(), 2);
    expect(refs?.characters[0]?.images.map((i) => i.kind)).toEqual(["close-up", "front"]);
    expect(refs?.mode).toBe("image-conditioned");
  });

  it("medium picks front + three-quarter, defaulting to left and saying so", () => {
    const refs = resolveSceneReferences(canon(), 1);
    expect(refs?.characters[0]?.images.map((i) => i.kind)).toEqual(["front", "three-quarter-left"]);
    expect(refs?.characters[0]?.reason).toContain("default");
  });

  it("wide picks full body plus the location wide plate", () => {
    const refs = resolveSceneReferences(canon(), 3);
    expect(refs?.characters[0]?.images.map((i) => i.kind)).toEqual(["full-body"]);
    expect(refs?.environment?.images.map((i) => i.kind)).toEqual(["wide"]);
  });

  it("profile follows the stated screen direction", () => {
    const refs = resolveSceneReferences(canon(), 4);
    expect(refs?.characters[0]?.images.map((i) => i.kind)).toEqual([
      "profile",
      "three-quarter-right",
    ]);
    expect(refs?.screenDirection).toBe("right");
  });

  it("a missing camera field defaults to medium and three-quarter left", () => {
    const refs = resolveSceneReferences(canon(), 5);
    expect(refs?.shotType).toBe("medium");
    expect(refs?.screenDirection).toBe("left");
  });

  it("an empty canon resolves text-only and blocks nothing", () => {
    const empty = canon({ characters: [], environments: [], style_assets: [] });
    const refs = resolveSceneReferences(empty, 1);
    expect(refs?.mode).toBe("text-only");
    expect(refs?.missing).toContain("AMARA_01 is not in canon");
    expect(referenceImageUrls(refs)).toEqual([]);
  });

  it("a partial pack resolves with what exists and reports the rest", () => {
    const partial = canon({
      characters: [
        {
          ...canon().characters[0]!,
          reference_assets: [image("front"), image("close-up")],
        },
      ],
    });
    const refs = resolveSceneReferences(partial, 1);
    expect(refs?.characters[0]?.images.map((i) => i.kind)).toEqual(["front"]);
    expect(refs?.missing).toContain("AMARA_01 three-quarter-left");
    expect(refs?.mode).toBe("image-conditioned");
  });

  it("caps style references at two, appended last", () => {
    const refs = resolveSceneReferences(canon(), 1);
    expect(refs?.style).toHaveLength(2);
    const urls = referenceImageUrls(refs);
    expect(urls.slice(-2)).toEqual(refs?.style.map((i) => i.url));
  });

  it("is deterministic and does not mutate its input", () => {
    const input = canon();
    const snapshot = JSON.stringify(input);
    const a = resolveSceneReferences(input, 1);
    const b = resolveSceneReferences(canon(), 1);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("carries the previous scene status forward", () => {
    const refs = resolveSceneReferences(canon(), 2);
    expect(refs?.previousSceneStatus).toContain("wardrobe: grey coat");
  });

  it("returns null for a scene number the film does not have", () => {
    expect(resolveSceneReferences(canon(), 99)).toBeNull();
  });
});

describe("prompt compiler", () => {
  const truth = mergeSceneTruth(emptySceneTruth(), {
    emotional_core: "She realises she is being watched",
    what_must_survive: "The note in her hand",
    chosen_execution: "Close-up on the note, then her eyes",
    action: "She unfolds the note",
    setting: "Her apartment at dusk",
  });
  const ctx = {
    style_prefix: "Cinematic.",
    original_idea: "A woman is followed",
    scene_number: 2,
    scene_title: "The note",
    cast: "Amara: tall, black cropped hair",
    film_setting: "Her apartment",
    film_continuity: "The note never changes",
  };

  it("text-only mode is byte-identical to no references at all", () => {
    const empty = canon({ characters: [], environments: [], style_assets: [] });
    const refs = resolveSceneReferences(empty, 2);
    expect(refs?.mode).toBe("text-only");
    expect(buildGenerationRequest(truth, ctx, { references: refs })).toBe(
      buildGenerationRequest(truth, ctx),
    );
  });

  it("image-conditioned mode adds the identity and previous-scene blocks", () => {
    const refs = resolveSceneReferences(canon(), 2);
    const prompt = buildGenerationRequest(truth, ctx, { references: refs });
    expect(prompt).toContain("IDENTITY LOCK AMARA_01");
    expect(prompt).toContain("PREVIOUS SCENE STATUS:");
    expect(prompt).not.toBe(buildGenerationRequest(truth, ctx));
  });

  it("a character with no reference images is never told to match images", () => {
    const styleOnly = canon({
      characters: [
        {
          ...canon().characters[0]!,
          reference_assets: [],
        },
      ],
      environments: [],
    });
    const refs = resolveSceneReferences(styleOnly, 2);
    expect(refs?.mode).toBe("image-conditioned");
    const prompt = buildGenerationRequest(truth, ctx, { references: refs });
    expect(prompt).not.toContain("IDENTITY LOCK");
  });
});

describe("provider adapter", () => {
  it("only the existing image-capable provider accepts references", () => {
    expect(PROVIDER_ACCEPTS_IMAGE_REFERENCES.lovable).toBe(true);
    expect(PROVIDER_ACCEPTS_IMAGE_REFERENCES.fal).toBe(false);
    expect(PROVIDER_ACCEPTS_IMAGE_REFERENCES.live).toBe(false);
  });

  it("reference weight is a named constant", () => {
    expect(typeof REFERENCE_WEIGHT).toBe("number");
  });
});
