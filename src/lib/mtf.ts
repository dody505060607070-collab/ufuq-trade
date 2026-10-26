/** Multi-timeframe confluence (pure). A trade must not fight the H1 or H4 trend. */
export type Trend = "up" | "down" | "range" | null;
export type MtfTrends = { M15: Trend; H1: Trend; H4: Trend };

/** Reason a direction conflicts with the higher timeframes, or null when allowed. */
export function mtfConflict(direction: "buy" | "sell" | "neutral", t: MtfTrends, reversal: "buy" | "sell" | null = null): string | null {
  if (direction === "neutral") return null;
  const against = direction === "buy" ? "down" : "up";
  const bad = (["H1", "H4"] as const).filter((k) => t[k] === against);
  // A confirmed M15 climax reversal may trade against one higher timeframe, never both.
  if (reversal === direction && bad.length < 2) return null;
  if (bad.length) return `${direction} against ${bad.join("+")} trend`;
  if (t.H1 === "range" && t.H4 === "range") return "H1 and H4 both ranging";
  return null;
}

export function mtfText(t: MtfTrends): string {
  return `M15 ${t.M15 ?? "n/a"} | H1 ${t.H1 ?? "n/a"} | H4 ${t.H4 ?? "n/a"} (trade only with H1/H4; never against them)`;
}

/** Learned-rule check: retire the newest approved rule when results got clearly worse after it. */
export function shouldRetireRule(recent: { wins: number; total: number }, prior: { wins: number; total: number }): boolean {
  if (recent.total < 5 || prior.total < 5) return false;
  return recent.wins / recent.total < prior.wins / prior.total - 0.1;
}
