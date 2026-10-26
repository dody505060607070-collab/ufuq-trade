import { candleProblem } from "@/lib/candles";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { sanitizeLevels } from "./levels";
import { fetchCandles, fetchCalendar, fetchCalendarStatus, fetchNews } from "./market.server";
import { GEMINI_MODEL, dataBlockers, levelProblem, MIN_RR, STOP_ATR_MIN, STOP_ATR_MAX } from "./signal-guard";
import { snapshot, snapshotText } from "./indicators";
import { ictText } from "./ict";
import { priceActionText } from "./priceaction";
import { memoryText } from "./profitlock";
import { brainContext } from "./brain.server";
import { newsSentiment, sentimentText } from "./sentiment";
import { mtfConflict, mtfText, type MtfTrends } from "./mtf";

type DB = SupabaseClient<Database>;
export type Levels = { direction: "buy" | "sell" | "neutral"; confidence: number; entry: number | null; stop_loss: number | null; take_profit: number | null; summary: string };

export const CACHE_MINUTES = 4;

const resultSchema = z.object({
  direction: z.enum(["buy", "sell", "neutral"]),
  confidence: z.number().min(0).max(100),
  entry: z.number().nullable(),
  stop_loss: z.number().nullable(),
  take_profit: z.number().nullable(),
  summary: z.string().max(2000),
});

const INSTRUCTIONS =
  `You are a trading desk of seven experts reasoning in one pass: (1) Technical analyst - reads the pre-computed indicators (trend, EMA10/50/200, RSI14, MACD, ATR14, swing levels) and candles; (2) Bull researcher - strongest case to buy; (3) Bear researcher - strongest case to sell and what invalidates the bull case; (4) Smart-money analyst - reads the pre-computed ICT/SMC context (structure BOS/CHoCH, premium/discount, unfilled FVGs, order blocks, liquidity sweeps, kill zone) and favours entries at a discount FVG/order block in a bullish structure (or premium in bearish); (5) Price-action trader - confirms the entry with the last candle pattern (engulfing/pin bar), displacement, equal-high/low liquidity pools and the daily bias with previous-day high/low, preferring trades in the daily direction; (6) Whale tracker - weighs big-money positioning (CFTC speculators) and the desk's own learned rules, never trading against a rule seen 3+ times without strong confirmation; (7) Risk manager - protect capital first; trade only when trend, momentum and structure agree, otherwise return neutral (no trade is a valid, normal answer). Place the stop beyond the nearest swing level, between ${STOP_ATR_MIN} and ${STOP_ATR_MAX} ATR from entry, and the target at least ${MIN_RR}x the stop distance; these rules are re-checked in code and any trade that breaks them is rejected. For XAUUSD weight USD drivers heavily (Fed, CPI, NFP, yields, risk sentiment). Trust the computed indicator numbers over your own estimates. Confidence reflects agreement between trend, momentum and news: high only when they align. Return ONLY a JSON object with keys: direction (buy|sell|neutral), confidence (0-100 integer), entry (number or null), stop_loss (number or null), take_profit (number or null), summary (max 5 sentences: verdict, bull vs bear key point, key levels, upcoming USD events, risk). Entry must be near the current price. For buy: stop_loss < entry < take_profit. For sell: take_profit < entry < stop_loss. Return neutral when evidence is weak or conflicting, a high-impact event is within 30 minutes, or data is missing. If no price data is available, return null levels.`;

/** Latest shared analysis of this symbol/timeframe from any user within the cache window. */
export async function getCached(admin: DB, symbol: string, timeframe: string) {
  const since = new Date(Date.now() - CACHE_MINUTES * 60_000).toISOString();
  const { data } = await admin
    .from("analyses")
    .select("direction,confidence,entry,stop_loss,take_profit,summary")
    .eq("symbol", symbol).eq("timeframe", timeframe).eq("shared", true).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? ({ ...data, direction: data.direction as Levels["direction"], confidence: data.confidence ?? 0, summary: data.summary ?? "" } as Levels) : null;
}

