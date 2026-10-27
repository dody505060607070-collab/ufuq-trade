import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Emergency stop of the caller's own demo challenge: blocks entries and closes demo positions now. */
export const emergencyStopSim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Ownership and allowed status change go through the caller's RLS-scoped client first.
    const { data: own, error } = await context.supabase.from("sim_challenges")
      .update({ status: "stopped", stop_reason: "Emergency stop", updated_at: new Date().toISOString() })
      .eq("id", data.id).eq("user_id", context.userId).select("id").maybeSingle();
    if (error || !own) throw new Error("Challenge not found or already ended.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { closeAllNow } = await import("./sim-run.server");
    const closed = await closeAllNow(supabaseAdmin, own.id, "emergency stop");
    return { closed };
  });
