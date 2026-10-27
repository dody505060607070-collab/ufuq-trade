// Price-action context computed locally (no AI cost). Ideas from kain26/price-action-skill,
// joshyattridge/smart-money-concepts (previous high/low, liquidity pools) and profittown-sniper-smc (HTF bias).
import type { Bar } from "./indicators";
import { ema, atr } from "./indicators";
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
  return { bias: marketStructure(daily).bias, pdh: prev.h, pdl: prev.l, prevDay: prev.c > prev.o ? "bullish" : "bearish" } as const;
}

/** PDH/PDL sweep (ikeawesom/xauusd-backtest): price wicked beyond yesterday's high/low and closed back inside. */
export function pdSweep(bars: Bar[], pdh: number, pdl: number): "PDH swept (sell setup)" | "PDL swept (buy setup)" | null {
  for (const b of bars.slice(-3).reverse()) {
    if (b.h > pdh && b.c < pdh) return "PDH swept (sell setup)";
    if (b.l < pdl && b.c > pdl) return "PDL swept (buy setup)";
  }
  return null;
}

export function priceActionText(bars: Bar[], daily: Bar[], dec: number): string {
  if (bars.length < 10) return "unavailable";
  const f = (v: number) => v.toFixed(dec);
  const pools = liquidityPools(bars), d = dailyContext(daily), disp = displacement(bars);
  return [
    `Last candle pattern: ${candlePattern(bars) ?? "none"}`,
    `Displacement (last 3 bars): ${disp ?? "none"}`,
    `Climax reversal (sharp run then rejection candle): ${climaxReversal(bars) ?? "none"} — when present this is a high-value counter-move entry (buy after a capitulation drop, sell after an exhausted spike); stop beyond the climax extreme, target the run's midpoint or start`,
    `Liquidity pools: BSL (equal highs) ${pools.bsl != null ? f(pools.bsl) : "none"}; SSL (equal lows) ${pools.ssl != null ? f(pools.ssl) : "none"} — price often sweeps these before reversing`,
    d ? `Daily (higher timeframe) bias: ${d.bias}; previous day was ${d.prevDay}; previous day high ${f(d.pdh)}, low ${f(d.pdl)} — trade WITH the daily bias unless a sweep + CHoCH confirms reversal` : "Daily context: unavailable",
    `Pullback-window breakout (EMA9/21 trend, 1-3 bar pullback, then break of the pullback extreme): ${pullbackBreakout(bars) ?? "none"} — a confirmed with-trend entry; prefer it over entering mid-move, stop beyond the pullback extreme`,
    `Volatility regime (ATR vs its recent range): ${volRegime(bars)} — in "low" expect chop (demand stronger confirmation); in "high" widen stops within limits and reduce size`,
    d ? `Previous-day sweep: ${pdSweep(bars, d.pdh, d.pdl) ?? "none"} — high-probability when it agrees with the previous day's direction (bullish day + PDL sweep = buy, bearish day + PDH sweep = sell)` : "Previous-day sweep: unavailable",
  ].join("\n");
}

/**
 * M15 climax reversal: a strong one-way run (>= `mult` x ATR over the last `look` bars)
 * that ends with a rejection candle in the opposite direction. Catches "sharp drop then
 * snap back up" (buy) and "sharp spike then rejection" (sell) that trend filters miss.
 */
export function climaxReversal(bars: Bar[], look = 8, mult = 3): "buy" | "sell" | null {
  if (bars.length < look + 15) return null;
  const tr = bars.slice(-look - 15, -look).map((b) => b.h - b.l);
  const avgRange = tr.reduce((s, v) => s + v, 0) / tr.length;
  if (avgRange <= 0) return null;
  const run = bars.slice(-look - 1, -1);
  const c = bars[bars.length - 1]!;
  const runHigh = Math.max(...run.map((b) => b.h)), runLow = Math.min(...run.map((b) => b.l));
  const startC = run[0]!.o, endC = run[run.length - 1]!.c;
  const body = Math.abs(c.c - c.o), range = c.h - c.l || 1e-9;
  const upper = c.h - Math.max(c.o, c.c), lower = Math.min(c.o, c.c) - c.l;
  // sell climax -> bullish rejection
  if (startC - endC >= mult * avgRange && c.l <= runLow + 0.25 * avgRange && c.c > c.o &&
      (lower >= 1.5 * body || c.c >= run[run.length - 1]!.o) && c.c - c.l >= 0.5 * range) return "buy";
  // buy climax -> bearish rejection
  if (endC - startC >= mult * avgRange && c.h >= runHigh - 0.25 * avgRange && c.c < c.o &&
      (upper >= 1.5 * body || c.c <= run[run.length - 1]!.o) && c.h - c.c >= 0.5 * range) return "sell";
  return null;
}

/** Pullback-window entry (idea from backtrader-pullback-window-xauusd). */
export function pullbackBreakout(bars: Bar[]): "buy" | "sell" | null {
  if (bars.length < 30) return null;
  const closes = bars.map((b) => b.c);
  const ef = ema(closes, 9), es = ema(closes, 21);
  const n = bars.length - 1, c = bars[n]!;
  for (const dir of ["buy", "sell"] as const) {
    const up = dir === "buy";
    const trend = (i: number) => (up ? ef[i]! > es[i]! : ef[i]! < es[i]!);
    if (!trend(n) || !trend(n - 4)) continue;
    let k = 0;
    while (k < 3 && n - 1 - k >= 1) {
      const b = bars[n - 1 - k]!;
      if (up ? b.c < b.o : b.c > b.o) k++; else break;
    }
    if (k < 1) continue;
    const pb = bars.slice(n - k, n);
    if (up && c.c > Math.max(...pb.map((b) => b.h)) && c.c > c.o) return "buy";
    if (!up && c.c < Math.min(...pb.map((b) => b.l)) && c.c < c.o) return "sell";
  }
  return null;
}

/** Volatility regime: current ATR(14) position within the last 100 ATR readings. */
export function volRegime(bars: Bar[]): "low" | "normal" | "high" | "unknown" {
  if (bars.length < 60) return "unknown";
  const vals: number[] = [];
  for (let i = Math.max(20, bars.length - 100); i <= bars.length; i++) {
    const v = atr(bars.slice(0, i)); if (v != null) vals.push(v);
  }
  const cur = vals[vals.length - 1]; if (cur == null || vals.length < 10) return "unknown";
  const rank = vals.filter((v) => v <= cur).length / vals.length;
  return rank < 0.25 ? "low" : rank > 0.8 ? "high" : "normal";
}
