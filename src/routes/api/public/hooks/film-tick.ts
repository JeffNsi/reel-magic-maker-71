import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Cron: advance film scene jobs. Guarded by the server-only cron secret. */
export const Route = createFileRoute("/api/public/hooks/film-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { runFilmTick } = await import("@/lib/scene-job.server");
        const report = await runFilmTick();
        return new Response(JSON.stringify(report), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
