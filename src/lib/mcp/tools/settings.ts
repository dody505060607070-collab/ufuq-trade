import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";
export default defineTool({
  name: "read_my_autopilot", title: "My Auto-Pilot settings",
  description: "Read your automation and safety settings without changing them.",
  inputSchema: {}, annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const { db, userId } = await supabaseForUser(ctx);
    const { data, error } = await db.from("autopilot_settings").select("enabled,symbols,timeframe,min_confidence,lot_size,max_open,max_daily,avoid_news,profit_target_usd,lock_start_usd,giveback_pct,cooldown_minutes,daily_target_usd").eq("user_id", userId).maybeSingle();
    if (error) throw new ToolError("Could not read your settings.");
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
});