export async function getPersonalCached(db: DB, symbol: string, timeframe: string, userId: string) {
  const { data, error } = await db.from("analyses").select("direction,confidence,entry,stop_loss,take_profit,summary")
    .eq("user_id", userId).eq("shared", false).eq("symbol", symbol).eq("timeframe", timeframe)
    .gte("created_at", new Date(Date.now() - CACHE_MINUTES * 60_000).toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? { ...data, direction: data.direction as Levels["direction"], confidence: data.confidence ?? 0, summary: data.summary ?? "" } : null;
}

/** Broker candles sent by the MT5 EA, when fresh (last bar within 3 bar-lengths); null → use Yahoo. */
export async function brokerCandles(db: DB, symbol: string, timeframe: string, limit: number, accountId?: string) {
  let q = db.from("broker_candles").select("t,o,h,l,c,account_id").eq("symbol", symbol).eq("timeframe", timeframe);
  if (accountId) q = q.eq("account_id", accountId);
  const { data } = await q.order("t", { ascending: false }).limit(limit * 3);
  if (!data?.length) return null;
  const acc = data[0]!.account_id;
  const rows = data.filter((r) => r.account_id === acc).slice(0, limit).reverse().map((r) => ({ t: Number(r.t), o: r.o, h: r.h, l: r.l, c: r.c }));
  // Invalid, gappy, frozen or stale broker data falls back to Yahoo.
  const why = candleProblem(rows, timeframe, Date.now() / 1000, Math.min(30, limit));
  if (why) { console.warn("broker candles rejected", symbol, timeframe, why); return null; }
  return rows;
}

/** Fresh AI analysis from live candles, calendar and headlines. userId=null → shared market-only analysis (no personal trades or rules). */
export async function runAI(db: DB, symbol: string, timeframe: string, manualPrice: number | null, userId: string | null = null, accountId?: string): Promise<Levels> {
  const [, { data: inst }] = await Promise.all([
    db.from("ai_models").select("model_id").eq("is_default", true).eq("is_active", true).maybeSingle(),
    db.from("instruments").select("name,yahoo_symbol").eq("symbol", symbol).maybeSingle(),
  ]);
  const [candles, calStatus, news, past, daily] = await Promise.all([
    brokerCandles(db, symbol, timeframe, 80, accountId).then((b) => b ?? (inst?.yahoo_symbol ? fetchCandles(inst.yahoo_symbol, timeframe, 80).catch(() => []) : [])),
    fetchCalendarStatus(),
    fetchNews(15),
    userId ? db.from("trades").select("side,profit,closed_at").eq("user_id", userId).ilike("symbol", `${symbol}%`).eq("status", "closed").order("closed_at", { ascending: false }).limit(10).then((r) => r.data ?? []) : Promise.resolve([]),
    inst?.yahoo_symbol && timeframe !== "D1" ? fetchCandles(inst.yahoo_symbol, "D1", 20).catch(() => []) : Promise.resolve([]),
  ]);
  const calendar = calStatus.events;
  const tfTrend = async (tf: string) => {
    if (tf === timeframe) return snapshot(candles)?.trend ?? null;
    const c = (await brokerCandles(db, symbol, tf, 80, accountId)) ?? (inst?.yahoo_symbol ? await fetchCandles(inst.yahoo_symbol, tf, 80).catch(() => []) : []);
    return snapshot(c)?.trend ?? null;
  };
  const [m15, h1, h4] = await Promise.all([tfTrend("M15"), tfTrend("H1"), tfTrend("H4")]);
  const mtf: MtfTrends = { M15: m15, H1: h1, H4: h4 };
  const brain = await brainContext(db, symbol, userId).catch(() => ({ whale: "unavailable", rules: "none yet" }));
  const last = candles[candles.length - 1];
  const price = manualPrice ?? last?.c ?? null;
  const dec = price && price < 5 ? 5 : price && price < 500 ? 3 : 2;
  const candleText = candles.slice(-40).map((c) => `${new Date(c.t * 1000).toISOString().slice(0, 16)} O${c.o.toFixed(dec)} H${c.h.toFixed(dec)} L${c.l.toFixed(dec)} C${c.c.toFixed(dec)}`).join("\n");
  const now = Date.now();
  const events = calendar
    .filter((e) => (e.impact === "High" || e.impact === "Medium") && Math.abs(new Date(e.date).getTime() - now) < 3 * 86400_000)
    .slice(0, 25)
    .map((e) => `${e.date.slice(0, 16)} ${e.country} ${e.impact} — ${e.title} (f ${e.forecast || "-"}, p ${e.previous || "-"})`)
    .join("\n");
  const heads = news.map((n) => `- ${n.title} (${n.source})`).join("\n") + `\n${sentimentText(newsSentiment(news.map((n) => n.title)))}`;
  const snap = snapshot(candles);
  const prompt = `Instrument: ${symbol} (${inst?.name ?? ""})\nTimeframe: ${timeframe}\nCurrent price: ${price ?? "unknown"}\nDate (UTC): ${new Date().toISOString()}\n\nComputed indicators:\n${snap ? snapshotText(snap, dec) : "unavailable"}\n\nSmart-money (ICT) context:\n${ictText(candles, dec)}\n\nMulti-timeframe trends:\n${mtfText(mtf)}\n\nPrice action & higher timeframe:\n${priceActionText(candles, daily, dec)}\n\nRecent ${timeframe} candles (UTC):\n${candleText || "unavailable"}\n\nEconomic calendar (±3 days, medium/high impact):\n${calStatus.ok ? events || "none in window" : "FAILED TO LOAD — treat upcoming news risk as unknown"}\n\nLatest headlines:\n${heads || "none"}\n\nTrade memory (our own recent closed ${symbol} trades — learn from them; if recent trades in one direction lost, demand stronger confirmation before repeating it):\n${memoryText(past)}\n\nBig-money positioning:\n${brain.whale}\n\nLearned rules from our past trades:\n${brain.rules}\n\nProvide your directional analysis as json.`;

  // Paid Gemini only — no Lovable AI fallback.
  const geminiKey = process.env["GEMINI_API_KEY"];
  if (!geminiKey) throw new Error("Gemini API key is not configured.");
  const text = await callGemini(geminiKey, prompt);
  if (!text) throw new Error("Gemini analysis failed. Please try again.");
  const match = text.match(/\{[\s\S]*\}/);
  let json: unknown = null;
  try { json = match ? JSON.parse(match[0]) : null; } catch { json = null; }
  const parsed = resultSchema.safeParse(json);
  if (!parsed.success) throw new Error("AI returned an unexpected answer. Please try again.");
  const out = sanitizeLevels(parsed.data);
  // Code-side gate: missing/stale data or invalid levels → no trade, with the reason recorded in the summary.
  const blockers = dataBlockers({ lastCandleT: last?.t ?? null, timeframe, calendarOk: calStatus.ok, nowSec: Date.now() / 1000 });
  const bad = levelProblem(out, snap?.atr14 ?? null);
  const mtfBad = mtfConflict(out.direction, mtf);
  const why = [...blockers, ...(bad ? [bad] : []), ...(mtfBad ? [mtfBad] : [])];
  if (why.length && out.direction !== "neutral")
    return { ...out, direction: "neutral", entry: null, stop_loss: null, take_profit: null, summary: `No trade (${why.join("; ")}). AI view: ${out.direction.toUpperCase()} ${out.confidence}%. ${out.summary}`.slice(0, 2000) };
  return out;
}

/** True when a high-impact event for one of the symbol's currencies is within ±windowMin minutes. */
export async function newsNearby(symbol: string, windowMin = 30) {
  const cal = await fetchCalendar().catch(() => []);
  const s = symbol.toUpperCase();
  const cur = s.includes("XAU") || s.includes("OIL") || s.includes("US30") || s.includes("USTEC") ? ["USD"] : [s.slice(0, 3), s.slice(3, 6)];
  const now = Date.now();
  return cal.some((e) => e.impact === "High" && cur.includes(e.country) && Math.abs(new Date(e.date).getTime() - now) < windowMin * 60_000);
}

async function callGemini(key: string, prompt: string): Promise<string | null> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) { console.error("Gemini failed", res.status, (await res.text()).slice(0, 300)); return null; }
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") || null;
}

export async function callLovable(modelId: string, prompt: string): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured.");
  const { createOpenAI } = await import("@ai-sdk/openai");
  const { streamText } = await import("ai");
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  const result = streamText({
    model: provider.responses(modelId),
    instructions: INSTRUCTIONS,
    messages: [{ role: "user", content: prompt }],
    providerOptions: {
      // Low effort: indicators/ICT are pre-computed, so deep reasoning mostly added cost.
      openai: { forceReasoning: true, reasoningEffort: "low", store: false },
    },
  });
  try {
    return await result.text;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 429) throw new Error("AI is busy right now. Please try again in a minute.");
    if (status === 402) throw new Error("AI credits are exhausted for this workspace.");
    if (status === 403) throw new Error("AI access is blocked for this workspace.");
    throw new Error("AI analysis failed. Please try again.");
  }
}
