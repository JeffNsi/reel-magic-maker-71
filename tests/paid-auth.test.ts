import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Source-text checks: every paid gateway call requires a signed-in caller. */
const read = (p: string) => readFileSync(p, "utf8");
function fn(src: string, name: string) {
  const i = src.indexOf(`export const ${name} = createServerFn`);
  expect(i).toBeGreaterThan(-1);
  return src.slice(i, i + 900);
}

describe("paid calls require auth (source)", () => {
  const story = read("src/lib/story.functions.ts");
  const film = read("src/lib/film.functions.ts");
  const canon = read("src/lib/canon.functions.ts");
  const shorts = read("src/lib/storyreel.functions.ts");

  it.each([
    [story, "generateScene"],
    [story, "narrateGeneration"],
    [story, "writeStoryPack"],
    [film, "reviewScenes"],
    [shorts, "generateStory"],
    [canon, "generateCanonAsset"],
    [read("src/lib/film-render.functions.ts"), "startFilmRender"],
  ])("%#", (src, name) => {
    expect(fn(src, name)).toContain(".middleware([requireSupabaseAuth])");
  });

  it("film-scoped calls check the stored owner", () => {
    expect(fn(film, "reviewScenes")).toContain("assertFilmOwner(");
    expect(fn(canon, "generateCanonAsset")).toContain("assertFilmOwner(");
    expect(fn(story, "narrateGeneration")).toContain("assertFilmOwner(");
    const core = story.slice(story.indexOf("export async function generateSceneCore"));
    expect(core).toContain("assertFilmOwner(data.story_id, data.session_id, data.user_id)");
  });

  it("studio generateScene goes through the same charged path", () => {
    const core = story.slice(story.indexOf("export async function generateSceneCore"));
    expect(core).toContain("withCharge(");
    expect(core).toContain("sceneCostFor(data.engine)");
    expect(core.indexOf("withCharge(")).toBeLessThan(core.indexOf("startGeneration({"));
  });

  it("pipeline audit passes an explicit user_id to buildFilmCore", () => {
    const audit = read("src/routes/api/internal/pipeline-audit.ts");
    expect(audit).toContain("user_id: z.string().uuid().optional()");
    expect(audit).toMatch(/buildFilmCore\([\s\S]*?input\.user_id,\s*\)/);
  });

  it("cron tick is guarded by the cron secret", () => {
    const route = read("src/routes/api/public/hooks/film-tick.ts");
    expect(route).toContain("authenticateCronRequest(request)");
  });
});
