import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Film } from "lucide-react";

type Plan = "free" | "creator" | "studio";

const PLAN_LABEL: Record<Plan, string> = {
  free: "the Free plan",
  creator: "Creator",
  studio: "Studio",
};

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { plan?: Plan | undefined } => ({
    plan:
      search["plan"] === "creator" || search["plan"] === "studio" || search["plan"] === "free"
        ? (search["plan"] as Plan)
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Jeje Inc Vibe" },
      { name: "description", content: "Sign in or create your Jeje Inc Vibe account to save and make short films." },
      { property: "og:title", content: "Sign in — Jeje Inc Vibe" },
      { property: "og:description", content: "Sign in or create your Jeje Inc Vibe account to save and make short films." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { plan } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(plan ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const afterSignIn = () => {
    if (plan === "creator" || plan === "studio") {
      navigate({ to: "/dramawave/profile", search: { shop: plan } });
    } else {
      navigate({ to: "/" });
    }
  };

  /** Coming back from Google: the session is already set, so continue straight away. */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) afterSignIn();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth${plan ? `?plan=${plan}` : ""}`,
      });
      if (result.error) throw result.error;
      if (!("redirected" in result && result.redirected)) {
        toast.success("Welcome to Jeje Inc Vibe!");
        afterSignIn();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Welcome to Jeje Inc Vibe!");
          afterSignIn();
        } else {
          toast.success("Check your email to confirm your account.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        afterSignIn();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background px-6 py-10 text-foreground">
      <header className="mb-10 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Film className="size-5" aria-hidden />
        </div>
        <Link to="/" className="font-display text-xl italic tracking-tight text-primary">
          Jeje Inc Vibe
        </Link>
      </header>

      <div className="mx-auto w-full max-w-sm">
        {plan && (
          <p className="mb-6 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            You're joining {PLAN_LABEL[plan]}
          </p>
        )}
        <h1 className="font-display text-3xl italic tracking-tight">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Sign in to make films, save them to your account and manage your coins."
            : "Join Jeje Inc Vibe — every short you make is saved to your account."}
        </p>

        <Button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          variant="outline"
          className="mt-8 h-12 w-full rounded-xl border-border bg-card text-sm font-semibold text-foreground hover:bg-card/70 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="mr-3 size-5" aria-hidden>
            <path
              fill="#4285F4"
              d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.3v3.1A12 12 0 0 0 12 24Z"
            />
            <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
            <path
              fill="#EA4335"
              d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"
            />
          </svg>
          Continue with Google
        </Button>

        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="h-12 rounded-xl border-border bg-card text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="••••••••"
              className="h-12 rounded-xl border-border bg-card text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:shadow-[0_0_24px_var(--glow)] disabled:opacity-50"
          >
            {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="font-medium text-primary hover:underline"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>

        <div className="mt-8 text-center">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            Back to Jeje Inc Vibe
          </Link>
        </div>
      </div>
    </div>
  );
}
