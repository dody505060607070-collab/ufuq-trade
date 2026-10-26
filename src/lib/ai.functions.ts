import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  symbol: z.string().trim().min(2).max(20),
  timeframe: z.enum(["M5", "M15", "H1", "H4", "D1"]),
  price: z.number().positive().nullable(),
});

export const analyzeMarket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { getCached, getPersonalCached, runAI } = await import("./analysis.server");
    const [{ data: lessons, error: lessonError }, { data: rules, error: ruleError }] = await Promise.all([
      context.supabase.from("trade_lessons").select("id").eq("user_id", context.userId).limit(1),
      context.supabase.from("learned_rules").select("id").eq("user_id", context.userId).eq("is_active", true).eq("status", "approved").limit(1),
    ]);
    if (lessonError || ruleError) throw new Error("Could not load your learning context.");
    const shared = data.price == null && !lessons?.length && !rules?.length;
    let r = null;
    if (shared) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      r = await getCached(supabaseAdmin, data.symbol, data.timeframe);
    } else if (data.price == null) {
      r = await getPersonalCached(context.supabase, data.symbol, data.timeframe, context.userId);
    }
    r ??= await runAI(context.supabase, data.symbol, data.timeframe, data.price, shared ? null : context.userId);
    const { data: row, error } = await context.supabase
      .from("analyses")
      .insert({ user_id: context.userId, symbol: data.symbol, timeframe: data.timeframe, direction: r.direction, confidence: Math.round(r.confidence), entry: r.entry, stop_loss: r.stop_loss, take_profit: r.take_profit, summary: r.summary, shared })
      .select()
      .single();
    if (error) throw new Error("Could not save analysis.");
    return row;
  });
