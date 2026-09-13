import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Home, Film, Gift, Heart, User } from "lucide-react";

export const Route = createFileRoute("/vibe")({
  head: () => ({
    meta: [
      { title: "Jeje Inc Vibe" },
      { name: "description", content: "Binge vertical short films on Jeje Inc Vibe." },
      { property: "og:title", content: "Jeje Inc Vibe" },
      { property: "og:description", content: "Binge vertical short films on Jeje Inc Vibe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DramaWaveLayout,
});

const tabs = [
  { to: "/vibe", label: "Home", icon: Home },
  { to: "/vibe/shorts", label: "Shorts", icon: Film },
  { to: "/vibe/rewards", label: "Rewards", icon: Gift },
  { to: "/vibe/my-list", label: "My List", icon: Heart },
  { to: "/vibe/profile", label: "Profile", icon: User },
];

function DramaWaveLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="relative min-h-screen bg-dw-background text-dw-foreground">
      <main className="pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-dw-border bg-dw-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-md items-center justify-around px-2">
          {tabs.map((tab) => {
            const active = pathname === tab.to || pathname.startsWith(`${tab.to}/`);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 transition-colors ${
                  active ? "text-dw-primary" : "text-dw-muted hover:text-dw-foreground"
                }`}
              >
                <Icon className="size-5" aria-hidden />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
