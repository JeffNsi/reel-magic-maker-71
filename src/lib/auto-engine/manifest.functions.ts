import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { manifestHash, type FilmManifest } from "@/lib/auto-engine/manifest";

export type FilmManifestResult =
  { allowed: false } | { allowed: true; manifest: FilmManifest; manifest_hash: string };

const input = z.object({ film_id: z.string().uuid() });

/**
 * Auto Engine: the assembly manifest for one film. Admin-only (checked
 * server-side) and read-only — it renders nothing, writes nothing and spends
 * no credits. Non-admins get `{ allowed: false }`, never film data.
 */
export const getFilmManifest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }): Promise<FilmManifestResult> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (isAdmin !== true) return { allowed: false };

    const { loadFilmManifest } = await import("@/lib/auto-engine/manifest.server");
    const manifest = await loadFilmManifest(data.film_id);
    return { allowed: true, manifest, manifest_hash: await manifestHash(manifest) };
  });
