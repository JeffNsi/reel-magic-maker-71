import { z } from "zod";

export const characterTraits = ["face", "hair", "skin", "body", "height", "build"] as const;
export const characterInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000),
  traits: z.object({
    face: z.string().trim().max(200),
    hair: z.string().trim().max(200),
    skin: z.string().trim().max(200),
    body: z.string().trim().max(200),
    height: z.string().trim().max(100),
    build: z.string().trim().max(200),
  }),
});
export type CharacterInput = z.infer<typeof characterInput>;
export type LibraryCharacter = CharacterInput & {
  reference_path: string | null;
  reference_url: string | null;
};
export const MAX_CHARACTER_IMAGE_BYTES = 6 * 1024 * 1024;

export function validateCharacterImage(bytes: Uint8Array, type: string) {
  if (!bytes.length || bytes.length > MAX_CHARACTER_IMAGE_BYTES)
    throw new Error("Image must be under 6 MB. / Bilden måste vara under 6 MB.");
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(
    (type === "image/png" && png) ||
    (type === "image/jpeg" && jpeg) ||
    (type === "image/webp" && webp)
  )) {
    throw new Error("Choose a PNG, JPEG or WebP image. / Välj en PNG-, JPEG- eller WebP-bild.");
  }
}
