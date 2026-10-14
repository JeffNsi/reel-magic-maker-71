import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Source-level checks: the RPC shells carry auth middleware, while the cores
 * (used by recovery, cron and the internal audit) carry none but check the
 * stored owner themselves.
 */
const film = readFileSync("src/lib/film.functions.ts", "utf8");
const recovery = readFileSync("src/lib/recovery.functions.ts", "utf8");
const audit = readFileSync("src/routes/api/internal/pipeline-audit.ts", "utf8");

function block(src: string, start: string, end: string) {
  const i = src.indexOf(start);
  expect(i).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf(end, i + start.length));
}

describe("render/recovery auth split", () => {
  it("renderScene shell is auth-protected and delegates to the core", () => {
    const shell = block(film, "export const renderScene", ");\n");
    expect(shell).toContain("requireSupabaseAuth");
    expect(shell).toContain("renderSceneCore({ ...data, user_id: context.userId })");
  });

  it("renderSceneCore has no middleware but checks the stored owner", () => {
    const core = block(film, "export async function renderSceneCore", "startGeneration");
    expect(core).not.toContain("middleware");
    expect(core).toContain("assertFilmOwner(data.film_id, data.session_id, data.user_id)");
  });

  it("approveRecovery rejects unauthenticated and non-owner calls", () => {
    const fn = block(recovery, "export const approveRecovery", "renderSceneCore(");
    expect(fn).toContain(".middleware([requireSupabaseAuth])");
    expect(fn).toContain("assertFilmOwner(data.film_id, data.session_id, context.userId)");
  });

  it("recoverScene reaches the render core without going through middleware", () => {
    const core = block(recovery, "export async function recoverSceneCore", "export const recoverScene");
    expect(core).toContain("assertFilmOwner(data.film_id, data.session_id, userId)");
    expect(core).toContain("renderSceneCore(");
    expect(core).not.toMatch(/\brenderScene\(/);
    const shell = block(recovery, "export const recoverScene", ");\n");
    expect(shell).toContain("requireSupabaseAuth");
  });

  it("internal audit uses the cores with the film's stored owner", () => {
    expect(audit).toContain("renderSceneCore(");
    expect(audit).toContain("recoverSceneCore(");
    expect(audit).not.toMatch(/\brenderScene\(\{/);
  });

  it("no session-based claim exists", () => {
    expect(film).not.toContain("claimLegacyStories");
    expect(film).not.toMatch(/update\(\{ user_id: userId \}\)/);
  });
});
