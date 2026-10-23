import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";
export default defineTool({
  name: "list_my_accounts", title: "My trading accounts",
  description: "Read your trading account balances and connection status, without credentials.",
  inputSchema: {}, annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const { db, userId } = await supabaseForUser(ctx);
    const { data, error } = await db.from("trading_accounts").select("id,platform,label,currency,balance,equity,free_margin,lot_size,auto_trading,last_seen_at").eq("user_id", userId).order("created_at").limit(100);
    if (error) throw new ToolError("Could not read your accounts.");
    return { content: [{ type: "text", text: JSON.stringify(data ?? []) }] };
  },
});