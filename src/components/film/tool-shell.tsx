import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";

export function ToolShell({ title, children }: { title: string; children: ReactNode }) {
  const { locale, setLocale, t } = useLocale();
  return (
    <main className="min-h-screen bg-background text-foreground pb-20">
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-4 flex flex-wrap items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/" aria-label={t("Home", "Hem")}>
              <ArrowLeft />
            </Link>
          </Button>
          <Link to="/" className="font-display text-2xl italic text-primary">
            Shortizereel
          </Link>
          <nav className="ml-auto flex flex-wrap gap-1">
            <Button asChild variant="ghost">
              <Link to="/create">{t("Create film", "Skapa film")}</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/characters">{t("Characters", "Karaktärer")}</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setLocale(locale === "en" ? "sv" : "en");
                window.location.reload();
              }}
            >
              {locale === "en" ? "SV" : "EN"}
            </Button>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6">
        <h1 className="font-display text-4xl italic mb-8">{title}</h1>
        {children}
      </div>
    </main>
  );
}
