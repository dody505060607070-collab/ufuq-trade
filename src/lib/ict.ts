// Smart Money / ICT concepts computed locally (no AI cost). Ideas adapted from xxvw/ICT_Library_MQ5.
import type { Bar } from "./indicators";

export type FVG = { type: "bull" | "bear"; top: number; bottom: number; index: number };
export type OB = { type: "bull" | "bear"; high: number; low: number; index: number };
export type Structure = { bias: "bullish" | "bearish" | "neutral"; event: "BOS" | "CHoCH" | null; level: number | null };

/** Swing points: bar i is a swing high if its high is greater than `k` bars on both sides. */
export function swings(bars: Bar[], k = 2) {
  const highs: { i: number; p: number }[] = [], lows: { i: number; p: number }[] = [];
  for (let i = k; i < bars.length - k; i++) {
    const win = bars.slice(i - k, i + k + 1);
    if (win.every((b, j) => j === k || b.h < bars[i]!.h)) highs.push({ i, p: bars[i]!.h });
    if (win.every((b, j) => j === k || b.l > bars[i]!.l)) lows.push({ i, p: bars[i]!.l });
  }
  return { highs, lows };
}

/** Unfilled fair value gaps: 3-candle imbalance not yet traded back through. */
export function fairValueGaps(bars: Bar[]): FVG[] {
  const out: FVG[] = [];
  for (let i = 2; i < bars.length; i++) {
    const a = bars[i - 2]!, c = bars[i]!;
    let g: FVG | null = null;
    if (c.l > a.h) g = { type: "bull", top: c.l, bottom: a.h, index: i - 1 };
    else if (c.h < a.l) g = { type: "bear", top: a.l, bottom: c.h, index: i - 1 };
    if (!g) continue;
    const later = bars.slice(i + 1);
    const filled = g.type === "bull" ? later.some((b) => b.l <= g!.bottom) : later.some((b) => b.h >= g!.top);
    if (!filled) out.push(g);
  }
  return out;
}

/** Market structure: break of the last swing in trend direction = BOS, against it = CHoCH. */
export function marketStructure(bars: Bar[]): Structure {
  const { highs, lows } = swings(bars);
  const sh = highs[highs.length - 1], sl = lows[lows.length - 1];
  if (!sh || !sl) return { bias: "neutral", event: null, level: null };
  const ph = highs[highs.length - 2], pl = lows[lows.length - 2];
  const prior: Structure["bias"] = ph && pl ? (sh.p > ph.p && sl.p > pl.p ? "bullish" : sh.p < ph.p && sl.p < pl.p ? "bearish" : "neutral") : "neutral";
  const close = bars[bars.length - 1]!.c;
  if (close > sh.p) return { bias: "bullish", event: prior === "bearish" ? "CHoCH" : "BOS", level: sh.p };
  if (close < sl.p) return { bias: "bearish", event: prior === "bullish" ? "CHoCH" : "BOS", level: sl.p };
  return { bias: prior, event: null, level: null };
}

/** Last opposite candle before a displacement move that broke its extreme. */
export function orderBlocks(bars: Bar[], lookahead = 3): OB[] {
  const out: OB[] = [];
  for (let i = 0; i < bars.length - lookahead; i++) {
    const b = bars[i]!, next = bars.slice(i + 1, i + 1 + lookahead);
    const range = b.h - b.l || 1e-9;
    if (b.c < b.o && next.some((n) => n.c > b.h && n.c - n.o > range)) out.push({ type: "bull", high: b.h, low: b.l, index: i });
    if (b.c > b.o && next.some((n) => n.c < b.l && n.o - n.c > range)) out.push({ type: "bear", high: b.h, low: b.l, index: i });
  }
  return out;
}

/** 0 = at range low (deep discount), 100 = range high (premium). */
export function premiumDiscount(bars: Bar[], lookback = 40) {
  const r = bars.slice(-lookback);
  const hi = Math.max(...r.map((b) => b.h)), lo = Math.min(...r.map((b) => b.l));
  const pct = hi === lo ? 50 : ((r[r.length - 1]!.c - lo) / (hi - lo)) * 100;
  return { pct, zone: pct > 55 ? "premium" : pct < 45 ? "discount" : "equilibrium", hi, lo } as const;
}

/** Liquidity sweep on the last bar: wick beyond a prior swing then close back inside. */
export function liquiditySweep(bars: Bar[]): "buy-side" | "sell-side" | null {
  if (bars.length < 6) return null;
  const { highs, lows } = swings(bars.slice(0, -1));
  const last = bars[bars.length - 1]!;
  const sh = highs[highs.length - 1], sl = lows[lows.length - 1];
  if (sh && last.h > sh.p && last.c < sh.p) return "buy-side";
  if (sl && last.l < sl.p && last.c > sl.p) return "sell-side";
  return null;
}

/** ICT kill zones in UTC (London 07-10, New York 12-15). */
export function killZone(d = new Date()): "London" | "New York" | null {
  const h = d.getUTCHours();
  if (h >= 7 && h < 10) return "London";
  if (h >= 12 && h < 15) return "New York";
  return null;
}

export function ictText(bars: Bar[], dec: number, now = new Date()): string {
  if (bars.length < 10) return "unavailable";
  const f = (v: number) => v.toFixed(dec);
  const ms = marketStructure(bars), pd = premiumDiscount(bars), sweep = liquiditySweep(bars), kz = killZone(now);
  const fvg = fairValueGaps(bars).slice(-3), ob = orderBlocks(bars).slice(-2);
  return [
    `Structure: ${ms.bias}${ms.event ? ` (${ms.event} at ${f(ms.level!)})` : ""}`,
    `Premium/Discount: ${pd.zone} (${pd.pct.toFixed(0)}% of range ${f(pd.lo)}–${f(pd.hi)}) — prefer buys in discount, sells in premium`,
    `Unfilled FVGs: ${fvg.map((g) => `${g.type} ${f(g.bottom)}–${f(g.top)}`).join("; ") || "none"}`,
    `Order blocks: ${ob.map((o) => `${o.type} ${f(o.low)}–${f(o.high)}`).join("; ") || "none"}`,
    `Liquidity sweep on last bar: ${sweep ?? "none"}`,
    `Kill zone now: ${kz ?? "outside (lower conviction)"}`,
  ].join("\n");
}
