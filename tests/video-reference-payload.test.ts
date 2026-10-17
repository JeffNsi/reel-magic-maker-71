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

  it("rejects foreign image sources before any network or video call", async () => {
    vi.stubEnv("SUPABASE_URL", origin);
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    await expect(
      submitVideo("lovable", "Scene", true, ["https://foreign.example/image.png"]),
    ).rejects.toThrow("Invalid reference image source");
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects unreadable references without submitting a paid job", async () => {
    vi.stubEnv("SUPABASE_URL", origin);
    const transport = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", transport);
    await expect(submitVideo("lovable", "Scene", true, [reference])).rejects.toThrow(
      "could not be read",
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("rejects more than 10 images without silently dropping references", async () => {
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    await expect(submitVideo("lovable", "Scene", true, Array(11).fill(reference))).rejects.toThrow(
      "At most 10",
    );
    expect(transport).not.toHaveBeenCalled();
  });
});
