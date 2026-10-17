import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), load: vi.fn(), render: vi.fn(), from: vi.fn(), balance: 140 }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  let validate: (data: unknown) => unknown = data => data;
  const chain = {
    middleware: () => chain,
    inputValidator: (fn: typeof validate) => { validate = fn; return chain; },
    handler: (fn: (args: unknown) => unknown) => (args: { data: unknown; context: unknown }) => fn({ ...args, data: validate(args.data) }),
  };
  return chain;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/film.functions", () => ({ assertFilmOwner: mocks.owner, loadFilm: mocks.load, renderSceneCore: mocks.render }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.from } }));
import { startFilmRender } from "@/lib/film-render.functions";
const film_id = "d893842c-16fb-4416-ad8e-8714ef269dbb";
const session_id = "a4c962f6-17c3-4073-9719-2f61f441a135";
const invoke = (data: unknown) => (startFilmRender as unknown as (args: unknown) => Promise<{ started: string[]; status: string }>)({ data, context: { userId: "owner" } });
beforeEach(() => {
  vi.clearAllMocks(); mocks.balance = 140;
  mocks.owner.mockResolvedValue(undefined);
  mocks.load.mockResolvedValue({ scenes: Array.from({ length: 5 }, (_, i) => ({ id: `scene-${i + 1}`, status: "idle", video_url: null })) });
  mocks.render.mockResolvedValue({ generation_id: "mock-generation" });
  mocks.from.mockImplementation(() => {
    const query = { select: () => query, eq: () => query, update: () => query, maybeSingle: async () => ({ data: { bonus_coins: mocks.balance, paid_coins: 0 } }) };
    return query;
  });
});
describe("film start RPC wiring (mocked job and charge ports)", () => {
  it("five-scene QA input reaches five jobs on the authenticated owner", async () => {
    const result = await invoke({ film_id, session_id, engine: "lovable" });
    expect(result.started).toEqual(["scene-1", "scene-2", "scene-3", "scene-4", "scene-5"]);
    expect(mocks.owner).toHaveBeenCalledWith(film_id, session_id, "owner");
    expect(mocks.render).toHaveBeenCalledTimes(5);
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ film_id, session_id, engine: "lovable", user_id: "owner" }));
  });
  it("69 credits creates zero jobs for the five-scene 70-credit cost", async () => {
    mocks.balance = 69;
    expect((await invoke({ film_id, session_id })).status).toBe("needs_credits");
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it("a rejected owner check never creates a job", async () => {
    mocks.owner.mockRejectedValue(new Error("Not owner"));
    await expect(invoke({ film_id, session_id })).rejects.toThrow("Not owner");
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it("invalid click input fails before any job", async () => {
    await expect(invoke({ film_id, session_id: "invalid" })).rejects.toThrow();
    expect(mocks.render).not.toHaveBeenCalled();
  });
});