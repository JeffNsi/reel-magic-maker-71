import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Film } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — DramaWave" },
      { name: "description", content: "Sign in or create a DramaWave account." },
      { property: "og:title", content: "Sign in — DramaWave" },
      { property: "og:description", content: "Sign in or create a DramaWave account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate({ to: "/dramawave" });
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-dw-background px-6 py-10 text-dw-foreground">
      <header className="mb-10 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl dw-btn-primary">
          <Film className="size-5" aria-hidden />
        </div>
        <span className="text-xl font-semibold tracking-tight">DramaWave</span>
      </header>

      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-3xl font-bold tracking-tight">
          {mode === "signin" ? "Welcome back" : "Create account"}
        </h1>
        <p className="mt-2 text-sm text-dw-muted">
          {mode === "signin" ? "Sign in to unlock episodes and earn coins." : "Join DramaWave to start binge-watching."}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="h-12 rounded-xl border-dw-border bg-dw-card text-dw-foreground placeholder:text-dw-muted"
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
              className="h-12 rounded-xl border-dw-border bg-dw-card text-dw-foreground placeholder:text-dw-muted"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="h-12 w-full rounded-xl dw-btn-primary text-sm font-semibold disabled:opacity-50"
          >
            {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-dw-muted">
          {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="font-medium text-dw-primary hover:underline"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>

        <div className="mt-8 text-center">
          <Link to="/dramawave" className="text-sm text-dw-muted hover:text-dw-foreground">
            Continue browsing as guest
          </Link>
        </div>
      </div>
    </div>
  );
}
