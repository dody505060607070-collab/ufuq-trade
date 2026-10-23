import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_TRADE_LOT } from "./lot-settings";

/** Restart button: turns Auto-Pilot + auto trading on for the caller's accounts and runs a cycle right now. */
export const restartAutopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const { data: cur } = await context.supabase.from("autopilot_settings").select("user_id").eq("user_id", uid).maybeSingle();
    if (cur) await context.supabase.from("autopilot_settings").update({ enabled: true, updated_at: new Date().toISOString() }).eq("user_id", uid);
    else await context.supabase.from("autopilot_settings").insert({ user_id: uid, enabled: true, symbols: ["XAUUSD"], timeframe: "H1", min_confidence: 70, lot_size: DEFAULT_TRADE_LOT, max_open: 2, max_daily: 4, avoid_news: true });
    await context.supabase.from("trading_accounts").update({ auto_trading: true }).eq("user_id", uid);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runAutopilot } = await import("./autopilot-run.server");
    return await runAutopilot(supabaseAdmin, uid);
  });
