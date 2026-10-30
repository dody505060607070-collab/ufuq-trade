import { DAILY_GEMINI_CALLS, SLOW_MODE_MINUTES } from "@/lib/signal-guard";

/** Reserves one Gemini call from today's shared budget; false when the daily cap is reached. Fails closed. */
export async function takeAiCall(): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("take_ai_call", { _cap: DAILY_GEMINI_CALLS });
    if (error) { console.error("ai budget", error.message); return false; }
    return data === true;
  } catch (e) { console.error("ai budget", e); return false; }
}

/** Slow mode (cap reached): reserves the single Gemini call allowed every SLOW_MODE_MINUTES. Fails closed. */
export async function takeSlowAiCall(): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("take_slow_ai_call", { _gap_min: SLOW_MODE_MINUTES });
    if (error) { console.error("ai slow budget", error.message); return false; }
    return data === true;
  } catch (e) { console.error("ai slow budget", e); return false; }
}

/** True when today's normal Gemini budget is used up. */
export async function geminiBudgetUsed(): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("ai_usage").select("calls").eq("day", new Date().toISOString().slice(0, 10)).maybeSingle();
    return (data?.calls ?? 0) >= DAILY_GEMINI_CALLS;
  } catch { return false; }
}
