import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const REWARDS = [20, 60, 80, 100, 100, 100, 100];
const STREAK_RESET_HOURS = 48;

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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isYesterday(dateString: string | null) {
  if (!dateString) return false;
  const d = new Date(dateString);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return d.toISOString().slice(0, 10) === yesterday.toISOString().slice(0, 10);
}

function isVipActive(profile: Pick<Profile, "is_vip" | "vip_until">) {
  if (!profile.is_vip) return false;
  if (!profile.vip_until) return true;
  return new Date(profile.vip_until) > new Date();
}

async function fetchProfile(supabase: { from: (table: string) => any }) {
  const { data, error } = await supabase.from("profiles").select("*").single();
  if (error || !data) throw new Error("Could not load your profile.");
  return data as Profile;
}

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Profile> => fetchProfile(context.supabase));

export const claimDailyCheckin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Profile & { reward: number }> => {
    const profile = await fetchProfile(context.supabase);
    const todayStr = today();

    if (profile.last_checkin_date === todayStr) {
      throw new Error("You already checked in today.");
    }

    const newStreak = isYesterday(profile.last_checkin_date)
      ? Math.min(7, profile.checkin_streak + 1)
      : 1;
    const reward = REWARDS[newStreak - 1] ?? 20;

    const { data, error } = await context.supabase
      .from("profiles")
      .update({
        last_checkin_date: todayStr,
        checkin_streak: newStreak,
        bonus_coins: profile.bonus_coins + reward,
      })
      .eq("id", profile.id)
      .select()
      .single();

    if (error || !data) throw new Error("Could not record check-in.");
    return { ...(data as Profile), reward };
  });

export const watchAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Balance> => {
    const profile = await fetchProfile(context.supabase);
    const { data, error } = await context.supabase
      .from("profiles")
      .update({ bonus_coins: profile.bonus_coins + 15 })
      .eq("id", profile.id)
      .select("paid_coins, bonus_coins")
      .single();
    if (error || !data) throw new Error("Could not add coins.");
    return data as Balance;
  });

const unlockInput = z.object({ episode_id: z.string().uuid() });

export const unlockEpisode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => unlockInput.parse(data))
  .handler(async ({ data, context }): Promise<Balance & { unlocked: boolean }> => {
    const { data: existing } = await context.supabase
      .from("user_unlocked_episodes")
      .select("id")
      .eq("episode_id", data.episode_id)
      .maybeSingle();
    if (existing) return { unlocked: true, paid_coins: 0, bonus_coins: 0 };

    const { data: episode, error: epError } = (await context.supabase
      .from("episodes")
      .select("id, is_free, coin_cost, dramas(is_vip_only)")
      .eq("id", data.episode_id)
      .single()) as any;
    if (epError || !episode) throw new Error("Episode not found.");

    const profile = await fetchProfile(context.supabase);

    const dramaVipOnly = Array.isArray(episode.dramas)
      ? episode.dramas[0]?.is_vip_only ?? false
      : episode.dramas?.is_vip_only ?? false;

    if (episode.is_free || isVipActive(profile)) {
      await context.supabase
        .from("user_unlocked_episodes")
        .insert({ episode_id: data.episode_id, user_id: context.userId });
      return { unlocked: true, paid_coins: profile.paid_coins, bonus_coins: profile.bonus_coins };
    }

    if (episode.is_vip_only || dramaVipOnly) {
      throw new Error("This episode is VIP-only. Subscribe to VIP to watch.");
    }

    const total = profile.paid_coins + profile.bonus_coins;
    if (total < episode.coin_cost) {
      throw new Error("Not enough coins. Earn more or buy a coin pack.");
    }

    let newBonus = profile.bonus_coins;
    let newPaid = profile.paid_coins;
    const cost = episode.coin_cost;
    if (newBonus >= cost) {
      newBonus -= cost;
    } else {
      newPaid -= cost - newBonus;
      newBonus = 0;
    }

    const [{ error: updateError }, { error: insertError }] = await Promise.all([
      context.supabase.from("profiles").update({ paid_coins: newPaid, bonus_coins: newBonus }).eq("id", profile.id),
      context.supabase
        .from("user_unlocked_episodes")
        .insert({ episode_id: data.episode_id, user_id: context.userId }),
    ]);

    if (updateError || insertError) throw new Error("Could not unlock episode.");
    return { unlocked: true, paid_coins: newPaid, bonus_coins: newBonus };
  });

const coinPackInput = z.object({ pack: z.enum(["small", "medium", "large"]) });

export const buyCoins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => coinPackInput.parse(data))
  .handler(async ({ data, context }): Promise<Profile> => {
    const profile = await fetchProfile(context.supabase);
    const bonus = data.pack === "small" ? 0 : data.pack === "medium" ? 500 : 2000;
    const paid = data.pack === "small" ? 500 : data.pack === "medium" ? 1000 : 3000;
    const { data: updated, error } = await context.supabase
      .from("profiles")
      .update({
        paid_coins: profile.paid_coins + paid,
        bonus_coins: profile.bonus_coins + bonus,
      })
      .eq("id", profile.id)
      .select()
      .single();
    if (error || !updated) throw new Error("Could not add coins.");
    return updated as Profile;
  });

export const buyVip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Profile> => {
    const profile = await fetchProfile(context.supabase);
    const until = new Date();
    until.setDate(until.getDate() + 30);
    const { data: updated, error } = await context.supabase
      .from("profiles")
      .update({ is_vip: true, vip_until: until.toISOString() })
      .eq("id", profile.id)
      .select()
      .single();
    if (error || !updated) throw new Error("Could not activate VIP.");
    return updated as Profile;
  });

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
    await context.supabase.from("my_list").insert({ drama_id: data.drama_id, user_id: context.userId });
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

/** The DramaWave series that every STORYREEL generation is published into. */
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

/**
 * Public feed of every episode with a playable link.
 * Episodes generated in STORYREEL live in a private bucket, so they get a signed URL.
 */
export const listEpisodes = createServerFn({ method: "GET" }).handler(
  async (): Promise<FeedEpisode[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("episodes")
      .select(
        "id, drama_id, episode_number, title, video_url, storage_path, coin_cost, is_free, dramas(title, cover_url)",
      )
      .order("drama_id")
      .order("episode_number")
      .limit(200);

    if (error) throw new Error("Could not load episodes.");

    const rows = (data ?? []) as unknown as (Omit<FeedEpisode, "video_url"> & {
      video_url: string | null;
      storage_path: string | null;
      dramas: { title: string; cover_url: string } | { title: string; cover_url: string }[] | null;
    })[];

    const episodes = await Promise.all(
      rows.map(async (row) => {
        let url = row.video_url;
        if (row.storage_path) {
          const { data: signed } = await supabaseAdmin.storage
            .from("videos")
            .createSignedUrl(row.storage_path, 60 * 60 * 6);
          url = signed?.signedUrl ?? null;
        }
        const drama = Array.isArray(row.dramas) ? (row.dramas[0] ?? null) : row.dramas;
        if (!url) return null;
        return {
          id: row.id,
          drama_id: row.drama_id,
          episode_number: row.episode_number,
          title: row.title,
          video_url: url,
          coin_cost: row.coin_cost,
          is_free: row.is_free,
          dramas: drama,
        } satisfies FeedEpisode;
      }),
    );

    return episodes.filter((e): e is FeedEpisode => e !== null);
  },
);
