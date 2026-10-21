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
  summary: z.string().max(1500),
});

export const analyzeMarket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured.");
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText } = await import("ai");

    const { data: model } = await context.supabase.from("ai_models").select("model_id").eq("is_default", true).eq("is_active", true).maybeSingle();
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });

    const result = streamText({
      model: provider.responses(model?.model_id ?? "openai/gpt-6-astra"),
      instructions:
        "You are a professional FX/CFD market analyst. Return ONLY a JSON object with keys: direction (buy|sell|neutral), confidence (0-100 integer), entry (number or null), stop_loss (number or null), take_profit (number or null), summary (max 4 sentences covering trend, key levels, sentiment and risk). If no current price is given, set entry/stop_loss/take_profit to null.",
      messages: [
        {
          role: "user",
          content: `Instrument: ${data.symbol}\nTimeframe: ${data.timeframe}\nCurrent price: ${data.price ?? "unknown"}\nDate (UTC): ${new Date().toISOString()}\nProvide your directional analysis as json.`,
        },
      ],
      providerOptions: {
        openai: { forceReasoning: true, reasoningEffort: "high", store: false, include: ["reasoning.encrypted_content"] },
      },
    });

    let text: string;
    try {
      text = await result.text;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 429) throw new Error("AI is busy right now. Please try again in a minute.");
      if (status === 402) throw new Error("AI credits are exhausted for this workspace.");
      throw new Error("AI analysis failed. Please try again.");
    }
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = resultSchema.safeParse(match ? JSON.parse(match[0]) : null);
    if (!parsed.success) throw new Error("AI returned an unexpected answer. Please try again.");
    const r = parsed.data;

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
