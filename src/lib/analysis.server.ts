import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { sanitizeLevels } from "./levels";
import { fetchCandles, fetchCalendar, fetchCalendarStatus, fetchNews } from "./market.server";
import { GEMINI_MODEL, dataBlockers, levelProblem, MIN_RR, STOP_ATR_MIN, STOP_ATR_MAX } from "./signal-guard";
import { snapshot, snapshotText } from "./indicators";
import { ictText } from "./ict";
import { priceActionText, climaxReversal, pullbackBreakout } from "./priceaction";
import { memoryText } from "./profitlock";
import { brainContext, hindsightContext } from "./brain.server";
import { newsSentiment, sentimentText } from "./sentiment";
import { mtfConflict, mtfText, isSplitTrade, SPLIT_MIN_CONFIDENCE, type MtfTrends } from "./mtf";

type DB = SupabaseClient<Database>;
export type Levels = { direction: "buy" | "sell" | "neutral"; confidence: number; entry: number | null; stop_loss: number | null; take_profit: number | null; summary: string };

export const CACHE_MINUTES = 30; // longer reuse = fewer Gemini calls

const resultSchema = z.object({
  direction: z.enum(["buy", "sell", "neutral"]),
  confidence: z.number().min(0).max(100),
  entry: z.number().nullable(),
  stop_loss: z.number().nullable(),
  take_profit: z.number().nullable(),
  summary: z.string().max(2000),
});

const INSTRUCTIONS =
  `You are a trading desk of eight experts reasoning in one pass: (0) Forecaster - before anything else, projects the most likely path of the next 3-6 candles from momentum, structure, liquidity targets and the last candle pattern, and states it in the summary; (1) Technical analyst - reads the pre-computed indicators (trend, EMA10/50/200, RSI14, MACD, ATR14, swing levels) and candles; (2) Bull researcher - strongest case to buy; (3) Bear researcher - strongest case to sell and what invalidates the bull case; (4) Smart-money analyst - reads the pre-computed ICT/SMC context (structure BOS/CHoCH, premium/discount, unfilled FVGs, order blocks, liquidity sweeps, kill zone) and favours entries at a discount FVG/order block in a bullish structure (or premium in bearish), except in MOMENTUM MODE where trading with the move from premium/discount is allowed; (5) Price-action trader - confirms the entry with the last candle pattern (engulfing/pin bar), displacement, equal-high/low liquidity pools and the daily bias with previous-day high/low, preferring trades in the daily direction; (6) Whale tracker - weighs big-money positioning (CFTC speculators) and the desk's own learned rules, never trading against a rule seen 3+ times without strong confirmation; (7) Risk manager - protect capital first; trade in the direction of H1/H4 when they agree with each other. An M15 move against H1/H4 is a PULLBACK, not a conflict: an M15 rally into premium/resistance inside an H1+H4 downtrend is a sell setup, an M15 dip into discount/support inside an H1+H4 uptrend is a buy setup. When H1 and H4 disagree (SPLIT MODE) do not stop there: if M15 trends with one of them and the entry is confirmed (pullback-breakout, reversal candle, sweep + displacement or ADX >= 25) trade toward the forecast move with confidence 70+. Return neutral only when H1 and H4 disagree and there is no confirmed M15 setup, no strong reversal candle and no strong momentum (if M15 and H1 agree and ADX >= 40, trade with H1 even if H4 still lags, confidence 65-75), or price is in the middle of a range with no level nearby. Place the stop beyond the nearest swing level, between ${STOP_ATR_MIN} and ${STOP_ATR_MAX} ATR from entry, and the target at least ${MIN_RR}x the stop distance; these rules are re-checked in code and any trade that breaks them is rejected. For XAUUSD weight USD drivers heavily (Fed, CPI, NFP, yields, risk sentiment). Trust the computed indicator numbers over your own estimates. Confidence reflects agreement between trend, momentum and news: high only when they align. Return ONLY a JSON object with keys: direction (buy|sell|neutral), confidence (0-100 integer), entry (number or null), stop_loss (number or null), take_profit (number or null), summary (max 5 sentences: verdict, bull vs bear key point, key levels, upcoming USD events, risk). Entry must be near the current price. For buy: stop_loss < entry < take_profit. For sell: take_profit < entry < stop_loss. Never return neutral when the prompt says MOMENTUM MODE ACTIVE unless there is a clear reversal candle, imminent high-impact news or missing data. Otherwise return neutral when H1 and H4 disagree with no confirmed M15 setup, or evidence is truly weak, a high-impact event is within 30 minutes, or data is missing. If no price data is available, return null levels.`;

