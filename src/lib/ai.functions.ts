import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  symbol: z.string().trim().min(2).max(20),
  timeframe: z.enum(["M5", "M15", "H1", "H4", "D1"]),
  price: z.number().positive().nullable(),
});

const resultSchema = z.object({
  direction: z.enum(["buy", "sell", "neutral"]),
  confidence: z.number().min(0).max(100),
  entry: z.number().nullable(),
  stop_loss: z.number().nullable(),
  take_profit: z.number().nullable(),
  summary: z.string().max(2000),
});

export const analyzeMarket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured.");
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText } = await import("ai");
    const { fetchCandles, fetchCalendar, fetchNews } = await import("./market.server");

    const [{ data: model }, { data: inst }] = await Promise.all([
      context.supabase.from("ai_models").select("model_id").eq("is_default", true).eq("is_active", true).maybeSingle(),
      context.supabase.from("instruments").select("name,yahoo_symbol").eq("symbol", data.symbol).maybeSingle(),
    ]);

    // Live market context from free public sources.
    const [candles, calendar, news] = await Promise.all([
      inst?.yahoo_symbol ? fetchCandles(inst.yahoo_symbol, data.timeframe, 80).catch(() => []) : Promise.resolve([]),
      fetchCalendar(),
      fetchNews(15),
    ]);
    const last = candles[candles.length - 1];
    const price = data.price ?? last?.c ?? null;
    const dec = price && price < 5 ? 5 : price && price < 500 ? 3 : 2;
    const candleText = candles.map((c) => `${new Date(c.t * 1000).toISOString().slice(0, 16)} O${c.o.toFixed(dec)} H${c.h.toFixed(dec)} L${c.l.toFixed(dec)} C${c.c.toFixed(dec)}`).join("\n");
    const now = Date.now();
    const events = calendar
      .filter((e) => (e.impact === "High" || e.impact === "Medium") && Math.abs(new Date(e.date).getTime() - now) < 3 * 86400_000)
      .slice(0, 25)
      .map((e) => `${e.date.slice(0, 16)} ${e.country} ${e.impact} — ${e.title} (f ${e.forecast || "-"}, p ${e.previous || "-"})`)
      .join("\n");
    const heads = news.map((n) => `- ${n.title} (${n.source})`).join("\n");

    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });

    const result = streamText({
      model: provider.responses(model?.model_id ?? "openai/gpt-6-astra"),
      instructions:
        "You are a senior FX/CFD market analyst. Base the analysis strictly on the price data, economic calendar and headlines provided. Return ONLY a JSON object with keys: direction (buy|sell|neutral), confidence (0-100 integer), entry (number or null), stop_loss (number or null), take_profit (number or null), summary (max 5 sentences: trend/structure, key support & resistance, upcoming events, sentiment, risk). Entry must be near the current price. For buy: stop_loss < entry < take_profit. For sell: take_profit < entry < stop_loss. Use a risk:reward of at least 1:1.5 and place stops beyond recent structure. If the data is unclear or high-impact news is imminent, return neutral with null levels. If no price data is available, return null levels.",
      messages: [
        {
          role: "user",
          content: `Instrument: ${data.symbol} (${inst?.name ?? ""})\nTimeframe: ${data.timeframe}\nCurrent price: ${price ?? "unknown"}\nDate (UTC): ${new Date().toISOString()}\n\nRecent ${data.timeframe} candles (UTC):\n${candleText || "unavailable"}\n\nEconomic calendar (±3 days, medium/high impact):\n${events || "none"}\n\nLatest headlines:\n${heads || "none"}\n\nProvide your directional analysis as json.`,
        },
      ],
      providerOptions: {
        openai: { forceReasoning: true, reasoningEffort: "high", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] },
      },
    });

    let text: string;
    try {
      text = await result.text;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 429) throw new Error("AI is busy right now. Please try again in a minute.");
      if (status === 402) throw new Error("AI credits are exhausted for this workspace.");
      if (status === 403) throw new Error("AI access is blocked for this workspace.");
      throw new Error("AI analysis failed. Please try again.");
    }
    const match = text.match(/\{[\s\S]*\}/);
    let json: unknown = null;
    try { json = match ? JSON.parse(match[0]) : null; } catch { json = null; }
    const parsed = resultSchema.safeParse(json);
    if (!parsed.success) throw new Error("AI returned an unexpected answer. Please try again.");
    const r = sanitizeLevels(parsed.data);

    const { data: row, error } = await context.supabase
      .from("analyses")
      .insert({
        user_id: context.userId,
        symbol: data.symbol,
        timeframe: data.timeframe,
        direction: r.direction,
        confidence: Math.round(r.confidence),
        entry: r.entry,
        stop_loss: r.stop_loss,
        take_profit: r.take_profit,
        summary: r.summary,
      })
      .select()
      .single();
    if (error) throw new Error("Could not save analysis.");
    return row;
  });

/** Drop SL/TP that are on the wrong side of entry so a bad answer can never be copied into an order. */
export function sanitizeLevels<T extends { direction: string; entry: number | null; stop_loss: number | null; take_profit: number | null }>(r: T): T {
  const { direction, entry, stop_loss, take_profit } = r;
  if (direction === "neutral" || entry == null) return { ...r, stop_loss: direction === "neutral" ? null : stop_loss, take_profit: direction === "neutral" ? null : take_profit, entry: direction === "neutral" ? null : entry };
  const okSl = stop_loss == null || (direction === "buy" ? stop_loss < entry : stop_loss > entry);
  const okTp = take_profit == null || (direction === "buy" ? take_profit > entry : take_profit < entry);
  return { ...r, stop_loss: okSl ? stop_loss : null, take_profit: okTp ? take_profit : null };
}
