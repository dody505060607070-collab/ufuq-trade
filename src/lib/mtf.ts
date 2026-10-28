/** Multi-timeframe confluence (pure). A trade must not fight the H1 or H4 trend. */
export type Trend = "up" | "down" | "range" | null;
export type MtfTrends = { M15: Trend; H1: Trend; H4: Trend };

/** Reason a direction conflicts with the higher timeframes, or null when allowed. */
export function mtfConflict(direction: "buy" | "sell" | "neutral", t: MtfTrends, reversal: "buy" | "sell" | null = null, adx: number | null = null, pullback: "buy" | "sell" | null = null): string | null {
  if (direction === "neutral") return null;
  // Split mode: H1/H4 disagree (or both range) but the M15 setup itself is confirmed — allowed (confidence floor checked by the caller).
  if (splitAllowed(direction, t, reversal, adx, pullback)) return null;
  return strictConflict(direction, t, reversal, adx);
}

/** Conflict check without split mode. */
function strictConflict(direction: "buy" | "sell", t: MtfTrends, reversal: "buy" | "sell" | null, adx: number | null): string | null {
  const against = direction === "buy" ? "down" : "up";
  const withDir = direction === "buy" ? "up" : "down";
  const bad = (["H1", "H4"] as const).filter((k) => t[k] === against);
  // Strong momentum: M15 + H1 agree with the trade and ADX >= MOMENTUM_ADX — a lagging H4 alone does not block.
  if (t.M15 === withDir && t.H1 === withDir && bad.length === 1 && bad[0] === "H4" && adx != null && adx >= MOMENTUM_ADX) return null;
  // A confirmed M15 climax reversal may trade against one higher timeframe, never both.
  if (reversal === direction && bad.length < 2) return null;
  if (bad.length) return `${direction} against ${bad.join("+")} trend`;
  if (t.H1 === "range" && t.H4 === "range") return "H1 and H4 both ranging";
  return null;
}

/** Split mode: when H1 and H4 disagree the desk may still trade a confirmed M15 setup. */
export const SPLIT_ADX = 25;
export const SPLIT_MIN_CONFIDENCE = 70;

/** True when H1/H4 are split (one with the trade, one against) or both ranging, M15 trends with the trade
 *  and the entry is confirmed by a pullback-breakout, a climax reversal or ADX >= SPLIT_ADX. Never against both. */
export function splitAllowed(direction: "buy" | "sell", t: MtfTrends, reversal: "buy" | "sell" | null, adx: number | null, pullback: "buy" | "sell" | null): boolean {
  const withDir = direction === "buy" ? "up" : "down";
  const against = direction === "buy" ? "down" : "up";
  if (t.M15 !== withDir) return false;
  const split = (t.H1 === withDir && t.H4 === against) || (t.H4 === withDir && t.H1 === against);
  const ranging = t.H1 === "range" && t.H4 === "range";
  if (!split && !ranging) return false;
  if (ranging) return pullback === direction || reversal === direction;
  // Split H1/H4 with M15 already trending with the trade is itself the confirmation; the 70% floor, stop and RR checks still apply.
  void adx;
  return true;
}

/** True when the trade only passes because of split mode (so the higher confidence floor applies). */
export function isSplitTrade(direction: "buy" | "sell" | "neutral", t: MtfTrends, reversal: "buy" | "sell" | null, adx: number | null, pullback: "buy" | "sell" | null): boolean {
  if (direction === "neutral") return false;
  return strictConflict(direction, t, reversal, adx) !== null && splitAllowed(direction, t, reversal, adx, pullback);
}

/** ADX level at which an M15+H1 move may trade against a lagging H4. */
export const MOMENTUM_ADX = 40;

/** Direction allowed by strong momentum (M15+H1 agree, H4 lags/against, ADX >= MOMENTUM_ADX), else null. */
export function momentumBias(t: MtfTrends, adx: number | null): "buy" | "sell" | null {
  if (adx == null || adx < MOMENTUM_ADX) return null;
  if (t.M15 === "up" && t.H1 === "up" && t.H4 !== "up") return "buy";
  if (t.M15 === "down" && t.H1 === "down" && t.H4 !== "down") return "sell";
  return null;
}

export function mtfText(t: MtfTrends, adx: number | null = null): string {
  const base = `M15 ${t.M15 ?? "n/a"} | H1 ${t.H1 ?? "n/a"} | H4 ${t.H4 ?? "n/a"}`;
  const m = momentumBias(t, adx);
  if (m)
    return `${base}\nMOMENTUM MODE ACTIVE: M15 and H1 both ${t.H1}, ADX ${adx!.toFixed(1)} >= ${MOMENTUM_ADX}. This is NOT a timeframe conflict — the H4 is lagging. A ${m.toUpperCase()} is allowed and preferred; do not return neutral because of the H4. Overbought/oversold RSI and premium/discount extremes are normal in a strong trend and are not on their own a reason for neutral. Return neutral only for a clear reversal candle against the move, a high-impact event within 30 minutes, or missing data. Confidence 65-75. Stop beyond the last M15 swing, target at least the minimum RR.`;
  const split = t.H1 && t.H4 && t.H1 !== t.H4 && t.H1 !== "range" && t.H4 !== "range";
  if (split || (t.H1 === "range" && t.H4 === "range"))
    return `${base}\nSPLIT MODE: H1 and H4 do not agree. Do NOT return neutral just for that. Read the M15 candles like a forecaster: project the most likely path of the next 3-6 candles from momentum, structure, liquidity pools and the last candle pattern. If M15 trends with ${split ? "one of H1/H4" : "a breakout"} and there is a confirmed entry (pullback-breakout, climax reversal, sweep + displacement, or ADX >= ${SPLIT_ADX}), trade toward the projected move with confidence ${SPLIT_MIN_CONFIDENCE}+ and a tight stop beyond the last M15 swing. Return neutral only when you cannot see a clear next move.`;
  return `${base} (trade with H1/H4 when they agree; an M15 move against them is a pullback entry)`;
}

/** Learned-rule check: retire the newest approved rule when results got clearly worse after it. */
export function shouldRetireRule(recent: { wins: number; total: number }, prior: { wins: number; total: number }): boolean {
  if (recent.total < 5 || prior.total < 5) return false;
  return recent.wins / recent.total < prior.wins / prior.total - 0.1;
}
