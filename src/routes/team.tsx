import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Crown, Film, Loader2, Mail, Trash2, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  acceptInvite,
  cancelInvite,
  createTeam,
  declineInvite,
  getMyTeam,
  inviteMember,
  listTeamShorts,
  removeMember,
  setMemberRole,
  type TeamRole,
} from "@/lib/team.functions";

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: "Studio team — share roles and films | Jeje Inc Vibe" },
      {
        name: "description",
        content:
          "Invite your team by email, give everyone a role and see every short the team generates in one shared gallery.",
      },
      { property: "og:title", content: "Studio team — share roles and films" },
      {
        property: "og:description",
        content:
          "Invite your team by email, give everyone a role and see every short the team generates in one shared gallery.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamPage,
});

const ROLE_LABEL: Record<TeamRole, string> = {
  owner: "Owner",
  editor: "Editor — can generate films",
  viewer: "Viewer — can watch only",
};

function TeamPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5">
          <Link to="/" className="font-display text-2xl italic tracking-tight text-primary">
            Jeje Inc Vibe
          </Link>
          <Button asChild variant="ghost" className="h-9 rounded-full px-4">
            <Link
              to="/studio"
              search={{ story: undefined }}
              className="text-xs uppercase tracking-[0.2em]"
            >
              <ArrowLeft className="mr-2 size-4" /> Scene editor
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 pb-24 pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
          Studio plan
        </p>
        <h1 className="mt-3 font-display text-4xl text-foreground">Your team</h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Up to 14 people per team. The owner invites by email and decides who can generate films
          and who can only watch. Everything the team makes shows up in the shared gallery below.
        </p>

        {!checked && (
          <p className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading
          </p>
        )}

        {checked && !userId && (
          <div className="surface-cinema mt-8 rounded-3xl p-8 text-center">
            <Users className="mx-auto size-7 text-primary" aria-hidden />
            <p className="mt-4 text-sm text-muted-foreground">
              Sign in to create your Studio team or accept an invitation.
            </p>
            <Button
              asChild
              className="mt-6 h-12 rounded-2xl bg-primary px-8 text-primary-foreground hover:shadow-[0_0_24px_var(--glow)]"
            >
              <Link
                to="/auth"
                search={{ plan: "studio" }}
                className="text-xs font-semibold uppercase tracking-[0.2em]"
              >
                Sign in
              </Link>
            </Button>
          </div>
        )}

        {checked && userId && <TeamBody userId={userId} />}
      </main>
    </div>
  );
}

