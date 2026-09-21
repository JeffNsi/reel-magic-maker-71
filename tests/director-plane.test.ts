import { describe, expect, it } from "vitest";

import { getModel } from "@/generation/catalog";
import {
  HOUSE_ASPECT,
  HOUSE_DURATION,
  compileScenePlane,
  formatNotesFor,
  missingRequiredPacks,
  pickModelForScene,
} from "@/lib/director-plane";
import { resolveSceneReferences, type ResolverCanon } from "@/lib/reference-resolver";
import { buildGenerationRequest, emptySceneTruth, mergeSceneTruth } from "@/lib/scene-truth";

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
        face: "sharp cheekbones",
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
    style_assets: [image("style-frame-1"), image("style-frame-2")],
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
    ],
    ...overrides,
  };
}

const truth = mergeSceneTruth(emptySceneTruth(), {
  action: "She steps into the hallway and stops",
  setting: "a narrow apartment hallway",
});

const ctx = {
  style_prefix: "Cinematic, 35mm",
  original_idea: "A woman finds a note",
  scene_number: 1,
  scene_title: "Arrival",
  cast: "Amara: cropped black hair",
  film_setting: "a narrow apartment hallway",
  film_continuity: truth.continuity,
};

function compile(modelId: string, refs = resolveSceneReferences(canon(), 1)) {
  return compileScenePlane({ modelId, truth, ctx, references: refs, filmStyle: "cinematic" });
}

describe("model choice", () => {
  it("picks an image-reading model for a scene that has canonical references", () => {
    const pick = pickModelForScene(resolveSceneReferences(canon(), 1));
    const entry = getModel(pick.id);
    expect(entry?.roles["reference"]).toBeGreaterThan(0);
    expect(pick.reason).toContain("reference images");
  });

  it("says plainly when there are no references and identity is not locked by image", () => {
    const pick = pickModelForScene(null);
    expect(pick.id).toBeTruthy();
    expect(pick.reason).toContain("no reference images");
  });

  it("only picks models that declare the house format", () => {
    const pick = pickModelForScene(resolveSceneReferences(canon(), 1));
    const entry = getModel(pick.id)!;
    expect(formatNotesFor(entry)).toEqual([]);
  });
});

describe("compileScenePlane", () => {
  it("is deterministic", () => {
    expect(compile("kling-o3")).toEqual(compile("kling-o3"));
  });

  it("uses the one existing prompt compiler, never a second builder", () => {
    const refs = resolveSceneReferences(canon(), 1);
    const compiled = compile("kling-o3", refs);
    expect(compiled?.plane.prompt.text).toBe(
      buildGenerationRequest(truth, ctx, { references: refs }),
    );
  });

  it("asks for the house format where the model declares it", () => {
    const compiled = compile("kling-o3");
    expect(compiled?.plane.settings["aspectRatio"]).toBe(HOUSE_ASPECT);
    expect(compiled?.plane.settings["duration"]).toBe(HOUSE_DURATION);
    expect(compiled?.format.vertical).toBe(true);
  });

  it("passes references in resolver order and names the ones that did not fit", () => {
    const compiled = compile("kling-o1");
    const cap = getModel("kling-o1")!.roles["reference"]!;
    expect(compiled?.plane.media["reference"]).toHaveLength(cap);
    expect(compiled?.references[0]?.label).toContain("AMARA_01");
    expect(compiled?.omitted.length).toBeGreaterThan(0);
    expect(compiled?.omitted[0]?.reason).toContain("accepts");
  });

  it("gives the opening frame to the environment plate when the model takes one", () => {
    const compiled = compile("kling-o3");
    const start = compiled?.plane.media["start"]?.[0]?.url;
    expect(start).toBe("https://example.test/detail-v1.png");
  });

  it("falls back to text only, unchanged, on a model that cannot read images", () => {
    const refs = resolveSceneReferences(canon(), 1);
    const compiled = compile("kling-3-pro", refs);
    expect(compiled?.image_conditioned).toBe(false);
    expect(compiled?.plane.media["reference"]).toBeUndefined();
    expect(compiled?.plane.prompt.text).toBe(buildGenerationRequest(truth, ctx, {}));
  });

  it("does not block a scene whose packs exist", () => {
    expect(compile("kling-o3")?.gate.allowed).toBe(true);
  });

  it("blocks and names the missing pack when a scene's character has no images", () => {
    const bare = canon();
    const refs = resolveSceneReferences(
      {
        ...bare,
        characters: [{ ...bare.characters[0]!, reference_assets: [] }],
      },
      1,
    );
    const compiled = compile("kling-o3", refs);
    expect(compiled?.gate.allowed).toBe(false);
    expect(compiled?.gate.missing.join(" ")).toContain("AMARA_01");
  });

  it("reports the honest format limits of a model outside the house shape", () => {
    const wide = getModel("kling-o3")!;
    expect(formatNotesFor(wide)).toEqual([]);
    expect(missingRequiredPacks(null)).toEqual([]);
  });

  it("returns nothing for a model that is not in the catalogue", () => {
    expect(compile("not-a-model")).toBeNull();
  });
});
