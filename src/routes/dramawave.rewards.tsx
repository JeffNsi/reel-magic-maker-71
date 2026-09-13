import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  claimDailyCheckin,
  watchAd,
  getProfile,
  type Profile,
} from "@/lib/dramawave.functions";
import { Button } from "@/components/ui/button";
import { CoinShopModal } from "@/components/dramawave/coin-shop-modal";
import { Check, Gift, Clock, Share2, Film, Coins, Crown } from "lucide-react";

export const Route = createFileRoute("/dramawave/rewards")({
  head: () => ({
    meta: [
      { title: "Rewards — DramaWave" },
      { name: "description", content: "Earn coins and unlock VIP on DramaWave." },
      { property: "og:title", content: "Rewards — DramaWave" },
      { property: "og:description", content: "Earn coins and unlock VIP on DramaWave." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RewardsPage,
});

const REWARDS = [20, 60, 80, 100, 100, 100, 100];

function RewardsPage() {
  const queryClient = useQueryClient();
  const [shopOpen, setShopOpen] = useState(false);

  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const fetchProfile = useServerFn(getProfile);
  const { data: profile, isPending: profileLoading } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: fetchProfile,
  });

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <Gift className="size-12 text-dw-muted" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold">Earn rewards</h1>
        <p className="mt-2 text-sm text-dw-muted">Sign in to collect daily coins and unlock VIP.</p>
        <Link
          to="/auth"
          className="mt-6 inline-flex h-12 items-center rounded-full dw-btn-primary px-8 text-sm font-semibold"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dw-background px-5 pb-24 pt-6">
      <h1 className="text-2xl font-bold">Rewards</h1>

      <div className="mt-6 rounded-3xl border border-dw-border bg-dw-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-dw-muted">Your balance</p>
            <p className="text-3xl font-bold">
              {(profile?.paid_coins ?? 0) + (profile?.bonus_coins ?? 0)}{" "}
              <Coins className="inline size-5 text-dw-gold" aria-hidden />
            </p>
          </div>
          <Button
            onClick={() => setShopOpen(true)}
            className="h-11 rounded-full dw-btn-gold px-5 text-sm font-semibold"
          >
            Get coins
          </Button>
        </div>
        {profile?.is_vip && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-dw-primary/10 px-3 py-1 text-xs font-semibold text-dw-primary">
            <Crown className="size-3" aria-hidden /> VIP active
          </div>
        )}
      </div>

      <CheckInCard profile={profile} loading={profileLoading} />
      <WatchAdCard />
      <TaskList />

      <CoinShopModal open={shopOpen} onOpenChange={setShopOpen} />
    </div>
  );
}

function CheckInCard({ profile, loading }: { profile: Profile | undefined; loading: boolean }) {
  const queryClient = useQueryClient();
  const claim = useServerFn(claimDailyCheckin);
  const mutation = useMutation({
    mutationFn: () => claim({} as any),
    onSuccess: (data) => {
      queryClient.setQueryData(["profile", data.id], data);
      toast.success(`Checked in! +${data.reward} coins`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (loading || !profile) {
    return <div className="mt-6 h-40 animate-pulse rounded-3xl bg-dw-card" />;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const checkedIn = profile.last_checkin_date === todayStr;

  return (
    <section className="mt-6 rounded-3xl border border-dw-border bg-dw-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">7-Day Check-in</h2>
        {checkedIn ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
            <Check className="size-3" aria-hidden /> Done
          </span>
        ) : (
          <span className="text-xs text-dw-muted">Streak {profile.checkin_streak}</span>
        )}
      </div>

      <div className="mt-5 grid grid-cols-7 gap-2">
        {REWARDS.map((amount, i) => {
          const day = i + 1;
          const active = day <= profile.checkin_streak;
          return (
            <div
              key={day}
              className={`flex flex-col items-center rounded-xl py-3 text-center ${
                active ? "bg-gradient-to-b from-dw-primary to-dw-primary-2 text-white" : "bg-dw-background/50 text-dw-muted"
              }`}
            >
              <span className="text-[10px] font-medium uppercase">Day {day}</span>
              <span className="mt-1 text-xs font-bold">+{amount}</span>
            </div>
          );
        })}
      </div>

      <Button
        onClick={() => mutation.mutate()}
        disabled={checkedIn || mutation.isPending}
        className="mt-5 h-12 w-full rounded-xl dw-btn-primary text-sm font-semibold disabled:opacity-50"
      >
        {checkedIn ? "Come back tomorrow" : mutation.isPending ? "Claiming..." : "Claim daily reward"}
      </Button>
    </section>
  );
}

function WatchAdCard() {
  const queryClient = useQueryClient();
  const [countdown, setCountdown] = useState(0);
  const watch = useServerFn(watchAd);
  const mutation = useMutation({
    mutationFn: watch,
    onSuccess: (balance) => {
      queryClient.setQueryData(["profile"], (old: any) =>
        old ? { ...old, ...balance } : old,
      );
      toast.success("+15 coins earned!");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          mutation.mutate();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown, mutation]);

  const start = () => setCountdown(5);

  return (
    <section className="mt-4 rounded-3xl border border-dw-border bg-dw-card p-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-dw-gold/10 text-dw-gold">
          <Clock className="size-5" aria-hidden />
        </div>
        <div>
          <h2 className="font-semibold">Watch ad</h2>
          <p className="text-xs text-dw-muted">5 seconds = 15 coins</p>
        </div>
      </div>
      <Button
        onClick={start}
        disabled={countdown > 0 || mutation.isPending}
        className="mt-4 h-12 w-full rounded-xl dw-btn-gold text-sm font-semibold disabled:opacity-50"
      >
        {countdown > 0 ? `Watching... ${countdown}s` : mutation.isPending ? "Adding coins..." : "Watch ad"}
      </Button>
    </section>
  );
}

function TaskList() {
  const tasks = [
    { icon: Film, label: "Watch 10 minutes", reward: "+20 coins" },
    { icon: Share2, label: "Share with a friend", reward: "+30 coins" },
    { icon: Gift, label: "Add a drama to My List", reward: "+10 coins" },
  ];

  return (
    <section className="mt-4 rounded-3xl border border-dw-border bg-dw-card p-6">
      <h2 className="text-lg font-semibold">Tasks</h2>
      <ul className="mt-4 space-y-3">
        {tasks.map((task) => (
          <li
            key={task.label}
            className="flex items-center justify-between rounded-2xl bg-dw-background/50 p-3"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-dw-card text-dw-primary">
                <task.icon className="size-4" aria-hidden />
              </div>
              <span className="text-sm font-medium">{task.label}</span>
            </div>
            <span className="text-xs font-semibold text-dw-gold">{task.reward}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