function TeamBody({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getMyTeam);
  const loadShorts = useServerFn(listTeamShorts);

  const team = useQuery({ queryKey: ["team"], queryFn: () => load() });
  const shorts = useQuery({
    queryKey: ["team-shorts"],
    queryFn: () => loadShorts(),
    enabled: !!team.data?.team,
    refetchInterval: 20000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["team"] });
    void queryClient.invalidateQueries({ queryKey: ["team-shorts"] });
  };

  const fail = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : "Something went wrong.");

  const create = useMutation({
    mutationFn: useServerFn(createTeam),
    onSuccess: () => {
      toast.success("Team created.");
      refresh();
    },
    onError: fail,
  });
  const invite = useMutation({
    mutationFn: useServerFn(inviteMember),
    onSuccess: () => {
      toast.success("Invitation sent.");
      refresh();
    },
    onError: fail,
  });
  const cancel = useMutation({
    mutationFn: useServerFn(cancelInvite),
    onSuccess: refresh,
    onError: fail,
  });
  const accept = useMutation({
    mutationFn: useServerFn(acceptInvite),
    onSuccess: () => {
      toast.success("You joined the team.");
      refresh();
    },
    onError: fail,
  });
  const decline = useMutation({
    mutationFn: useServerFn(declineInvite),
    onSuccess: refresh,
    onError: fail,
  });
  const changeRole = useMutation({
    mutationFn: useServerFn(setMemberRole),
    onSuccess: refresh,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: useServerFn(removeMember),
    onSuccess: refresh,
    onError: fail,
  });

  const [teamName, setTeamName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");

  if (team.isPending) {
    return (
      <p className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading your team
      </p>
    );
  }

  const data = team.data;
  const isOwner = data?.my_role === "owner";
  const seatsUsed = (data?.members.length ?? 0) + (data?.invites.length ?? 0);

  return (
    <div className="mt-8 space-y-6">
      {(data?.pending_for_me.length ?? 0) > 0 && (
        <section className="surface-cinema rounded-3xl p-6">
          <h2 className="font-display text-2xl text-foreground">Invitations for you</h2>
          <ul className="mt-4 space-y-3">
            {data?.pending_for_me.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm text-foreground">{item.team_name}</p>
                  <p className="text-xs text-muted-foreground">{ROLE_LABEL[item.role]}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    className="h-9 rounded-full bg-primary px-5 text-xs uppercase tracking-[0.2em] text-primary-foreground"
                    disabled={accept.isPending}
                    onClick={() => accept.mutate({ data: { invite_id: item.id } })}
                  >
                    Join
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-9 rounded-full px-5 text-xs uppercase tracking-[0.2em]"
                    onClick={() => decline.mutate({ data: { invite_id: item.id } })}
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!data?.team && (
        <section className="surface-cinema rounded-3xl p-6">
          <h2 className="font-display text-2xl text-foreground">Create your team</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Name it, then invite up to 13 people.
          </p>
          <form
            className="mt-5 flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate({ data: { name: teamName.trim() } });
            }}
          >
            <Input
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="Jeje Inc Vibe studio"
              className="h-11 rounded-2xl"
              maxLength={60}
              required
            />
            <Button
              type="submit"
              disabled={create.isPending || teamName.trim().length < 2}
              className="h-11 rounded-2xl bg-primary px-6 text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground"
            >
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : "Create team"}
            </Button>
          </form>
        </section>
      )}

      {data?.team && (
        <>
          <section className="surface-cinema rounded-3xl p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl text-foreground">{data.team.name}</h2>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {seatsUsed} / {data.team.member_limit} seats
              </p>
            </div>

            <ul className="mt-5 space-y-3">
              {data.members.map((member) => (
                <li
                  key={member.user_id}
                  className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm text-foreground">
                      {member.role === "owner" && (
                        <Crown className="size-4 text-primary" aria-hidden />
                      )}
                      {member.email ?? "Team member"}
                      {member.user_id === userId && (
                        <span className="text-xs text-muted-foreground">(you)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{ROLE_LABEL[member.role]}</p>
                  </div>

                  {member.role !== "owner" && (
                    <div className="flex items-center gap-2">
                      {isOwner && (
                        <Select
                          value={member.role}
                          onValueChange={(value) =>
                            changeRole.mutate({
                              data: { user_id: member.user_id, role: value as "editor" | "viewer" },
                            })
                          }
                        >
                          <SelectTrigger className="h-9 w-32 rounded-full text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      {(isOwner || member.user_id === userId) && (
                        <Button
                          variant="ghost"
                          className="h-9 rounded-full px-3"
                          aria-label={
                            member.user_id === userId ? "Leave team" : `Remove ${member.email ?? "member"}`
                          }
                          onClick={() => remove.mutate({ data: { user_id: member.user_id } })}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {isOwner && (
              <form
                className="mt-6 flex flex-col gap-3 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  invite.mutate({ data: { email: email.trim(), role } });
                  setEmail("");
                }}
              >
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="teammate@example.com"
                  className="h-11 flex-1 rounded-2xl"
                  required
                />
                <Select value={role} onValueChange={(value) => setRole(value as "editor" | "viewer")}>
                  <SelectTrigger className="h-11 w-full rounded-2xl sm:w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="submit"
                  disabled={invite.isPending}
                  className="h-11 rounded-2xl bg-primary px-6 text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground"
                >
                  {invite.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      <Mail className="mr-2 size-4" /> Invite
                    </>
                  )}
                </Button>
              </form>
            )}

            {(data.invites.length ?? 0) > 0 && (
              <ul className="mt-5 space-y-2">
                {data.invites.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-border/70 px-4 py-3"
                  >
                    <span className="min-w-0 truncate text-sm text-muted-foreground">
                      {item.email} — invited as {item.role}
                    </span>
                    {isOwner && (
                      <Button
                        variant="ghost"
                        className="h-8 rounded-full px-3 text-xs uppercase tracking-[0.2em]"
                        onClick={() => cancel.mutate({ data: { invite_id: item.id } })}
                      >
                        Cancel
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="surface-cinema rounded-3xl p-6">
            <h2 className="font-display text-2xl text-foreground">Team gallery</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Every short your team has generated.
            </p>

            {shorts.isPending && (
              <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading films
              </p>
            )}

            {!shorts.isPending && (shorts.data?.length ?? 0) === 0 && (
              <p className="mt-6 text-sm text-muted-foreground">
                No films yet. Editors can create the first one in the scene editor.
              </p>
            )}

            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {(shorts.data ?? []).map((item) => (
                <li key={item.id} className="rounded-3xl border border-border/70 p-4">
                  {item.video_url ? (
                    <video
                      src={item.video_url}
                      controls
                      playsInline
                      preload="metadata"
                      className="aspect-[9/16] w-full rounded-2xl bg-black object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[9/16] w-full items-center justify-center rounded-2xl border border-border/70 bg-background/50">
                      <Film className="size-6 text-muted-foreground" aria-hidden />
                    </div>
                  )}
                  <p className="mt-3 line-clamp-3 text-sm text-foreground">{item.idea}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {item.author_email ?? "Team"} — {item.status}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
