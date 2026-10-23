import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cotBias, outcomeOf, ruleKey, rulesText } from "./brain";

type DB = SupabaseClient<Database>;

const LESSON_SYS =
  "You are a strict trading coach reviewing one closed trade. Return ONLY JSON: {reason (why it won or lost, max 2 sentences), lesson (max 1 sentence), rule (one short actionable rule for future trades, max 15 words, or empty string if nothing new), tags (array of up to 3 of: trend, counter-trend, news, session, stop-too-tight, target-too-far, ict, price-action, overtrading, good-entry)}.";

async function gemini(system: string, prompt: string): Promise<Record<string, unknown> | null> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) return null;
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }),
  });
  if (!res.ok) { console.error("brain gemini", res.status); return null; }
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  try { return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "null"); } catch { return null; }
}

/** Writes one lesson per newly closed trade (max 5 per cycle) and merges its rule into the rule bank. */
export async function processLessons(db: DB) {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: closed } = await db.from("trades").select("*").eq("status", "closed").gte("closed_at", since).order("closed_at", { ascending: false }).limit(40);
  if (!closed?.length) return 0;
  const { data: done } = await db.from("trade_lessons").select("trade_id").in("trade_id", closed.map((t) => t.id));
  const doneIds = new Set((done ?? []).map((d) => d.trade_id));
  const todo = closed.filter((t) => !doneIds.has(t.id)).slice(0, 5);
  let n = 0;
  for (const t of todo) {
    const profit = Number(t.profit ?? 0);
    const sym = t.symbol.replace(/[^A-Z]/gi, "").toUpperCase().slice(0, 6);
    const { data: an } = await db.from("analyses").select("direction,confidence,summary,created_at").eq("symbol", sym).lte("created_at", t.opened_at ?? t.closed_at ?? new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const prompt = `Trade: ${t.side.toUpperCase()} ${t.symbol} ${t.volume} lot\nOpen ${t.opened_at} @ ${t.open_price}\nClose ${t.closed_at} @ ${t.close_price}\nSL ${t.stop_loss} TP ${t.take_profit}\nProfit ${profit.toFixed(2)} USD (peak ${t.peak_profit ?? "?"})\nAI analysis before entry: ${an ? `${an.direction} ${an.confidence}% — ${an.summary}` : "none"}`;
    const r = await gemini(LESSON_SYS, prompt);
    const rule = typeof r?.rule === "string" ? r.rule.trim().slice(0, 160) : "";
    const { error } = await db.from("trade_lessons").insert({
      user_id: t.user_id, trade_id: t.id, symbol: sym, side: t.side, profit, outcome: outcomeOf(profit),
      reason: typeof r?.reason === "string" ? r.reason.slice(0, 500) : null,
      lesson: typeof r?.lesson === "string" ? r.lesson.slice(0, 300) : null,
      rule: rule || null,
      tags: Array.isArray(r?.tags) ? (r.tags as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 3) : [],
    });
    if (error) continue;
    n++;
    if (rule) {
      const { data: existing } = await db.from("learned_rules").select("id,rule,hits").eq("user_id", t.user_id);
      const match = (existing ?? []).find((e) => ruleKey(e.rule) === ruleKey(rule));
      if (match) await db.from("learned_rules").update({ hits: match.hits + 1, updated_at: new Date().toISOString() }).eq("id", match.id);
      else await db.from("learned_rules").insert({ user_id: t.user_id, symbol: sym, rule });
    }
  }
  return n;
}

/** On Mondays, writes last week's review once per user with trades. */
export async function weeklyReviews(db: DB) {
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
  const weekStart = new Date(monday.getTime() - 7 * 86400_000);
  const ws = weekStart.toISOString().slice(0, 10);
  const { data: lessons } = await db.from("trade_lessons").select("user_id,symbol,side,profit,outcome,lesson").gte("created_at", weekStart.toISOString()).lt("created_at", monday.toISOString());
  const byUser = new Map<string, NonNullable<typeof lessons>>();
  for (const l of lessons ?? []) byUser.set(l.user_id, [...(byUser.get(l.user_id) ?? []), l]);
  for (const [uid, rows] of byUser) {
    const { data: ex } = await db.from("weekly_reviews").select("id").eq("user_id", uid).eq("week_start", ws).maybeSingle();
    if (ex) continue;
    const net = rows.reduce((s, r) => s + Number(r.profit), 0);
    const r = await gemini("You are a trading coach. Return ONLY JSON {summary}: max 5 short sentences on what worked, what failed and the focus for next week.", rows.map((x) => `${x.side} ${x.symbol} ${Number(x.profit).toFixed(2)} — ${x.lesson ?? ""}`).join("\n"));
    if (typeof r?.summary === "string") await db.from("weekly_reviews").insert({ user_id: uid, week_start: ws, summary: r.summary.slice(0, 1500), trades: rows.length, net });
  }
}

const COT: Record<string, string> = {
  XAUUSD: "GOLD - COMMODITY EXCHANGE INC.",
  USOIL: "WTI-PHYSICAL - NEW YORK MERCANTILE EXCHANGE",
  EURUSD: "EURO FX - CHICAGO MERCANTILE EXCHANGE",
};

/** Pulls the weekly CFTC Commitments of Traders report (free) at most once a day. */
export async function refreshCot(db: DB) {
  const { data: last } = await db.from("whale_signals").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last && Date.now() - new Date(last.created_at).getTime() < 86400_000) return;
  const names = Object.values(COT).map((n) => `'${n}'`).join(",");
  const url = `https://publicreporting.cftc.gov/resource/6dca-aqww.json?$where=${encodeURIComponent(`market_and_exchange_names in(${names})`)}&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=24`;
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return;
  const rows = (await res.json()) as Record<string, string>[];
  const inv = Object.fromEntries(Object.entries(COT).map(([k, v]) => [v, k]));
  const up = rows.filter((r) => inv[r.market_and_exchange_names ?? ""]).map((r) => ({
    symbol: inv[r.market_and_exchange_names!]!, source: "cftc_cot", report_date: (r.report_date_as_yyyy_mm_dd ?? "").slice(0, 10),
    long_pos: Number(r.noncomm_positions_long_all), short_pos: Number(r.noncomm_positions_short_all),
    change_long: Number(r.change_in_noncomm_long_all ?? 0), change_short: Number(r.change_in_noncomm_short_all ?? 0),
  }));
  if (up.length) await db.from("whale_signals").upsert(up, { onConflict: "symbol,source,report_date" });
}

/** Prompt context: big-money positioning and the learned rule bank. */
export async function brainContext(db: DB, symbol: string) {
  const [{ data: w }, { data: rules }] = await Promise.all([
    db.from("whale_signals").select("*").eq("symbol", symbol).order("report_date", { ascending: false }).limit(1).maybeSingle(),
    db.from("learned_rules").select("rule,hits,symbol").eq("is_active", true).or(`symbol.eq.${symbol},symbol.is.null`).order("hits", { ascending: false }).limit(12),
  ]);
  const whale = w ? (() => { const b = cotBias(Number(w.long_pos), Number(w.short_pos), Number(w.change_long), Number(w.change_short)); return `CFTC COT ${w.report_date}: speculators ${b.bias} (net ${b.netPct.toFixed(0)}% of positions, weekly net change ${b.weekly})`; })() : "unavailable";
  return { whale, rules: rulesText(rules ?? []) };
}
