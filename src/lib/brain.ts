/** Pure helpers for the AI Brain (trade lessons, learned rules) and the Whale Radar. */

export type Outcome = "win" | "loss" | "breakeven";

export function outcomeOf(profit: number): Outcome {
  if (profit > 0.5) return "win";
  if (profit < -0.5) return "loss";
  return "breakeven";
}

/** Comparable key for a rule so repeated lessons merge into one rule. */
export function ruleKey(rule: string): string {
  return rule.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff ]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Win rate (0-100) per UTC hour, only hours with trades. */
export function hourStats(rows: { profit: number | null; closed_at: string | null }[]) {
  const m = new Map<number, { n: number; w: number; net: number }>();
  for (const r of rows) {
    if (!r.closed_at) continue;
    const h = new Date(r.closed_at).getUTCHours();
    const s = m.get(h) ?? { n: 0, w: 0, net: 0 };
    s.n++; s.net += r.profit ?? 0; if ((r.profit ?? 0) > 0) s.w++;
    m.set(h, s);
  }
  return [...m.entries()].map(([hour, s]) => ({ hour, trades: s.n, winRate: (s.w / s.n) * 100, net: s.net })).sort((a, b) => a.hour - b.hour);
}

export type Bias = "bullish" | "bearish" | "neutral";

/** Big-money mood from speculator (non-commercial) positioning: net share of open interest plus weekly change. */
export function cotBias(long: number, short: number, changeLong: number, changeShort: number): { bias: Bias; netPct: number; weekly: number } {
  const total = long + short;
  const netPct = total > 0 ? ((long - short) / total) * 100 : 0;
  const weekly = changeLong - changeShort;
  let bias: Bias = "neutral";
  if (netPct > 20 && weekly >= 0) bias = "bullish";
  else if (netPct < -20 && weekly <= 0) bias = "bearish";
  else if (netPct > 40) bias = "bullish";
  else if (netPct < -40) bias = "bearish";
  return { bias, netPct, weekly };
}

/** Prompt text for the active learned rules. */
export function rulesText(rules: { rule: string; hits: number; symbol: string | null }[]): string {
  if (!rules.length) return "none yet";
  return rules.slice(0, 12).map((r) => `- ${r.rule}${r.symbol ? ` (${r.symbol})` : ""} [seen ${r.hits}x]`).join("\n");
}
