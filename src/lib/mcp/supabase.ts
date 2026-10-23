import { createClient } from "@supabase/supabase-js";
import { ToolError, type ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";

export async function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  const userId = ctx.getUserId();
  if (!token || !userId || !ctx.getClientId()) throw new ToolError("Sign in and authorize this assistant first.");
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new ToolError("Assistant access is not configured.");
  const db = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc("is_approved", { _user_id: userId });
  if (error || !data) throw new ToolError("Your account must be approved before accessing trading data.");
  return { db, userId };
}