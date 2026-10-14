import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * SELF TEST ("backtest") — a read-only health sweep of every moving part.
 *
 * It touches nothing: no generation, no credit spend, no writes. It only reads
 * counts, checks that keys are present and asks the AI gateway and fal.ai
 * whether they would accept work right now, so a blocked balance shows up as a
 * named check instead of a dead button somewhere in the app.
 */

export type CheckStatus = "ok" | "warn" | "fail";

export type Check = {
  group: string;
  name: string;
  status: CheckStatus;
  detail: string;
};

export type SelfTestReport = {
  ran_at: string;
  ok: number;
  warn: number;
  fail: number;
  checks: Check[];
};

const TABLES = [
  "profiles",
  "generations",
  "videos",
  "stories",
  "story_scenes",
  "director_sessions",
  "director_turns",
  "film_watchlist",
  "coin_purchases",
  "episodes",
  "my_list",
  "user_unlocked_episodes",
  "teams",
  "team_members",
  "team_invites",
] as const;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export const runSelfTest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ probe_engines: z.boolean().default(true) }).parse(data ?? {}),
  )
  .handler(async ({ data }): Promise<SelfTestReport> => {
    const checks: Check[] = [];
    const add = (group: string, name: string, status: CheckStatus, detail: string) =>
      checks.push({ group, name, status, detail });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // --- Database tables -----------------------------------------------------
    for (const table of TABLES) {
      try {
        const { count, error } = await withTimeout(
          (supabaseAdmin as unknown as { from: (t: string) => any })
            .from(table)
            .select("*", { count: "exact", head: true }) as unknown as Promise<{
            count: number | null;
            error: { message: string } | null;
          }>,
          8000,
        );
        if (error) add("Database", table, "fail", error.message);
        else add("Database", table, "ok", `${count ?? 0} rows`);
      } catch (e) {
        add("Database", table, "fail", e instanceof Error ? e.message : "unreachable");
      }
    }

    // --- Video storage -------------------------------------------------------
    try {
      const { BUCKET } = await import("@/lib/storyreel-core.server");
      const { data: files, error } = await withTimeout(
        supabaseAdmin.storage.from(BUCKET).list("", { limit: 1 }) as unknown as Promise<{
          data: unknown[] | null;
          error: { message: string } | null;
        }>,
        8000,
      );
      if (error) add("Storage", "video bucket", "fail", error.message);
      else
        add(
          "Storage",
          "video bucket",
          "ok",
          files && files.length > 0 ? "reachable, holds files" : "reachable, empty",
        );
    } catch (e) {
      add("Storage", "video bucket", "fail", e instanceof Error ? e.message : "unreachable");
    }

    // --- Finished films ------------------------------------------------------
    try {
      const { count: done } = (await supabaseAdmin
        .from("generations")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed")) as unknown as { count: number | null };
      const { count: failed } = (await supabaseAdmin
        .from("generations")
        .select("*", { count: "exact", head: true })
        .eq("status", "failed")) as unknown as { count: number | null };
      add(
        "Films",
        "finished clips",
        (done ?? 0) > 0 ? "ok" : "warn",
        `${done ?? 0} finished, ${failed ?? 0} failed`,
      );
      const { count: scenesWithTruth } = (await supabaseAdmin
        .from("story_scenes")
        .select("*", { count: "exact", head: true })
        .not("truth", "is", null)) as unknown as { count: number | null };
      add(
        "Films",
        "scene truth saved",
        (scenesWithTruth ?? 0) > 0 ? "ok" : "warn",
        `${scenesWithTruth ?? 0} scenes carry a locked director decision`,
      );
    } catch (e) {
      add("Films", "finished clips", "fail", e instanceof Error ? e.message : "unreadable");
    }

    // --- Keys ----------------------------------------------------------------
    const keys: Array<[string, string]> = [
      ["Ezy engine key", "LOVABLE_API_KEY"],
      ["Strong engine key", "FAL_KEY"],
      ["Checkout key", "SUMUP_API_KEY"],
    ];
    for (const [label, env] of keys) {
      const present = !!process.env[env];
      add("Keys", label, present ? "ok" : "warn", present ? "configured" : "not configured");
    }

    // --- Engine reachability (no generation, no spend) -----------------------
    if (data.probe_engines) {
      const lovableKey = process.env["LOVABLE_API_KEY"];
      if (lovableKey) {
        try {
          const res = await withTimeout(
            fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${lovableKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-3.8-flash",
                max_tokens: 1,
                messages: [{ role: "user", content: "ok" }],
              }),
            }),
            15000,
          );
          if (res.ok) add("Engines", "Ezy / director brain", "ok", "answering normally");
          else if (res.status === 402)
            add(
              "Engines",
              "Ezy / director brain",
              "fail",
              "out of AI credits — the director cannot answer until they are topped up",
            );
          else if (res.status === 429)
            add(
              "Engines",
              "Ezy / director brain",
              "warn",
              "rate limited right now, try again shortly",
            );
          else add("Engines", "Ezy / director brain", "fail", `refused with status ${res.status}`);
        } catch (e) {
          add(
            "Engines",
            "Ezy / director brain",
            "fail",
            e instanceof Error ? e.message : "unreachable",
          );
        }
      } else {
        add("Engines", "Ezy / director brain", "warn", "no key configured");
      }

      const falKey = process.env["FAL_KEY"];
      if (falKey) {
        try {
          const { FAL_QUEUE_BASE, FAL_MODEL_ID, falHeaders } =
            await import("@/lib/storyreel-core.server");
          const res = await withTimeout(
            fetch(
              `${FAL_QUEUE_BASE}/${FAL_MODEL_ID}/requests/00000000-0000-0000-0000-000000000000/status`,
              { headers: falHeaders(falKey) },
            ),
            15000,
          );
          // A missing request id means the key was accepted — that is the pass case.
          if (res.status === 404 || res.status === 405 || res.ok)
            add("Engines", "Strong / fal.ai", "ok", "account accepts work");
          else if (res.status === 401 || res.status === 403)
            add("Engines", "Strong / fal.ai", "fail", "key rejected");
          else if (res.status === 402)
            add(
              "Engines",
              "Strong / fal.ai",
              "fail",
              "fal.ai balance exhausted — top up at fal.ai",
            );
          else add("Engines", "Strong / fal.ai", "warn", `answered with status ${res.status}`);
        } catch (e) {
          add("Engines", "Strong / fal.ai", "warn", e instanceof Error ? e.message : "unreachable");
        }
      } else {
        add("Engines", "Strong / fal.ai", "warn", "no key configured");
      }
    }

    // --- Apple Pay verification file ----------------------------------------
    try {
      const res = await withTimeout(
        fetch(
          "https://reel-magic-maker-71.lovable.app/.well-known/apple-developer-merchantid-domain-association",
        ),
        10000,
      );
      const text = res.ok ? await res.text() : "";
      const placeholder = text.includes("PASTE_SUMUP");
      if (res.ok && !placeholder)
        add("Checkout", "Apple Pay domain file", "ok", `served, ${text.length} characters`);
      else if (res.ok)
        add("Checkout", "Apple Pay domain file", "fail", "still holds placeholder text");
      else add("Checkout", "Apple Pay domain file", "warn", `live site answered ${res.status}`);
    } catch (e) {
      add(
        "Checkout",
        "Apple Pay domain file",
        "warn",
        e instanceof Error ? e.message : "could not reach the live site",
      );
    }

    return {
      ran_at: new Date().toISOString(),
      ok: checks.filter((c) => c.status === "ok").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length,
      checks,
    };
  });
