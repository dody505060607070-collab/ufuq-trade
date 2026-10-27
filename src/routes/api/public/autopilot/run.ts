import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Scheduled every 5 minutes: runs one Auto-Pilot cycle for all enabled users. */
export const Route = createFileRoute("/api/public/autopilot/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runAutopilot } = await import("@/lib/autopilot-run.server");
        const { runSimChallenges } = await import("@/lib/sim-run.server");
        const sim = await runSimChallenges(supabaseAdmin).catch((e) => ({ error: String(e) }));
        return Response.json({ ...(await runAutopilot(supabaseAdmin)), sim });
      },
    },
  },
});
