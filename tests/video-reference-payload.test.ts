import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_VIDEO_BASE, submitVideo } from "@/lib/storyreel-core.server";

const origin = "https://storage.example.test";
const reference = `${origin}/storage/v1/object/sign/films/owner/front.png?token=test`;
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("outgoing video reference payload (mocked transport only)", () => {
  it("sends reference bytes, not URLs, to the existing EZY video model", async () => {
    vi.stubEnv("SUPABASE_URL", origin);
    vi.stubEnv("LOVABLE_API_KEY", "mock-key");
    const transport = vi
      .fn()
      .mockResolvedValueOnce(new Response(png, { headers: { "content-type": "image/png" } }))
      .mockResolvedValueOnce(Response.json({ id: "mock-video-job" }));
    vi.stubGlobal("fetch", transport);
    expect(await submitVideo("lovable", "Scene action", false, [reference])).toBe("mock-video-job");
    expect(transport).toHaveBeenCalledTimes(2);
    const [url, init] = transport.mock.calls[1] ?? [];
    expect(url).toBe(AI_VIDEO_BASE);
    const payload = JSON.parse(init.body);
    expect(payload.model).toBe("google/gemini-omni-1.1-flash");
    expect(payload.input).toEqual([
      {
        type: "text",
        text: "Scene action No dialogue. No music. No sound effects — silent footage.",
      },
      { type: "image", mime_type: "image/png", data: "iVBORw0KGgo=" },
    ]);
    expect(JSON.stringify(payload)).not.toContain(reference);
    expect(payload.response_format.duration).toBe("5s");
    expect(payload.response_format.aspect_ratio).toBe("9:16");
  });

  it("preserves text-only input when no references exist", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "mock-key");
    const transport = vi.fn().mockResolvedValue(Response.json({ id: "mock-job" }));
    vi.stubGlobal("fetch", transport);
    await submitVideo("lovable", "Scene action", true);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.parse(transport.mock.calls[0]?.[1].body).input).toBe("Scene action");
  });

  it("never fetches foreign sources and continues with text only", async () => {
    vi.stubEnv("SUPABASE_URL", origin);
    vi.stubEnv("LOVABLE_API_KEY", "mock-key");
    const transport = vi.fn().mockResolvedValue(Response.json({ id: "mock-job" }));
    vi.stubGlobal("fetch", transport);
    const warning = vi.fn();
    await submitVideo("lovable", "Scene", true, ["https://foreign.example/image.png"], warning);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[0]).toBe(AI_VIDEO_BASE);
    expect(JSON.parse(transport.mock.calls[0]?.[1].body).input).toBe("Scene");
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("continues text-only and warns when a signed image is unreadable", async () => {
    vi.stubEnv("SUPABASE_URL", origin);
    vi.stubEnv("LOVABLE_API_KEY", "mock-key");
    const transport = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ id: "mock-job" }));
    vi.stubGlobal("fetch", transport);
    const warning = vi.fn();
    expect(await submitVideo("lovable", "Scene", true, [reference], warning)).toBe("mock-job");
    expect(transport).toHaveBeenCalledTimes(2);
    expect(JSON.parse(transport.mock.calls[1]?.[1].body).input).toBe("Scene");
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("caps inline images at 10 and warns rather than blocking", async () => {
    vi.stubEnv("SUPABASE_URL", origin);
    vi.stubEnv("LOVABLE_API_KEY", "mock-key");
    const transport = vi.fn(async (url) =>
      url === AI_VIDEO_BASE
        ? Response.json({ id: "mock-job" })
        : new Response(png, { headers: { "content-type": "image/png" } }),
    );
    vi.stubGlobal("fetch", transport);
    const warning = vi.fn();
    await submitVideo("lovable", "Scene", true, Array(11).fill(reference), warning);
    expect(transport).toHaveBeenCalledTimes(11);
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("keeps readable images in a partial pack even when another image fails", async () => {
    vi.stubEnv("SUPABASE_URL", origin);
    vi.stubEnv("LOVABLE_API_KEY", "mock-key");
    const transport = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(png, { headers: { "content-type": "image/png" } }))
      .mockResolvedValueOnce(Response.json({ id: "mock-job" }));
    vi.stubGlobal("fetch", transport);
    const warning = vi.fn();
    await submitVideo("lovable", "Scene", true, [reference, reference], warning);
    expect(JSON.parse(transport.mock.calls[2]?.[1].body).input).toHaveLength(2);
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("reports a missing pack even though text-only submission succeeds", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "mock-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: "mock-job" })));
    const warning = vi.fn();
    await submitVideo("lovable", "Scene", true, [], warning);
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("does not treat STRONG or LIVE as image-compatible", async () => {
    vi.stubEnv("FAL_KEY", "mock-key");
    const transport = vi.fn(async () => Response.json({ request_id: "mock-job" }));
    vi.stubGlobal("fetch", transport);
    for (const provider of ["fal", "live"] as const)
      await submitVideo(provider, "Scene", true, [reference]);
    expect(transport).toHaveBeenCalledTimes(2);
    for (const call of transport.mock.calls)
      expect(JSON.parse(call[1].body)).not.toHaveProperty("input");
  });
});
