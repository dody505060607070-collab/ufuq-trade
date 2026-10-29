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

/** Topic of a rule. The AI words the same lesson differently every time, so rules merge by topic, not exact text. Order matters. */
const THEMES: [string, RegExp][] = [
  ["session", /asian|session|low[- ]liquidity|quiet hours|rollover|overnight/],
  ["news", /\bnews\b|cpi|nfp|fomc|\bfed\b|calendar|event/],
  ["protect-profit", /breakeven|break-even|trail/],
  ["stop-buffer", /buffer|beyond (the )?(structural|swing)|stop.{0,30}(sweep|liquidity)/],
  ["take-profit", /take profits?|secure (the )?profits?|bank (the )?profits?|into (key )?liquidity/],
  ["cut-fast", /\bcut\b|exit immediately|close immediately|fails? to (generate|move|show)/],
  ["hold-target", /\bhold\b|premature|early exit|manual(ly)? exit|planned target|predetermined/],
  ["trend-align", /higher[- ]timeframe|\bh1\b|\bh4\b|with the trend|trend (momentum|direction|structure)|aligned|continuation|adx/],
];
export function ruleTheme(rule: string): string | null {
  const s = rule.toLowerCase();
  return THEMES.find(([, re]) => re.test(s))?.[0] ?? null;
}
/** Same lesson: identical text or the same topic. */
export function similarRule(a: string, b: string): boolean {
  if (ruleKey(a) === ruleKey(b)) return true;
  const ta = ruleTheme(a);
  return ta != null && ta === ruleTheme(b);
}

export type BankRule = { id: string; rule: string; hits: number; status: string; created_at?: string };
/** Groups duplicate rules: the oldest rule of each topic keeps the summed hits; the others are deactivated. */
export function consolidate(rules: BankRule[]): { keep: { id: string; hits: number }[]; drop: string[] } {
  const sorted = [...rules].sort((x, y) => (x.created_at ?? "").localeCompare(y.created_at ?? ""));
  const groups: BankRule[][] = [];
  for (const r of sorted) {
    const g = groups.find((gr) => similarRule(gr[0]!.rule, r.rule));
    if (g) g.push(r); else groups.push([r]);
  }
  const keep: { id: string; hits: number }[] = [], drop: string[] = [];
  for (const g of groups) {
    if (g.length < 2) continue;
    keep.push({ id: g[0]!.id, hits: g.reduce((s, r) => s + r.hits, 0) });
    drop.push(...g.slice(1).map((r) => r.id));
  }
  return { keep, drop };
}

/** Prompt text for the last real trade lessons (shown whatever the rule status, so the AI sees fresh mistakes immediately). */
export function lessonsText(rows: { side: string; profit: number; lesson: string | null; created_at: string }[]): string {
  if (!rows.length) return "none yet";
  return rows.map((r) => `- ${r.created_at.slice(0, 16)}Z ${r.side.toUpperCase()} ${r.profit >= 0 ? "WIN" : "LOSS"} ${r.profit.toFixed(2)} USD: ${r.lesson ?? "-"}`).join("\n");
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
