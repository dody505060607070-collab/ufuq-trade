import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
export default defineTool({
  name: "list_my_analyses", title: "My saved market analyses",
  description: "Read your saved AI analyses without starting new analysis or API charges.",
  inputSchema: { limit: z.number().int().min(1).max(50).default(10) },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    const { db, userId } = await supabaseForUser(ctx);
    const { data, error } = await db.from("analyses").select("id,symbol,timeframe,direction,confidence,entry,stop_loss,take_profit,summary,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
    if (error) throw new ToolError("Could not read your analyses.");
    return { content: [{ type: "text", text: JSON.stringify(data ?? []) }] };
  },
});