/** Latest shared analysis of this symbol/timeframe from any user within the cache window. */
export async function getCached(admin: DB, symbol: string, timeframe: string) {
  const since = new Date(Date.now() - CACHE_MINUTES * 60_000).toISOString();
  const { data } = await admin
    .from("analyses")
    .select("direction,confidence,entry,stop_loss,take_profit,summary")
    .eq("symbol", symbol).eq("timeframe", timeframe).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? ({ ...data, direction: data.direction as Levels["direction"], confidence: data.confidence ?? 0, summary: data.summary ?? "" } as Levels) : null;
}

/** Broker candles sent by the MT5 EA, when fresh (last bar within 3 bar-lengths); null → use Yahoo. */
export async function brokerCandles(db: DB, symbol: string, timeframe: string, limit: number) {
  const sec: Record<string, number> = { M5: 300, M15: 900, H1: 3600, H4: 14400, D1: 86400 };
  const { data } = await db.from("broker_candles").select("t,o,h,l,c,account_id").eq("symbol", symbol).eq("timeframe", timeframe).order("t", { ascending: false }).limit(limit * 3);
  if (!data?.length) return null;
  const acc = data[0]!.account_id;
  const rows = data.filter((r) => r.account_id === acc).slice(0, limit).reverse();
  if (Date.now() / 1000 - rows[rows.length - 1]!.t > 3 * (sec[timeframe] ?? 3600) + 600) return null;
  return rows.length >= 30 ? rows.map((r) => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c })) : null;
}

