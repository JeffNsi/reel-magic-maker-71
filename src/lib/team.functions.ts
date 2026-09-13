import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Studio team accounts: one owner invites people by email and gives each of them
 * a role. Everything runs server-side with the admin client after the caller's
 * membership and role have been verified — the tables are closed to the browser.
 */

const BUCKET = "videos";
const SIGNED_URL_TTL = 60 * 60 * 6;
export const DEFAULT_MEMBER_LIMIT = 14;

export type TeamRole = "owner" | "editor" | "viewer";

export type TeamMemberView = {
  user_id: string;
  email: string | null;
  role: TeamRole;
  created_at: string;
};

export type TeamInviteView = {
  id: string;
  email: string;
  role: TeamRole;
  created_at: string;
};

export type MyTeamView = {
  team: { id: string; name: string; member_limit: number } | null;
  my_role: TeamRole | null;
  members: TeamMemberView[];
  invites: TeamInviteView[];
  /** Invitations waiting for the signed-in email address. */
  pending_for_me: { id: string; team_name: string; role: TeamRole }[];
};

export type TeamShort = {
  id: string;
  idea: string;
  style: string;
  status: string;
  created_at: string;
  video_url: string | null;
  author_email: string | null;
};

const roleSchema = z.enum(["editor", "viewer"]);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Admin = Awaited<ReturnType<typeof admin>>;

async function myEmail(db: Admin, userId: string, claims: unknown): Promise<string | null> {
  const fromClaims =
    claims && typeof claims === "object" && typeof (claims as { email?: unknown }).email === "string"
      ? ((claims as { email: string }).email as string)
      : null;
  if (fromClaims) return fromClaims.toLowerCase();
  const { data } = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
  return data?.email ? data.email.toLowerCase() : null;
}

async function membership(db: Admin, userId: string) {
  const { data } = await db
    .from("team_members")
    .select("team_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

async function requireRole(db: Admin, userId: string, allowed: TeamRole[]) {
  const mine = await membership(db, userId);
  if (!mine) throw new Error("You are not part of a Studio team yet.");
  if (!allowed.includes(mine.role as TeamRole)) {
    throw new Error("Only the team owner can do that.");
  }
  return mine;
}

async function emailsFor(db: Admin, ids: string[]): Promise<Record<string, string | null>> {
  if (ids.length === 0) return {};
  const { data } = await db.from("profiles").select("id, email").in("id", ids);
  return Object.fromEntries((data ?? []).map((row) => [row.id, row.email ?? null]));
}

/** The signed-in person's team, its members, open invites and invites waiting for them. */
export const getMyTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyTeamView> => {
    const db = await admin();
    const email = await myEmail(db, context.userId, context.claims);

    const pendingForMe: MyTeamView["pending_for_me"] = [];
    if (email) {
      const { data: invites } = await db
        .from("team_invites")
        .select("id, role, team_id, teams(name)")
        .eq("status", "pending")
        .ilike("email", email);
      for (const row of invites ?? []) {
        const team = row.teams as { name?: string } | null;
        pendingForMe.push({
          id: row.id,
          team_name: team?.name ?? "Studio team",
          role: row.role as TeamRole,
        });
      }
    }

    const mine = await membership(db, context.userId);
    if (!mine) {
      return { team: null, my_role: null, members: [], invites: [], pending_for_me: pendingForMe };
    }

    const [{ data: team }, { data: members }, { data: invites }] = await Promise.all([
      db.from("teams").select("id, name, member_limit").eq("id", mine.team_id).maybeSingle(),
      db
        .from("team_members")
        .select("user_id, role, created_at")
        .eq("team_id", mine.team_id)
        .order("created_at", { ascending: true }),
      db
        .from("team_invites")
        .select("id, email, role, created_at")
        .eq("team_id", mine.team_id)
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
    ]);

    const emails = await emailsFor(db, (members ?? []).map((m) => m.user_id));

    return {
      team: team ? { id: team.id, name: team.name, member_limit: team.member_limit } : null,
      my_role: mine.role as TeamRole,
      members: (members ?? []).map((m) => ({
        user_id: m.user_id,
        email: emails[m.user_id] ?? null,
        role: m.role as TeamRole,
        created_at: m.created_at,
      })),
      invites: (invites ?? []).map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role as TeamRole,
        created_at: i.created_at,
      })),
      pending_for_me: pendingForMe,
    };
  });

/** Create a team; the creator becomes its owner. One team per person. */
export const createTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ name: z.string().trim().min(2).max(60) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    if (await membership(db, context.userId)) {
      throw new Error("You are already in a Studio team.");
    }

    const { data: team, error } = await db
      .from("teams")
      .insert({
        name: data.name,
        owner_id: context.userId,
        member_limit: DEFAULT_MEMBER_LIMIT,
      })
      .select("id")
      .single();
    if (error || !team) throw new Error("Could not create the team.");

    const { error: memberError } = await db
      .from("team_members")
      .insert({ team_id: team.id, user_id: context.userId, role: "owner" });
    if (memberError) throw new Error("Could not add you to the team.");

    return { team_id: team.id };
  });

