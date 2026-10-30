// Code-side checks on an AI proposal. The model never decides alone whether data is good enough or levels are valid.
export const GEMINI_MODEL = "gemini-3.8-flash"; // verified in this account's model list; used by analysis and trade review
export const MIN_RR = 1.5;           // target must be at least 1.5x the stop distance
export const STOP_ATR_MIN = 0.5;     // stop at least 0.5 ATR from entry (outside noise)
export const STOP_ATR_MAX = 3;       // stop at most 3 ATR from entry
export const MIN_TRADE_CONFIDENCE = 55; // below this the edge is too weak → no trade

const BAR_SEC: Record<string, number> = { M5: 300, M15: 900, H1: 3600, H4: 14400, D1: 86400 };

export type DataHealth = { lastCandleT: number | null; timeframe: string; calendarOk: boolean; nowSec: number };

/** Reasons that block a NEW automated trade because required data is missing or stale. Empty = data OK.
 *  A calendar outage alone does not block: the free feed rate-limits often, the AI is told news risk is unknown,
 *  and the risk engine still applies its own news window. Prices are the only hard data requirement. */
export function dataBlockers(h: DataHealth): string[] {
  const out: string[] = [];
  if (h.lastCandleT == null) out.push("No price data");
  else {
    // Allow 3 bars plus 10 min; weekends are handled by the market-closed check before analysis.
    const limit = 3 * (BAR_SEC[h.timeframe] ?? 3600) + 600;
    if (h.nowSec - h.lastCandleT > limit) out.push(`Price data is stale (${Math.round((h.nowSec - h.lastCandleT) / 60)} min old)`);
  }
  return out;
}

export type Proposal = { direction: string; confidence: number; entry: number | null; stop_loss: number | null; take_profit: number | null };

/** Validates levels against fixed rules. Returns null when valid, else the rejection reason. */
export function levelProblem(p: Proposal, atr: number | null): string | null {
  if (p.direction !== "buy" && p.direction !== "sell") return null; // neutral needs no levels
  if (p.confidence < MIN_TRADE_CONFIDENCE) return `Weak signal (${p.confidence}% < ${MIN_TRADE_CONFIDENCE}%)`;
  const { entry, stop_loss: sl, take_profit: tp } = p;
  if (entry == null || sl == null || tp == null) return "Missing entry, stop or target";
  const buy = p.direction === "buy";
  if (buy ? !(sl < entry && entry < tp) : !(tp < entry && entry < sl)) return "Stop/target on the wrong side of entry";
  const stop = Math.abs(entry - sl);
  const rr = Math.abs(tp - entry) / stop;
  if (rr < MIN_RR) return `Reward/risk ${rr.toFixed(2)} below ${MIN_RR}`;
  if (atr != null && atr > 0) {
    if (stop < atr * STOP_ATR_MIN) return `Stop ${(stop / atr).toFixed(2)} ATR is inside market noise (min ${STOP_ATR_MIN})`;
    if (stop > atr * STOP_ATR_MAX) return `Stop ${(stop / atr).toFixed(2)} ATR is too wide (max ${STOP_ATR_MAX})`;
  }
  return null;
}

/** Max Gemini calls per UTC day (all users, all features). ~40 calls/day keeps a $5 Gemini top-up lasting about a month. */
export const DAILY_GEMINI_CALLS = 40;

/** After DAILY_GEMINI_CALLS is used up, Auto-Pilot keeps going in slow mode: one Gemini analysis every this many minutes (instead of stopping). */
export const SLOW_MODE_MINUTES = 30;

/** Slow mode analyses one symbol per turn: the one whose last Gemini analysis is oldest (never analysed = first). */
export function pickSlowPair(keys: string[], lastAt: Record<string, number | undefined>): string | null {
  let best: string | null = null, bestT = Infinity;
  for (const k of keys) { const t = lastAt[k] ?? 0; if (t < bestT) { bestT = t; best = k; } }
  return best;
}
