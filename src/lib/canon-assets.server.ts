/**
 * Reference-pack image generation (server only).
 *
 * One image per call, generated through the Lovable AI image model and returned
 * as raw bytes. Streaming is used so bytes keep flowing while the model works;
 * only the final complete image is kept. No timers abort the call.
 */

const BASE_URL = "https://ai.gateway.lovable.dev";
const MODEL = "openai/gpt-image-2.5-sunburst";

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pickImage(payload: unknown): string | null {
  const seen = new Set<unknown>();
  const walk = (node: unknown): string | null => {
    if (!node || typeof node !== "object" || seen.has(node)) return null;
    seen.add(node);
    const record = node as Record<string, unknown>;
    if (typeof record["b64_json"] === "string") return record["b64_json"];
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = walk(item);
          if (found) return found;
        }
      } else {
        const found = walk(value);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(payload);
}

/** Generate one reference image. Throws a user-readable error on gateway failure. */
export async function generateReferenceImage(prompt: string): Promise<Uint8Array> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Image generation isn't configured yet.");

  const res = await fetch(`${BASE_URL}/v1/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt, stream: true, partial_images: 1 }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    console.error("reference image failed", res.status, detail);
    if (res.status === 402) {
      throw new Error("This project is out of AI credits. Top them up to build reference packs.");
    }
    if (res.status === 429) {
      throw new Error("The image model is busy. Try again in a moment.");
    }
    throw new Error("The reference image could not be generated.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let latest: string | null = null;
  let failure: string | null = null;

  const handle = (chunk: string) => {
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      const record = parsed as Record<string, unknown>;
      if (record["error"]) {
        const error = record["error"] as Record<string, unknown>;
        failure = typeof error["message"] === "string" ? error["message"] : "Image generation failed.";
        continue;
      }
      const image = pickImage(parsed);
      if (image) latest = image;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) handle(part);
  }
  if (buffer) handle(buffer);

  if (!latest) throw new Error(failure ?? "The image model returned no picture.");
  return decodeBase64(latest);
}
