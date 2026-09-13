import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getMyList } from "@/lib/dramawave.functions";

export const Route = createFileRoute("/dramawave/my-list")({
  head: () => ({
    meta: [
      { title: "My List — DramaWave" },
      { name: "description", content: "Your saved dramas on DramaWave." },
      { property: "og:title", content: "My List — DramaWave" },
      { property: "og:description", content: "Your saved dramas on DramaWave." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyListPage,
});

function MyListPage() {
  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const fetchList = useServerFn(getMyList);
  const { data: dramas, isPending } = useQuery({
    queryKey: ["my-list", user?.id],
    enabled: !!user,
    queryFn: fetchList,
  });

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <Heart className="size-12 text-dw-muted" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold">Save your favorites</h1>
        <p className="mt-2 text-sm text-dw-muted">Sign in to build your personal watchlist.</p>
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
      <h1 className="text-2xl font-bold">My List</h1>

      {isPending && <p className="mt-8 text-sm text-dw-muted">Loading your list...</p>}

      {!isPending && (dramas?.length ?? 0) === 0 && (
        <div className="mt-12 text-center">
          <Heart className="mx-auto size-10 text-dw-muted" aria-hidden />
          <p className="mt-4 text-sm text-dw-muted">No saved dramas yet.</p>
          <Link
            to="/dramawave"
            className="mt-4 inline-flex h-11 items-center rounded-full bg-dw-card px-6 text-sm font-medium"
          >
            Browse dramas
          </Link>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4">
        {(dramas ?? []).map((drama: any) => (
          <Link
            key={drama.id}
            to="/dramawave/shorts"
            className="group overflow-hidden rounded-2xl border border-dw-border bg-dw-card"
          >
            <div className="relative">
              <img
                src={drama.cover_url}
                alt={drama.title}
                className="aspect-[3/4] w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                <Play className="size-8 text-white" aria-hidden />
              </div>
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-medium">{drama.title}</p>
              <p className="truncate text-xs text-dw-muted">{drama.tags?.join(" · ")}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
