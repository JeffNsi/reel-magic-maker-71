import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Crown, Coins, LogOut, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getProfile, buyVip } from "@/lib/dramawave.functions";
import { Button } from "@/components/ui/button";
import { CoinShopModal } from "@/components/dramawave/coin-shop-modal";
import { useState } from "react";

export const Route = createFileRoute("/dramawave/profile")({
  head: () => ({
    meta: [
      { title: "Profile — DramaWave" },
      { name: "description", content: "Your DramaWave profile, coins and VIP status." },
      { property: "og:title", content: "Profile — DramaWave" },
      { property: "og:description", content: "Your DramaWave profile, coins and VIP status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const [shopOpen, setShopOpen] = useState(false);
  const fetchProfile = useServerFn(getProfile);
  const activateVip = useServerFn(buyVip);

  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const { data: profile, refetch } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: () => fetchProfile(),
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out.");
    navigate({ to: "/dramawave" });
  };

  const handleVip = async () => {
    try {
      await activateVip();
      refetch();
      toast.success("VIP activated for 30 days!");
    } catch (err: any) {
      toast.error(err.message || "Could not activate VIP.");
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-bold">Sign in to DramaWave</h1>
        <p className="mt-2 text-sm text-dw-muted">
          Unlock episodes, save your list and earn rewards.
        </p>
        <Link
          to="/auth"
          className="mt-6 inline-flex h-12 items-center rounded-full dw-btn-primary px-8 text-sm font-semibold"
        >
          Sign in / Sign up
        </Link>
        <Link to="/dramawave" className="mt-4 text-sm text-dw-muted hover:text-dw-foreground">
          Continue as guest
        </Link>
      </div>
    );
  }

  const isVip = profile?.is_vip && (!profile.vip_until || new Date(profile.vip_until) > new Date());

  return (
    <div className="min-h-screen bg-dw-background px-5 pb-24 pt-6">
      <h1 className="text-2xl font-bold">Profile</h1>

      <div className="mt-6 rounded-3xl border border-dw-border bg-dw-card p-6">
        <div className="flex items-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-dw-primary to-dw-primary-2 text-xl font-bold text-white">
            {profile?.email?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div>
            <p className="font-semibold">{profile?.email ?? "DramaWatcher"}</p>
            <p className="text-sm text-dw-muted">{isVip ? "VIP Member" : "Free member"}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-dw-border bg-dw-background/50 p-4">
            <div className="flex items-center gap-2 text-dw-gold">
              <Coins className="size-4" aria-hidden />
              <span className="text-xs font-medium uppercase tracking-wider">Coins</span>
            </div>
            <p className="mt-2 text-2xl font-bold">
              {(profile?.paid_coins ?? 0) + (profile?.bonus_coins ?? 0)}
            </p>
            <p className="text-xs text-dw-muted">
              Paid {profile?.paid_coins ?? 0} · Bonus {profile?.bonus_coins ?? 0}
            </p>
          </div>

          <div className="rounded-2xl border border-dw-border bg-dw-background/50 p-4">
            <div className="flex items-center gap-2 text-dw-primary">
              <Crown className="size-4" aria-hidden />
              <span className="text-xs font-medium uppercase tracking-wider">VIP</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{isVip ? "Active" : "Off"}</p>
            <p className="text-xs text-dw-muted">
              {isVip && profile?.vip_until
                ? `Until ${new Date(profile.vip_until).toLocaleDateString()}`
                : "Unlock everything"}
            </p>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Button
            onClick={() => setShopOpen(true)}
            className="h-12 flex-1 rounded-xl dw-btn-gold text-sm font-semibold"
          >
            <Wallet className="mr-2 size-4" /> Coin shop
          </Button>
          <Button
            onClick={handleVip}
            className="h-12 flex-1 rounded-xl dw-btn-primary text-sm font-semibold"
          >
            <Crown className="mr-2 size-4" /> Activate VIP
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-dw-border bg-dw-card p-4">
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-2xl p-3 text-left text-sm font-medium text-dw-foreground transition-colors hover:bg-dw-background/50"
        >
          <LogOut className="size-5 text-dw-muted" aria-hidden /> Sign out
        </button>
      </div>

      <CoinShopModal open={shopOpen} onOpenChange={setShopOpen} onSuccess={refetch} />
    </div>
  );
}