/** Fresh AI analysis from live candles, calendar and headlines. */
export async function runAI(db: DB, symbol: string, timeframe: string, manualPrice: number | null): Promise<Levels> {
  const [, { data: inst }] = await Promise.all([
    db.from("ai_models").select("model_id").eq("is_default", true).eq("is_active", true).maybeSingle(),
    db.from("instruments").select("name,yahoo_symbol").eq("symbol", symbol).maybeSingle(),
  ]);
  const [candles, calStatus, news, past, daily] = await Promise.all([
    brokerCandles(db, symbol, timeframe, 80).then((b) => b ?? (inst?.yahoo_symbol ? fetchCandles(inst.yahoo_symbol, timeframe, 80).catch(() => []) : [])),
    fetchCalendarStatus(),
    fetchNews(15),
    db.from("trades").select("side,profit,closed_at").ilike("symbol", `${symbol}%`).eq("status", "closed").order("closed_at", { ascending: false }).limit(10).then((r) => r.data ?? []),
    inst?.yahoo_symbol && timeframe !== "D1" ? fetchCandles(inst.yahoo_symbol, "D1", 20).catch(() => []) : Promise.resolve([]),
  ]);
  const calendar = calStatus.events;
  const tfTrend = async (tf: string) => {
    if (tf === timeframe) return snapshot(candles)?.trend ?? null;
    const c = (await brokerCandles(db, symbol, tf, 80)) ?? (inst?.yahoo_symbol ? await fetchCandles(inst.yahoo_symbol, tf, 80).catch(() => []) : []);
    return snapshot(c)?.trend ?? null;
  };
  const [m15, h1, h4] = await Promise.all([tfTrend("M15"), tfTrend("H1"), tfTrend("H4")]);
  const mtf: MtfTrends = { M15: m15, H1: h1, H4: h4 };
  const brain = await brainContext(db, symbol).catch(() => ({ whale: "unavailable", rules: "none yet" }));
  const hindsight = await hindsightContext(db, symbol).catch(() => "unavailable");
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
  const prompt = `Instrument: ${symbol} (${inst?.name ?? ""})\nTimeframe: ${timeframe}\nCurrent price: ${price ?? "unknown"}\nDate (UTC): ${new Date().toISOString()}\n\nComputed indicators:\n${snap ? snapshotText(snap, dec) : "unavailable"}\n\nSmart-money (ICT) context:\n${ictText(candles, dec)}\n\nMulti-timeframe trends:\n${mtfText(mtf, snap?.adx14 ?? null)}\n\nPrice action & higher timeframe:\n${priceActionText(candles, daily, dec)}\n\nRecent ${timeframe} candles (UTC):\n${candleText || "unavailable"}\n\nEconomic calendar (±3 days, medium/high impact):\n${calStatus.ok ? events || "none in window" : "FAILED TO LOAD — treat upcoming news risk as unknown"}\n\nLatest headlines:\n${heads || "none"}\n\nTrade memory (our own recent closed ${symbol} trades — learn from them; if recent trades in one direction lost, demand stronger confirmation before repeating it):\n${memoryText(past)}\n\nBig-money positioning:\n${brain.whale}\n\nLearned rules from our past trades:\n${brain.rules}\n\nHindsight — what price did after our recent analyses, including ones we skipped (correlate and learn):\n${hindsight}\n\nProvide your directional analysis as json.`;

  // Gemini first, Radox AI as backup — no Lovable AI fallback.
  const geminiKey = process.env["GEMINI_API_KEY"] ?? "";
  if (!geminiKey && !process.env["RADOX_API_KEY"]) throw new Error("Gemini API key is not configured.");
  const text = await callGemini(geminiKey, prompt);
  if (!text) throw new Error(lastGeminiError ?? "Gemini analysis failed. Please try again.");
  const match = text.match(/\{[\s\S]*\}/);
  let json: unknown = null;
  try { json = match ? JSON.parse(match[0]) : null; } catch { json = null; }
  const parsed = resultSchema.safeParse(json);
  if (!parsed.success) throw new Error("AI returned an unexpected answer. Please try again.");
  const out = sanitizeLevels(parsed.data);
  // Code-side gate: missing/stale data or invalid levels → no trade, with the reason recorded in the summary.
  const blockers = dataBlockers({ lastCandleT: last?.t ?? null, timeframe, calendarOk: calStatus.ok, nowSec: Date.now() / 1000 });
  const bad = levelProblem(out, snap?.atr14 ?? null);
  const rev = climaxReversal(candles), pb = pullbackBreakout(candles), adx = snap?.adx14 ?? null;
  const mtfBad = mtfConflict(out.direction, mtf, rev, adx, pb);
  // Split-mode trades (H1/H4 disagree) need a higher confidence floor.
  const splitWeak = isSplitTrade(out.direction, mtf, rev, adx, pb) && out.confidence < SPLIT_MIN_CONFIDENCE ? `split H1/H4 trade needs ${SPLIT_MIN_CONFIDENCE}%+ confidence` : null;
  const why = [...blockers, ...(bad ? [bad] : []), ...(mtfBad ? [mtfBad] : []), ...(splitWeak ? [splitWeak] : [])];
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

async function callGemini(key: string, prompt: string, system = INSTRUCTIONS): Promise<string | null> {
  if (!(await import("@/lib/ai-budget.server").then((m) => m.takeAiCall()))) { lastGeminiError = "Daily AI budget reached — resumes tomorrow (keeps the $5 Gemini credit lasting a month)"; return null; }
  const primary = key ? await geminiOnce(key, prompt, system) : null;
  if (primary) return primary;
  // Backup: Radox AI (OpenAI-compatible) only when Gemini fails and RADOX_API_KEY is set.
  const backup = await callRadox(prompt, system);
  return backup;
}

async function geminiOnce(key: string, prompt: string, system: string): Promise<string | null> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    console.error("Gemini failed", res.status, body);
    lastGeminiError = res.status === 402 || /credits are depleted|RESOURCE_EXHAUSTED/.test(body) && res.status !== 429
      ? "Gemini credits are used up — top up billing in Google AI Studio"
      : res.status === 429 ? "Gemini rate limit — will retry next cycle"
      : res.status === 400 || res.status === 403 ? "Gemini API key rejected — check GEMINI_API_KEY"
      : `Gemini error ${res.status}`;
    return null;
  }
  lastGeminiError = null;
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") || null;
}

async function callRadox(prompt: string, system: string): Promise<string | null> {
  const key = process.env["RADOX_API_KEY"];
  if (!key) return null;
  const model = process.env["RADOX_MODEL"] || "claude-sonnet-5";
  try {
    const res = await fetch("https://radoxai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
    });
    if (!res.ok) {
      console.error("Radox failed", res.status, (await res.text()).slice(0, 300));
      lastGeminiError = `${lastGeminiError ?? "Gemini failed"}; Radox backup error ${res.status}`;
      return null;
    }
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content || null;
    if (text) lastGeminiError = null;
    return text;
  } catch (e) {
    lastGeminiError = `${lastGeminiError ?? "Gemini failed"}; Radox backup unreachable`;
    console.error("Radox error", e);
    return null;
  }
}

/** Reason of the most recent failed Gemini call in this worker (null after a success). */
export let lastGeminiError: string | null = null;

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

