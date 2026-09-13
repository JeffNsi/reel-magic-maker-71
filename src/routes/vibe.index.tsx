import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Crown, Play, ChevronRight, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/vibe/")({
  head: () => ({
    meta: [
      { title: "Home — STORYREEL" },
      { name: "description", content: "Discover trending vertical short films on STORYREEL." },
      { property: "og:title", content: "Home — STORYREEL" },
      { property: "og:description", content: "Discover trending vertical short films on STORYREEL." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

type Drama = Database["public"]["Tables"]["dramas"]["Row"];

function HomePage() {
  const { data: dramas } = useQuery({
    queryKey: ["dramas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dramas").select("*").order("created_at");
      if (error) throw error;
      return data as Drama[];
    },
  });

  const list = dramas ?? [];
  const featured = list.slice(0, 2);
  const trending = list;
  const vip = list.filter((d) => d.is_vip_only);
  const romanceRevenge = list.filter(
    (d) => d.tags?.some((t) => /romance|revenge/i.test(t)),
  );

  return (
    <div className="min-h-screen bg-dw-background pb-6">
      <header className="sticky top-0 z-40 border-b border-dw-border bg-dw-background/95 px-5 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight dw-gradient-text">STORYREEL</h1>
          <Link
            to="/vibe/profile"
            className="flex size-9 items-center justify-center rounded-full bg-dw-card text-dw-foreground"
          >
            <Star className="size-4 text-dw-gold" aria-hidden />
          </Link>
        </div>
      </header>

      <section className="relative mt-4 px-5">
        <div className="relative overflow-hidden rounded-3xl">
          {featured[0] ? (
            <FeaturedBanner drama={featured[0]} />
          ) : (
            <div className="aspect-[4/5] w-full rounded-3xl bg-dw-card" />
          )}
        </div>

        <div className="mt-6 flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {featured.slice(1).map((drama) => (
            <div key={drama.id} className="w-40 shrink-0">
              <img
                src={drama.cover_url}
                alt={drama.title}
                className="aspect-[3/4] w-full rounded-2xl object-cover"
              />
              <p className="mt-2 truncate text-sm font-medium">{drama.title}</p>
            </div>
          ))}
        </div>
      </section>

      <CategoryRow title="Trending" dramas={trending} />
      <CategoryRow title="VIP Exclusives" dramas={vip} />
      <CategoryRow title="Romance & Revenge" dramas={romanceRevenge} />
    </div>
  );
}

function FeaturedBanner({ drama }: { drama: Drama }) {
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl">
      <img
        src={drama.cover_url}
        alt={drama.title}
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-dw-background via-dw-background/60 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-6">
        {drama.is_vip_only && (
          <span className="mb-3 inline-flex items-center gap-1 rounded-full bg-dw-gold/20 px-3 py-1 text-xs font-semibold text-dw-gold">
            <Crown className="size-3" aria-hidden /> VIP
          </span>
        )}
        <h2 className="text-3xl font-bold leading-tight">{drama.title}</h2>
        <p className="mt-2 line-clamp-2 text-sm text-dw-muted">{drama.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {drama.tags?.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-dw-border bg-dw-card/60 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider"
            >
              {tag}
            </span>
          ))}
        </div>
        <Link
          to="/vibe/shorts"
          className="mt-5 inline-flex h-12 items-center gap-2 rounded-full dw-btn-primary px-6 text-sm font-semibold"
        >
          <Play className="size-4 fill-current" aria-hidden /> Watch now
        </Link>
      </div>
    </div>
  );
}

function CategoryRow({ title, dramas }: { title: string; dramas: Drama[] }) {
  if (dramas.length === 0) return null;

  return (
    <section className="mt-8 px-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <button className="flex items-center gap-1 text-xs font-medium text-dw-primary">
          See all <ChevronRight className="size-3" aria-hidden />
        </button>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
        {dramas.map((drama) => (
          <Link
            key={drama.id}
            to="/vibe/shorts"
            className="w-36 shrink-0"
          >
            <div className="relative overflow-hidden rounded-2xl">
              <img
                src={drama.cover_url}
                alt={drama.title}
                className="aspect-[3/4] w-full object-cover transition-transform duration-500 hover:scale-105"
              />
              {drama.is_vip_only && (
                <span className="absolute right-2 top-2 rounded-full bg-dw-gold p-1">
                  <Crown className="size-3 text-dw-background" aria-hidden />
                </span>
              )}
            </div>
            <p className="mt-2 truncate text-sm font-medium">{drama.title}</p>
            <p className="truncate text-xs text-dw-muted">{drama.tags?.slice(0, 2).join(" · ")}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
