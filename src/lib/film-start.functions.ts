import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { characterInput, type LibraryCharacter } from "@/lib/character-library";
import { approvedSceneTruth, filmStartInput } from "@/lib/film-start";

/** A free, explicit template path; uses the existing film + scene + canon contracts. No provider calls. */
export const saveApprovedFilm = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data: unknown) => filmStartInput.parse(data)).handler(async ({ data, context }) => {
  const { data: row, error } = await context.supabase.from("characters").select("*").eq("id", data.character_id).eq("user_id", context.userId).maybeSingle();
  if (error || !row) throw new Error("Choose one of your own characters. / Välj en av dina egna karaktärer.");
  const character: LibraryCharacter = { ...characterInput.parse({ ...row, traits: { face: "", hair: "", skin: "", body: "", height: "", build: "", ...(row.traits as Record<string, string>) } }), reference_path: row.reference_path, reference_url: null };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: filmId, error: saveError } = await supabaseAdmin.rpc("create_approved_character_film", {
    _user: context.userId, _session: data.session_id, _key: data.key, _character: character.id,
    _title: data.title, _idea: data.idea, _setting: data.setting, _style: data.style,
    _metadata: { genre: data.genre, audience: data.audience, length: data.length, scene_count: data.scenes.length, mode: "template", character_approved: true },
    _scenes: data.scenes.map((scene) => ({ ...scene, truth: approvedSceneTruth(scene, data, character) })),
  });
  if (saveError || !filmId) throw new Error(/Daily film limit/i.test(saveError?.message ?? "") ? "Daily film limit reached (3). / Dagens filmgräns är nådd (3)." : "The film could not be saved. Your draft is still here. / Filmen kunde inte sparas. Ditt utkast finns kvar.");
  return { film_id: filmId };
});