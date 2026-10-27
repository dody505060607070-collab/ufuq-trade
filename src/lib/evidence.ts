// TradingAgents-style evidence, pre-trade checklist, in-trade thesis check and post-trade review for the demo challenge (pure).
// Every tool here already existed in the platform; this module only decides when each is relevant and records why.
import { adx } from "./indicators";
import { marketStructure, liquiditySweep, killZone } from "./ict";
import { candlePattern, pullbackBreakout, climaxReversal, volRegime, displacement } from "./priceaction";
import { newsSentiment } from "./sentiment";
import type { Bar } from "./challenge";

export const STRATEGY_VERSION = "mtf-debate-v1";

export type Tool = { name: string; used: boolean; why: string; result?: string; vote?: "buy" | "sell" | "neutral" };
export type Evidence = { tools: Tool[]; votes: { for: number; against: number }; text: string };

/** Run each relevant analysis tool on data available NOW (no future bars) and record use/skip reasons. */
export function buildEvidence(p: { symbol: string; dir: "buy" | "sell"; m15: Bar[]; h1: Bar[]; headlines: string[] | null; now?: Date }): Evidence {
  const tools: Tool[] = [];
  const vote = (v: "buy" | "sell" | null | undefined): Tool["vote"] => (v ? v : "neutral");
  const add = (t: Tool) => tools.push(t);
  if (p.h1.length >= 30) {
    const s = marketStructure(p.h1);
    add({ name: "Market structure (H1, ICT)", used: true, why: "Confirms trend by BOS/CHoCH", result: `${s.bias}${s.event ? ` ${s.event}` : ""}`, vote: s.bias === "bullish" ? "buy" : s.bias === "bearish" ? "sell" : "neutral" });
  } else add({ name: "Market structure (H1, ICT)", used: false, why: "Fewer than 30 H1 bars" });
  if (p.m15.length >= 30) {
    const a = adx(p.m15);
    add({ name: "ADX trend strength (M15)", used: true, why: "Is the market trending or ranging?", result: a == null ? "n/a" : `${a.toFixed(0)} (${a >= 20 ? "trending" : "ranging"})`, vote: "neutral" });
    const pb = pullbackBreakout(p.m15);
    add({ name: "Pullback breakout (M15)", used: true, why: "Entry timing inside the trend", result: pb ?? "none", vote: vote(pb) });
    const cr = climaxReversal(p.m15);
    add({ name: "Climax reversal (M15)", used: true, why: "Detects exhausted moves against the trade", result: cr ?? "none", vote: vote(cr) });
    const cp = candlePattern(p.m15);
    add({ name: "Candle pattern (M15)", used: true, why: "Last-candle confirmation", result: cp ?? "none", vote: cp ? (/bull|hammer|engulfing up|morning/i.test(cp) ? "buy" : /bear|shooting|engulfing down|evening/i.test(cp) ? "sell" : "neutral") : "neutral" });
    const d = displacement(p.m15);
    add({ name: "Displacement (M15)", used: true, why: "Strong institutional move", result: d ?? "none", vote: d === "bullish" ? "buy" : d === "bearish" ? "sell" : "neutral" });
    const ls = liquiditySweep(p.m15);
    add({ name: "Liquidity sweep (M15)", used: true, why: "Stop-hunt before reversal", result: ls ?? "none", vote: ls === "sell-side" ? "buy" : ls === "buy-side" ? "sell" : "neutral" });
  } else add({ name: "M15 pattern tools", used: false, why: "Fewer than 30 M15 bars" });
  const vr = p.m15.length >= 60 ? volRegime(p.m15) : "unknown";
  add({ name: "Volatility regime (M15)", used: vr !== "unknown", why: vr === "unknown" ? "Not enough bars" : "Low volatility needs more confirmation", result: vr, vote: "neutral" });
  const kz = killZone(p.now ?? new Date());
  add({ name: "Session / kill zone", used: true, why: "Liquidity is thinner outside London/New York", result: kz ?? "outside London/NY", vote: "neutral" });
  if (/XAU|XAG/.test(p.symbol) && p.headlines?.length) {
    const s = newsSentiment(p.headlines);
    add({ name: "News sentiment (metals keywords)", used: true, why: "Headline keyword model is built for gold/silver", result: `${s.label} (${s.score})`, vote: s.label === "bullish" ? "buy" : s.label === "bearish" ? "sell" : "neutral" });
  } else add({ name: "News sentiment", used: false, why: p.headlines?.length ? "Keyword model only covers gold/silver; no reliable sentiment for this asset" : "No headlines available" });
  const voted = tools.filter((t) => t.used && t.vote && t.vote !== "neutral");
  const votes = { for: voted.filter((t) => t.vote === p.dir).length, against: voted.filter((t) => t.vote !== p.dir).length };
  const text = tools.filter((t) => t.used).map((t) => `- ${t.name}: ${t.result}`).join("\n");
  return { tools, votes, text };
}

