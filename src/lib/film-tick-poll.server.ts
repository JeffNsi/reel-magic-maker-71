/**
 * Path A: getFilm advances a film's scene jobs only when the caller's bearer
 * token belongs to the film's stored owner. Anonymous and non-owner reads
 * never touch jobs. Errors never reach getFilm's caller.
 */
export type TickDeps = {
  userFromToken: (token: string) => Promise<string | null>;
  ownerOf: (film_id: string) => Promise<string | null>;
  tick: (film_id: string) => Promise<unknown>;
};

async function defaultDeps(): Promise<TickDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { tickFilm } = await import("@/lib/scene-job.server");
  return {
    userFromToken: async (token) => {
      const { data } = await supabaseAdmin.auth.getUser(token);
      return data.user?.id ?? null;
    },
    ownerOf: async (film_id) => {
      const { data } = await supabaseAdmin
        .from("stories")
        .select("user_id")
        .eq("id", film_id)
        .maybeSingle();
      return (data?.user_id as string | null) ?? null;
    },
    tick: (film_id) => tickFilm(film_id),
  };
}

export async function ownerTickIfAllowed(
  film_id: string,
  authorization: string,
  deps?: TickDeps,
): Promise<boolean> {
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token || token.startsWith("sb_")) return false;
  const d = deps ?? (await defaultDeps());
  const user = await d.userFromToken(token);
  if (!user) return false;
  const owner = await d.ownerOf(film_id);
  if (!owner || owner !== user) return false;
  try {
    await d.tick(film_id);
  } catch (err) {
    console.info("film tick failed", err instanceof Error ? err.message : "unknown");
  }
  return true;
}
