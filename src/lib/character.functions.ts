import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  characterInput,
  validateCharacterImage,
  type LibraryCharacter,
} from "@/lib/character-library";

export const listCharacters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LibraryCharacter[]> => {
    const { data, error } = await context.supabase
      .from("characters")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Characters could not be loaded. / Karaktärerna kunde inte hämtas.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return Promise.all(
      (data ?? []).map(async (row) => {
        const parsed = characterInput.parse({
          ...row,
          traits: {
            face: "",
            hair: "",
            skin: "",
            body: "",
            height: "",
            build: "",
            ...(row.traits as Record<string, string>),
          },
        });
        const signed = row.reference_path
          ? await supabaseAdmin.storage.from("films").createSignedUrl(row.reference_path, 3600)
          : null;
        return {
          ...parsed,
          reference_path: row.reference_path,
          reference_url: signed?.data?.signedUrl ?? null,
        };
      }),
    );
  });

const saveInput = characterInput.extend({
  image: z
    .object({
      type: z.enum(["image/png", "image/jpeg", "image/webp"]),
      base64: z.string().max(9 * 1024 * 1024),
    })
    .optional(),
});
export const saveCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await context.supabase
      .from("characters")
      .select("id, reference_path")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    let path = existing?.reference_path ?? null;
    let uploaded: string | null = null;
    if (data.image) {
      const bytes = Uint8Array.from(atob(data.image.base64), (c) => c.charCodeAt(0));
      validateCharacterImage(bytes, data.image.type);
      path = `${context.userId}/characters/${data.id}/${crypto.randomUUID()}`;
      const { error } = await supabaseAdmin.storage
        .from("films")
        .upload(path, bytes, { contentType: data.image.type, upsert: false });
      if (error) throw new Error("Image could not be saved. / Bilden kunde inte sparas.");
      uploaded = path;
    }
    const row = {
      id: data.id,
      user_id: context.userId,
      name: data.name,
      description: data.description,
      traits: data.traits,
      reference_path: path,
      idempotency_key: data.id,
      updated_at: new Date().toISOString(),
    };
    const { error } = await context.supabase.from("characters").upsert(row, { onConflict: "id" });
    if (error) {
      if (uploaded) await supabaseAdmin.storage.from("films").remove([uploaded]);
      throw new Error(
        error.code === "23505"
          ? "You already have a character with that name. / Du har redan en karaktär med det namnet."
          : "Character could not be saved. / Karaktären kunde inte sparas.",
      );
    }
    return { id: data.id };
  });

export const deleteCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("characters")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Character could not be removed. / Karaktären kunde inte tas bort.");
    // References already copied into films remain available; library deletion never alters film canon.
    return { ok: true };
  });
