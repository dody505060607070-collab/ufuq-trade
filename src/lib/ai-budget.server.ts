import { DAILY_GEMINI_CALLS } from "@/lib/signal-guard";

/** Reserves one Gemini call from today's shared budget; false when the daily cap is reached. Fails closed. */
export async function takeAiCall(): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("take_ai_call", { _cap: DAILY_GEMINI_CALLS });
    if (error) { console.error("ai budget", error.message); return false; }
    return data === true;
  } catch (e) { console.error("ai budget", e); return false; }
}
