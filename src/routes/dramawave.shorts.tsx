import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  getProfile,
  unlockEpisode,
  type Profile,
} from "@/lib/dramawave.functions";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CoinShopModal } from "@/components/dramawave/coin-shop-modal";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Heart,
  Share2,
  ListVideo,
  Lock,
  Crown,
} from "lucide-react";

export const Route = createFileRoute("/dramawave/shorts")({
  head: () => ({
    meta: [
      { title: "Shorts — DramaWave" },
      { name: "description", content: "Watch vertical short dramas on DramaWave." },
      { property: "og:title", content: "Shorts — DramaWave" },
      { property: "og:description", content: "Watch vertical short dramas on DramaWave." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShortsPage,
});

type Episode = {
  id: string;
  drama_id: string;
  episode_number: number;
  title: string | null;
  video_url: string;
  coin_cost: number;
  is_free: boolean;
  dramas: { title: string; cover_url: string } | { title: string; cover_url: string }[] | null;
};

function getDrama(ep: Episode) {
  if (!ep.dramas) return { title: "DramaWave", cover_url: "" };
  return Array.isArray(ep.dramas)
    ? (ep.dramas[0] ?? { title: "DramaWave", cover_url: "" })
    : ep.dramas;
}

function isVipActive(profile?: Profile) {
  if (!profile?.is_vip) return false;
  if (!profile.vip_until) return true;
  return new Date(profile.vip_until) > new Date();
}

function ShortsPage() {
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [shopOpen, setShopOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const { data: episodes } = useQuery({
    queryKey: ["episodes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("episodes")
        .select("*, dramas(title, cover_url)")
        .order("episode_number");
      if (error) throw error;
      return data as Episode[];
    },
  });

  const fetchProfile = useServerFn(getProfile);
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: fetchProfile,
  });

  const { data: unlocks } = useQuery({
    queryKey: ["unlocks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_unlocked_episodes").select("episode_id");
      if (error) throw error;
      return new Set((data ?? []).map((u) => u.episode_id));
    },
  });

  const unlockFn = useServerFn(unlockEpisode);
  const unlockMutation = useMutation({
    mutationFn: (episode_id: string) => unlockFn({ data: { episode_id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unlocks"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Episode unlocked!");
    },
    onError: (err: Error) => {
      if (err.message.includes("Not enough coins")) {
        setShopOpen(true);
      } else {
        toast.error(err.message);
      }
    },
  });

  const episode = episodes?.[currentIndex];

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load();
      if (playing) videoRef.current.play().catch(() => setPlaying(false));
    }
  }, [currentIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => setProgress((video.currentTime / (video.duration || 1)) * 100 || 0);
    video.addEventListener("timeupdate", update);
    return () => video.removeEventListener("timeupdate", update);
  }, [episode?.id]);

  if (!episodes || episodes.length === 0) {
    return (
      <div className="flex h-[calc(100dvh-4rem)] items-center justify-center text-dw-muted">
        Loading episodes...
      </div>
    );
  }

  if (!episode) return null;

  const isUnlocked = (ep: Episode) =>
    ep.is_free || isVipActive(profile) || (unlocks?.has(ep.id) ?? false);

  const currentUnlocked = isUnlocked(episode);

  const handleNext = () => {
    setCurrentIndex((i) => (i + 1) % episodes.length);
    setProgress(0);
  };

  const handlePrev = () => {
    setCurrentIndex((i) => (i - 1 + episodes.length) % episodes.length);
    setProgress(0);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const drama = getDrama(episode);

  return (
    <div className="relative h-[calc(100dvh-4rem)] w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={episode.video_url}
        loop
        playsInline
        muted
        onClick={togglePlay}
        className="h-full w-full object-cover"
      />

      {!currentUnlocked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 p-8 text-center backdrop-blur-sm">
          <Lock className="size-12 text-dw-gold" aria-hidden />
          <h2 className="mt-4 text-2xl font-bold">Locked episode</h2>
          <p className="mt-2 text-sm text-dw-muted">
            Unlock "{episode.title ?? `Episode ${episode.episode_number}`}" for{" "}
            <span className="font-bold text-dw-gold">{episode.coin_cost} coins</span>
          </p>
          {user ? (
            <Button
              onClick={() => unlockMutation.mutate(episode.id)}
              disabled={unlockMutation.isPending}
              className="mt-6 h-12 rounded-full dw-btn-primary px-8 text-sm font-semibold"
            >
              {unlockMutation.isPending ? "Unlocking..." : "Unlock & continue"}
            </Button>
          ) : (
            <Link
              to="/auth"
              className="mt-6 inline-flex h-12 items-center rounded-full dw-btn-primary px-8 text-sm font-semibold"
            >
              Sign in to unlock
            </Link>
          )}
          <button
            onClick={() => setShopOpen(true)}
            className="mt-3 text-sm text-dw-primary hover:underline"
          >
            Get more coins
          </button>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/80 via-transparent to-black/30 p-5">
        <div className="pointer-events-auto flex items-center justify-end gap-4">
          <button
            onClick={() => toast("Liked!")}
            className="flex size-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md"
          >
            <Heart className="size-5" aria-hidden />
          </button>
          <button
            onClick={() => toast("Share link copied!")}
            className="flex size-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md"
          >
            <Share2 className="size-5" aria-hidden />
          </button>
        </div>

        <div className="pointer-events-auto">
          <div className="mb-4">
            <p className="text-xs font-medium uppercase tracking-wider text-dw-gold">{drama.title}</p>
            <h2 className="text-xl font-bold text-white">
              {episode.title ?? `Episode ${episode.episode_number}`}
            </h2>
          </div>

          <div className="mb-3 h-1 w-full rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-dw-primary"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                aria-label={playing ? "Pause" : "Play"}
                className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md"
              >
                {playing ? <Pause className="size-5" aria-hidden /> : <Play className="size-5 fill-current" aria-hidden />}
              </button>
              <button
                onClick={handlePrev}
                aria-label="Previous episode"
                className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md"
              >
                <SkipBack className="size-5" aria-hidden />
              </button>
              <button
                onClick={handleNext}
                aria-label="Next episode"
                className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md"
              >
                <SkipForward className="size-5" aria-hidden />
              </button>
            </div>

            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <button className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-medium text-white backdrop-blur-md">
                  <ListVideo className="size-4" aria-hidden /> Episodes
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-3xl border-dw-border bg-dw-card text-dw-foreground">
                <SheetHeader>
                  <SheetTitle className="text-left text-lg font-bold">Episodes</SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-2 pb-6">
                  {episodes.map((ep, idx) => {
                    const unlocked = isUnlocked(ep);
                    const d = getDrama(ep);
                    return (
                      <button
                        key={ep.id}
                        onClick={() => {
                          setCurrentIndex(idx);
                          setDrawerOpen(false);
                        }}
                        className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors ${
                          idx === currentIndex ? "bg-dw-primary/10" : "bg-dw-background/50 hover:bg-dw-card-hover"
                        }`}
                      >
                        <img
                          src={d.cover_url}
                          alt={d.title}
                          className="aspect-[3/4] w-14 rounded-xl object-cover"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{d.title}</p>
                          <p className="text-xs text-dw-muted">
                            Ep {ep.episode_number} · {ep.title ?? "Untitled"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 text-xs font-semibold text-dw-gold">
                          {unlocked ? (
                            <Play className="size-3" aria-hidden />
                          ) : (
                            <>
                              <Lock className="size-3" aria-hidden />
                              {ep.coin_cost}
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      {isVipActive(profile) && (
        <div className="absolute left-5 top-5 flex items-center gap-1 rounded-full bg-dw-gold/20 px-3 py-1 text-xs font-bold text-dw-gold">
          <Crown className="size-3" aria-hidden /> VIP
        </div>
      )}

      <CoinShopModal open={shopOpen} onOpenChange={setShopOpen} />
    </div>
  );
}