const VERIFY_SYS = "You are a second senior trader reviewing a colleague's trade as a partner, not a blocker. First restate WHY the colleague wants to enter (the main reason) and check whether that reason is actually supported: H1/H4 trend, distance to the next support/resistance, news risk, and whether the stop and target are realistic. If the reason holds and risks are acceptable, agree — do not reject just to be cautious. Reject only for a concrete, specific flaw. Return ONLY JSON: {agree (boolean), confidence (0-100 integer, your own probability the target is hit before the stop), reason (max 2 sentences: the colleague's entry reason and whether it holds)}.";

/** Second-opinion check before an Auto-Pilot trade: a separate Gemini call that must agree. Fails closed. */
export async function verifyTrade(symbol: string, timeframe: string, p: Levels, price: number | null): Promise<{ agree: boolean; confidence: number; reason: string }> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) return { agree: false, confidence: 0, reason: "Second check unavailable (no AI key)" };
  const prompt = `Proposed trade on ${symbol} ${timeframe}: ${p.direction.toUpperCase()} at ${p.entry}, stop ${p.stop_loss}, target ${p.take_profit}, first trader's confidence ${p.confidence}%. Live price: ${price ?? "unknown"}. Date (UTC): ${new Date().toISOString()}.\nFirst trader's reasoning:\n${p.summary}\n\nShould we open it?`;
  const text = await callGemini(key, prompt, VERIFY_SYS).catch(() => null);
  try {
    const j = JSON.parse(text?.match(/\{[\s\S]*\}/)?.[0] ?? "null") as { agree?: unknown; confidence?: unknown; reason?: unknown } | null;
    if (!j) throw new Error();
    return { agree: j.agree === true, confidence: Math.max(0, Math.min(100, Math.round(Number(j.confidence) || 0))), reason: String(j.reason ?? "").slice(0, 300) };
  } catch { return { agree: false, confidence: 0, reason: "Second check failed to answer" }; }
}

const DEBATE_SYS = "You run a short trading-desk debate (roles inside ONE model, not independent agents). Bull researcher: strongest evidence FOR the trade. Bear researcher: strongest evidence AGAINST it and concrete ways it fails. Research manager: weigh both against the tool evidence, costs and open exposure, and decide. The manager asks the proposer 'why are you entering?' and checks that answer against the evidence. Accept when the entry reason is supported and the bear points are only generic risks; reject or wait only for a concrete flaw or genuinely missing key data. Never accept just because confidence is high. Return ONLY JSON: {bull: string[] (max 3), bear: string[] (max 3), failure: string[] (max 2, what would prove it wrong), missing: string[] (data you lacked), decision: 'accept'|'reject'|'wait', confidence: 0-100 integer (probability target before stop), reason: string (max 2 sentences)}.";

export type Debate = { bull: string[]; bear: string[]; failure: string[]; missing: string[]; decision: "accept" | "reject" | "wait"; confidence: number; reason: string; model: string };
/** Bull/bear/manager debate on a proposed demo trade. One Gemini call. Fails closed to 'wait'. */
export async function debateTrade(symbol: string, timeframe: string, p: Levels, evidence: string, context: string, price: number | null): Promise<Debate> {
  const fail = (reason: string): Debate => ({ bull: [], bear: [], failure: [], missing: ["AI debate unavailable"], decision: "wait", confidence: 0, reason, model: GEMINI_MODEL });
  const key = process.env["GEMINI_API_KEY"];
  if (!key) return fail("No AI key");
  const prompt = `Proposed ${p.direction.toUpperCase()} ${symbol} (${timeframe}) at ${p.entry}, stop ${p.stop_loss}, target ${p.take_profit}; proposer confidence ${p.confidence}%. Live price ${price ?? "unknown"}. UTC ${new Date().toISOString()}.\n\nProposer reasoning:\n${p.summary}\n\nTool evidence (computed in code from current bars only):\n${evidence}\n\nContext:\n${context}`;
  const text = await callGemini(key, prompt, DEBATE_SYS).catch(() => null);
  try {
    const j = JSON.parse(text?.match(/\{[\s\S]*\}/)?.[0] ?? "null") as Record<string, unknown> | null;
    if (!j) throw new Error();
    const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 200)).slice(0, 3) : []);
    const d = j["decision"];
    return { bull: arr(j["bull"]), bear: arr(j["bear"]), failure: arr(j["failure"]), missing: arr(j["missing"]), decision: d === "accept" || d === "reject" ? d : "wait", confidence: Math.max(0, Math.min(100, Math.round(Number(j["confidence"]) || 0))), reason: String(j["reason"] ?? "").slice(0, 300), model: GEMINI_MODEL };
  } catch { return fail("Debate returned no valid answer"); }
}
