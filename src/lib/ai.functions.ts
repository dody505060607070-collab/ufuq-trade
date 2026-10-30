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
    const { getCached, runAI } = await import("./analysis.server");
    let r = null;
    // Reuse only the caller's own recent analysis (RLS-scoped client); other users' rows are never read here.
    if (data.price == null) r = await getCached(context.supabase, data.symbol, data.timeframe);
    r ??= await runAI(context.supabase, data.symbol, data.timeframe, data.price);
    const { data: row, error } = await context.supabase
      .from("analyses")
      .insert({ user_id: context.userId, symbol: data.symbol, timeframe: data.timeframe, direction: r.direction, confidence: Math.round(r.confidence), entry: r.entry, stop_loss: r.stop_loss, take_profit: r.take_profit, summary: r.summary, summary_ar: r.summary_ar ?? null })
      .select()
      .single();
    if (error) throw new Error("Could not save analysis.");
    return row;
  });
