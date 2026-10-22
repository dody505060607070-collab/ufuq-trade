// Price-action context computed locally (no AI cost). Ideas from kain26/price-action-skill,
// joshyattridge/smart-money-concepts (previous high/low, liquidity pools) and profittown-sniper-smc (HTF bias).
import type { Bar } from "./indicators";
import { marketStructure } from "./ict";

/** Classic reversal/continuation pattern on the last closed candle(s). */
export function candlePattern(bars: Bar[]): string | null {
  if (bars.length < 2) return null;
  const p = bars[bars.length - 2]!, c = bars[bars.length - 1]!;
  const body = Math.abs(c.c - c.o), range = c.h - c.l || 1e-9;
  const upper = c.h - Math.max(c.o, c.c), lower = Math.min(c.o, c.c) - c.l;
  if (c.c > c.o && p.c < p.o && c.c >= p.o && c.o <= p.c) return "bullish engulfing";
  if (c.c < c.o && p.c > p.o && c.c <= p.o && c.o >= p.c) return "bearish engulfing";
  if (lower >= 2 * body && lower >= 0.6 * range) return "bullish pin bar (rejection of lows)";
  if (upper >= 2 * body && upper >= 0.6 * range) return "bearish pin bar (rejection of highs)";
  if (c.h < p.h && c.l > p.l) return "inside bar (compression, wait for breakout)";
  if (body <= 0.1 * range) return "doji (indecision)";
  return null;
}

/** Equal highs/lows within `tol` of each other = resting liquidity pools (BSL above, SSL below). */
export function liquidityPools(bars: Bar[], tolPct = 0.0008) {
  const r = bars.slice(-40);
  const near = (a: number, b: number) => Math.abs(a - b) <= a * tolPct;
  let bsl: number | null = null, ssl: number | null = null;
  for (let i = 0; i < r.length; i++) for (let j = i + 3; j < r.length; j++) {
    if (near(r[i]!.h, r[j]!.h)) bsl = Math.max(bsl ?? -Infinity, r[i]!.h, r[j]!.h);
    if (near(r[i]!.l, r[j]!.l)) ssl = Math.min(ssl ?? Infinity, r[i]!.l, r[j]!.l);
  }
  return { bsl, ssl };
}

/** Displacement: last 3 candles contain a body > 2x the average body of the prior 20. */
export function displacement(bars: Bar[]): "bullish" | "bearish" | null {
  if (bars.length < 24) return null;
  const prior = bars.slice(-23, -3), avg = prior.reduce((s, b) => s + Math.abs(b.c - b.o), 0) / prior.length;
  for (const b of bars.slice(-3).reverse()) if (Math.abs(b.c - b.o) > 2 * avg) return b.c > b.o ? "bullish" : "bearish";
  return null;
}

/** Higher-timeframe context from daily bars: trend bias + previous day high/low. */
export function dailyContext(daily: Bar[]) {
  if (daily.length < 3) return null;
  const prev = daily[daily.length - 2]!;
  return { bias: marketStructure(daily).bias, pdh: prev.h, pdl: prev.l };
}

export function priceActionText(bars: Bar[], daily: Bar[], dec: number): string {
  if (bars.length < 10) return "unavailable";
  const f = (v: number) => v.toFixed(dec);
  const pools = liquidityPools(bars), d = dailyContext(daily), disp = displacement(bars);
  return [
    `Last candle pattern: ${candlePattern(bars) ?? "none"}`,
    `Displacement (last 3 bars): ${disp ?? "none"}`,
    `Liquidity pools: BSL (equal highs) ${pools.bsl != null ? f(pools.bsl) : "none"}; SSL (equal lows) ${pools.ssl != null ? f(pools.ssl) : "none"} — price often sweeps these before reversing`,
    d ? `Daily (higher timeframe) bias: ${d.bias}; previous day high ${f(d.pdh)}, low ${f(d.pdl)} — trade WITH the daily bias unless a sweep + CHoCH confirms reversal` : "Daily context: unavailable",
  ].join("\n");
}
