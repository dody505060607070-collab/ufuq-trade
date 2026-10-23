import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
export default defineTool({
  name: "list_my_trades", title: "My trade history",
  description: "Read up to 100 of your most recent trades; never places or closes orders.",
  inputSchema: { limit: z.number().int().min(1).max(100).default(30) },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    const { db, userId } = await supabaseForUser(ctx);
    const { data, error } = await db.from("trades").select("id,account_id,symbol,side,volume,open_price,close_price,stop_loss,take_profit,profit,status,opened_at,closed_at,peak_profit").eq("user_id", userId).order("opened_at", { ascending: false }).limit(limit);
    if (error) throw new ToolError("Could not read your trades.");
    return { content: [{ type: "text", text: JSON.stringify(data ?? []) }] };
  },
});