export type Checklist = { q: string; ok: boolean | null; note: string }[];
/** Pre-trade questions answered from code. null = unknown (counts as uncertainty, never as a pass). */
export function preTradeChecklist(p: {
  trends: Record<string, string | null | undefined>; dir: "buy" | "sell"; priceAgeMin: number | null; ev: Evidence;
  rr: number | null; costShare: number | null; debate: { bull: string[]; bear: string[]; failure: string[]; missing: string[] } | null;
}): Checklist {
  const want = p.dir === "buy" ? "up" : "down";
  const tfs = Object.entries(p.trends).filter(([, v]) => v);
  const agree = tfs.filter(([, v]) => v === want).length;
  const adxTool = p.ev.tools.find((t) => t.name.startsWith("ADX"));
  const ranging = adxTool?.result ? /ranging/.test(adxTool.result) : null;
  return [
    { q: "Is the trend clear (not ranging)?", ok: ranging == null ? null : !ranging, note: adxTool?.result ?? "ADX unavailable" },
    { q: "Do several timeframes agree?", ok: tfs.length ? agree >= Math.ceil(tfs.length * 0.6) : null, note: `${agree}/${tfs.length} timeframes ${want}` },
    { q: "Is the data fresh?", ok: p.priceAgeMin == null ? null : p.priceAgeMin < 20, note: p.priceAgeMin == null ? "unknown age" : `${p.priceAgeMin.toFixed(1)} min old` },
    { q: "More tools for than against?", ok: p.ev.votes.for + p.ev.votes.against === 0 ? null : p.ev.votes.for > p.ev.votes.against, note: `${p.ev.votes.for} for · ${p.ev.votes.against} against` },
    { q: "Do costs leave the trade worthwhile?", ok: p.costShare == null ? null : p.costShare <= 0.2, note: p.costShare == null ? "unknown" : `costs ${(p.costShare * 100).toFixed(0)}% of stop` },
    { q: "Is reward/risk acceptable (≥1.5)?", ok: p.rr == null ? null : p.rr >= 1.5, note: p.rr == null ? "unknown" : p.rr.toFixed(2) },
    { q: "Reasons supporting the trade", ok: p.debate ? p.debate.bull.length > 0 : null, note: p.debate?.bull.join(" · ") || "—" },
    { q: "Reasons against / how it could fail", ok: null, note: [...(p.debate?.bear ?? []), ...(p.debate?.failure ?? [])].join(" · ") || "—" },
    { q: "Missing data / uncertainty", ok: p.debate ? p.debate.missing.length === 0 : null, note: p.debate?.missing.join(" · ") || "none listed" },
  ];
}

/** Accept only when no checklist item fails and unknowns are at most 2; otherwise wait. */
export function checklistVerdict(c: Checklist): { decision: "accept" | "wait" | "reject"; reason: string } {
  const failed = c.filter((x) => x.ok === false), unknown = c.filter((x) => x.ok === null && !x.q.startsWith("Reasons against"));
  if (failed.some((x) => /costs|reward|fresh/.test(x.q))) return { decision: "reject", reason: failed.map((x) => x.q).join("; ") };
  if (failed.length) return { decision: "wait", reason: `Failed: ${failed.map((x) => x.q).join("; ")}` };
  if (unknown.length > 2) return { decision: "wait", reason: `Too much uncertainty: ${unknown.map((x) => x.q).join("; ")}` };
  return { decision: "accept", reason: "All checks passed" };
}

/** In-trade: thesis is broken when both H1 and H4 now point against the position. */
export function thesisBroken(side: "buy" | "sell", trends: Record<string, string | null | undefined>): string | null {
  const against = side === "buy" ? "down" : "up";
  return trends["H1"] === against && trends["H4"] === against ? `H1 and H4 turned ${against} against the ${side}` : null;
}

export type Review = { r_multiple: number; followed_plan: boolean; process_score: number; outcome_class: "good decision, good outcome" | "good decision, bad outcome (variance)" | "weak decision, lucky win" | "weak decision, deserved loss"; lessons: string[] };
/** Post-trade review: judges the DECISION from its pre-trade checklist, separately from the money outcome. */
export function reviewTrade(p: { profit: number; risk_usd: number; close_reason: string; checklist: Checklist | null; votes: { for: number; against: number } | null }): Review {
  const r = p.risk_usd > 0 ? Math.round((p.profit / p.risk_usd) * 100) / 100 : 0;
  const followed = ["stop_loss", "take_profit", "thesis invalidated"].includes(p.close_reason);
  const items = (p.checklist ?? []).filter((x) => x.ok !== null);
  const process = items.length ? Math.round((items.filter((x) => x.ok).length / items.length) * 100) : 0;
  const good = process >= 70;
  const cls: Review["outcome_class"] = good ? (p.profit > 0 ? "good decision, good outcome" : "good decision, bad outcome (variance)") : p.profit > 0 ? "weak decision, lucky win" : "weak decision, deserved loss";
  const lessons: string[] = [];
  if (!followed) lessons.push(`Closed by "${p.close_reason}", not by the plan`);
  for (const x of p.checklist ?? []) if (x.ok === false) lessons.push(`Entered despite failing: ${x.q}`);
  if (p.votes && p.votes.against >= p.votes.for && p.profit <= 0) lessons.push("Tools were split or against; similar setups need more confirmation");
  if (good && p.profit <= 0) lessons.push("Decision met the rules; a loss here is expected variance, not a reason to change the strategy");
  return { r_multiple: r, followed_plan: followed, process_score: process, outcome_class: cls, lessons };
}

/** Risk-adjusted return: mean R / stdev R (per-trade Sharpe-like). null with fewer than 3 trades. */
export function riskAdjusted(rs: number[]): number | null {
  if (rs.length < 3) return null;
  const m = rs.reduce((s, x) => s + x, 0) / rs.length;
  const sd = Math.sqrt(rs.reduce((s, x) => s + (x - m) ** 2, 0) / (rs.length - 1));
  return sd > 0 ? Math.round((m / sd) * 100) / 100 : null;
}