/** Owner invites someone by email with a role. */
export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ email: z.string().trim().email().max(160), role: roleSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const mine = await requireRole(db, context.userId, ["owner"]);
    const email = data.email.toLowerCase();

    const [{ count: memberCount }, { count: inviteCount }, { data: team }] = await Promise.all([
      db
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("team_id", mine.team_id),
      db
        .from("team_invites")
        .select("id", { count: "exact", head: true })
        .eq("team_id", mine.team_id)
        .eq("status", "pending"),
      db.from("teams").select("member_limit").eq("id", mine.team_id).maybeSingle(),
    ]);

    const limit = team?.member_limit ?? DEFAULT_MEMBER_LIMIT;
    if ((memberCount ?? 0) + (inviteCount ?? 0) >= limit) {
      throw new Error(`This team is full (${limit} people, invites included).`);
    }

    const { error } = await db
      .from("team_invites")
      .upsert(
        {
          team_id: mine.team_id,
          email,
          role: data.role,
          status: "pending",
          invited_by: context.userId,
          accepted_at: null,
        },
        { onConflict: "team_id,email" },
      );
    if (error) throw new Error("Could not send that invitation.");

    return { ok: true };
  });

/** Owner cancels a pending invitation. */
export const cancelInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ invite_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const mine = await requireRole(db, context.userId, ["owner"]);
    await db.from("team_invites").delete().eq("id", data.invite_id).eq("team_id", mine.team_id);
    return { ok: true };
  });

/** The invited person accepts — matched on their own signed-in email. */
export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ invite_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const email = await myEmail(db, context.userId, context.claims);
    if (!email) throw new Error("Your account has no email address.");
    if (await membership(db, context.userId)) {
      throw new Error("You are already in a Studio team.");
    }

    const { data: invite } = await db
      .from("team_invites")
      .select("id, team_id, role, email, status")
      .eq("id", data.invite_id)
      .maybeSingle();
    if (!invite || invite.status !== "pending" || invite.email.toLowerCase() !== email) {
      throw new Error("That invitation is no longer valid.");
    }

    const { count } = await db
      .from("team_members")
      .select("id", { count: "exact", head: true })
      .eq("team_id", invite.team_id);
    const { data: team } = await db
      .from("teams")
      .select("member_limit")
      .eq("id", invite.team_id)
      .maybeSingle();
    if ((count ?? 0) >= (team?.member_limit ?? DEFAULT_MEMBER_LIMIT)) {
      throw new Error("That team is already full.");
    }

    const { error } = await db
      .from("team_members")
      .insert({ team_id: invite.team_id, user_id: context.userId, role: invite.role });
    if (error) throw new Error("Could not join the team.");

    await db
      .from("team_invites")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    return { team_id: invite.team_id };
  });

/** The invited person declines. */
export const declineInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ invite_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const email = await myEmail(db, context.userId, context.claims);
    if (!email) throw new Error("Your account has no email address.");
    await db
      .from("team_invites")
      .update({ status: "declined" })
      .eq("id", data.invite_id)
      .ilike("email", email);
    return { ok: true };
  });

/** Owner changes a member's role. The owner's own role cannot be changed. */
export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ user_id: z.string().uuid(), role: roleSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const mine = await requireRole(db, context.userId, ["owner"]);
    if (data.user_id === context.userId) throw new Error("You cannot change your own role.");
    await db
      .from("team_members")
      .update({ role: data.role })
      .eq("team_id", mine.team_id)
      .eq("user_id", data.user_id);
    return { ok: true };
  });

/** Owner removes a member; anyone else can remove themselves (leave). */
export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const mine = await membership(db, context.userId);
    if (!mine) throw new Error("You are not part of a Studio team yet.");

    const isOwner = mine.role === "owner";
    if (!isOwner && data.user_id !== context.userId) {
      throw new Error("Only the team owner can remove other people.");
    }
    if (isOwner && data.user_id === context.userId) {
      throw new Error("The owner cannot leave their own team.");
    }

    await db
      .from("team_members")
      .delete()
      .eq("team_id", mine.team_id)
      .eq("user_id", data.user_id);
    return { ok: true };
  });

/** Every short made by the team, newest first — visible to all roles. */
export const listTeamShorts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeamShort[]> => {
    const db = await admin();
    const mine = await membership(db, context.userId);
    if (!mine) return [];

    const { data: members } = await db
      .from("team_members")
      .select("user_id")
      .eq("team_id", mine.team_id);
    const ids = (members ?? []).map((m) => m.user_id);
    if (ids.length === 0) return [];

    const [{ data: rows }, emails] = await Promise.all([
      db
        .from("generations")
        .select("id, idea, style, status, created_at, video_url, user_id")
        .in("user_id", ids)
        .order("created_at", { ascending: false })
        .limit(60),
      emailsFor(db, ids),
    ]);

    return Promise.all(
      (rows ?? []).map(async (row) => {
        let url: string | null = null;
        if (row.status === "completed" && row.video_url) {
          const { data: signed } = await db.storage
            .from(BUCKET)
            .createSignedUrl(row.video_url, SIGNED_URL_TTL);
          url = signed?.signedUrl ?? null;
        }
        return {
          id: row.id,
          idea: row.idea,
          style: row.style,
          status: row.status ?? "queued",
          created_at: row.created_at,
          video_url: url,
          author_email: row.user_id ? emails[row.user_id] ?? null : null,
        };
      }),
    );
  });
