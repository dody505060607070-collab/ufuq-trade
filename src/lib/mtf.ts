/** Multi-timeframe confluence (pure). A trade must not fight the H1 or H4 trend. */
export type Trend = "up" | "down" | "range" | null;
export type MtfTrends = { M15: Trend; H1: Trend; H4: Trend };

/** Reason a direction conflicts with the higher timeframes, or null when allowed. */
export function mtfConflict(direction: "buy" | "sell" | "neutral", t: MtfTrends, reversal: "buy" | "sell" | null = null, adx: number | null = null): string | null {
  if (direction === "neutral") return null;
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
  return `${base} (trade with H1/H4 when they agree; an M15 move against them is a pullback entry)`;
}

/** Learned-rule check: retire the newest approved rule when results got clearly worse after it. */
export function shouldRetireRule(recent: { wins: number; total: number }, prior: { wins: number; total: number }): boolean {
  if (recent.total < 5 || prior.total < 5) return false;
  return recent.wins / recent.total < prior.wins / prior.total - 0.1;
}
