import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unlockWith } from "@/lib/episode-unlock";
import { claimCheckinWith, REWARD_MESSAGES } from "@/lib/rewards";

export type Profile = {
  id: string;
  email: string | null;
  paid_coins: number;
  bonus_coins: number;
  is_vip: boolean;
  vip_until: string | null;
  last_checkin_date: string | null;
  checkin_streak: number;
};

export type Balance = { paid_coins: number; bonus_coins: number };

async function fetchProfile(supabase: { from: (table: string) => any }) {
  const { data, error } = await supabase.from("profiles").select("*").single();
  if (error || !data) throw new Error("Could not load your profile.");
  return data as Profile;
}

// Coin balances and VIP flags can only be changed by the server: browser
// roles have no write access to profiles (migrations 0011 and 0012).

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Profile> => fetchProfile(context.supabase));

export const claimDailyCheckin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Profile & { reward: number }> => {
    // The streak, the once-per-day rule and the atomic credit are decided in
    // one database transaction (public.claim_daily_checkin, service role only).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return claimCheckinWith(
      (user, rewards) =>
        supabaseAdmin.rpc("claim_daily_checkin", { _user: user, _rewards: rewards }),
      context.userId,
    );
  });

/**
 * Ad rewards are paused: no ad provider verifies a viewing server-side yet, so
 * this endpoint never credits coins. A future reward must come from a provider
 * callback that is verified on the server and recorded once per event id in
 * reward_events — never from a request the browser can repeat.
 */
export const watchAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<Balance> => {
    throw new Error(REWARD_MESSAGES.ads_paused);
  });

const unlockInput = z.object({ episode_id: z.string().uuid() });

export const unlockEpisode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => unlockInput.parse(data))
  .handler(async ({ data, context }): Promise<Balance & { unlocked: boolean }> => {
    // Free access, VIP entitlement or the coin charge is decided and recorded
    // in one database transaction (public.unlock_episode, service role only),
    // so a repeated request can never charge twice.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return unlockWith(
      (user, episode) => supabaseAdmin.rpc("unlock_episode", { _user: user, _episode: episode }),
      context.userId,
      data.episode_id,
    );
  });

// Purchases go through the payment providers in shop.functions.ts — coins and
// VIP are only credited after a confirmed payment (see the payments webhook).

export const getMyList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("my_list")
      .select("dramas(id, title, description, cover_url, tags, is_vip_only)")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Could not load your list.");
    return (data ?? []).map((row: any) => row.dramas);
  });

const toggleListInput = z.object({ drama_id: z.string().uuid() });

export const toggleMyList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => toggleListInput.parse(data))
  .handler(async ({ data, context }): Promise<{ saved: boolean }> => {
    const { data: existing } = await context.supabase
      .from("my_list")
      .select("id")
      .eq("drama_id", data.drama_id)
      .maybeSingle();
    if (existing) {
      await context.supabase.from("my_list").delete().eq("drama_id", data.drama_id);
      return { saved: false };
    }
    await context.supabase
      .from("my_list")
      .insert({ drama_id: data.drama_id, user_id: context.userId });
    return { saved: true };
  });

export const isDramaSaved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => toggleListInput.parse(data))
  .handler(async ({ data, context }): Promise<{ saved: boolean }> => {
    const { data: existing } = await context.supabase
      .from("my_list")
      .select("id")
      .eq("drama_id", data.drama_id)
      .maybeSingle();
    return { saved: !!existing };
  });

/** The Jeje Inc Vibe series that every STORYREEL generation is published into. */
export const STORYREEL_DRAMA_ID = "00000000-0000-4000-8000-000000005701";

export type FeedEpisode = {
  id: string;
  drama_id: string;
  episode_number: number;
  title: string | null;
  video_url: string;
  coin_cost: number;
  is_free: boolean;
  dramas: { title: string; cover_url: string } | null;
};

type RawEpisodeRow = Omit<FeedEpisode, "video_url"> & {
  video_url: string | null;
  storage_path: string | null;
  dramas: { title: string; cover_url: string } | { title: string; cover_url: string }[] | null;
};

async function resolveEpisodeUrl(supabaseAdmin: any, row: RawEpisodeRow): Promise<string | null> {
  if (row.storage_path) {
    const { data: signed } = await supabaseAdmin.storage
      .from("videos")
      .createSignedUrl(row.storage_path, 60 * 60 * 6);
    return signed?.signedUrl ?? null;
  }
  return row.video_url;
}

function normalizeDrama(
  dramas: RawEpisodeRow["dramas"],
): { title: string; cover_url: string } | null {
  return Array.isArray(dramas) ? (dramas[0] ?? null) : dramas;
}

async function loadEpisodes(supabaseAdmin: any, filterFreeOnly: boolean): Promise<FeedEpisode[]> {
  let query = supabaseAdmin
    .from("episodes")
    .select(
      "id, drama_id, episode_number, title, video_url, storage_path, coin_cost, is_free, dramas(title, cover_url)",
    )
    .eq("hidden", false)
    .order("drama_id")
    .order("episode_number")
    .limit(200);

  if (filterFreeOnly) {
    query = query.eq("is_free", true);
  }

  const { data, error } = await query;
  if (error) throw new Error("Could not load episodes.");

  const rows = (data ?? []) as unknown as RawEpisodeRow[];

  const episodes = await Promise.all(
    rows.map(async (row) => {
      const url = await resolveEpisodeUrl(supabaseAdmin, row);
      if (!url) return null;
      return {
        id: row.id,
        drama_id: row.drama_id,
        episode_number: row.episode_number,
        title: row.title,
        video_url: url,
        coin_cost: row.coin_cost,
        is_free: row.is_free,
        dramas: normalizeDrama(row.dramas),
      } satisfies FeedEpisode;
    }),
  );

  return episodes.filter((e): e is FeedEpisode => e !== null);
}

/**
 * Public feed of free episodes only.
 * Episodes generated in STORYREEL live in a private bucket, so they get a signed URL.
 */
export const listEpisodes = createServerFn({ method: "GET" }).handler(
  async (): Promise<FeedEpisode[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadEpisodes(supabaseAdmin, true);
  },
);

/**
 * Episodes visible to the authenticated user: free, VIP-locked, or previously unlocked.
 */
export const getEpisodesForUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FeedEpisode[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profile, unlockedRows] = await Promise.all([
      (await supabaseAdmin
        .from("profiles")
        .select("is_vip, vip_until")
        .eq("id", context.userId)
        .single()) as {
        data: { is_vip: boolean; vip_until: string | null } | null;
      },
      (await supabaseAdmin
        .from("user_unlocked_episodes")
        .select("episode_id")
        .eq("user_id", context.userId)) as { data: { episode_id: string }[] | null },
    ]);

    const unlocked = new Set((unlockedRows.data ?? []).map((u) => u.episode_id));
    const vipActive =
      profile.data?.is_vip &&
      (!profile.data.vip_until || new Date(profile.data.vip_until) > new Date());

    const all = await loadEpisodes(supabaseAdmin, false);
    return all.filter((ep) => ep.is_free || vipActive || unlocked.has(ep.id));
  });
