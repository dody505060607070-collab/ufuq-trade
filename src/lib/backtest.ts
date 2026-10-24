// Simple event-driven backtester for rule-based strategies on OHLC candles.
import type { Candle } from "./market.server";

export type Signal = { side: "buy" | "sell"; sl: number; tp: number } | null;
export type Strategy = (history: Candle[]) => Signal;
export type BtTrade = { side: "buy" | "sell"; entry: number; exit: number; pnl: number; openT: number; closeT: number };
export type BtResult = { trades: BtTrade[]; net: number; maxDrawdown: number; avg: number; winRate: number };

/** Runs one position at a time; entry at next bar open; spread (price units) is paid on each trade. */
export function backtest(candles: Candle[], strat: Strategy, opts: { spread: number; warmup?: number; units?: number }): BtResult {
  const units = opts.units ?? 1;
  const trades: BtTrade[] = [];
  let pos: { side: "buy" | "sell"; entry: number; sl: number; tp: number; t: number } | null = null;
  for (let i = opts.warmup ?? 50; i < candles.length; i++) {
    const bar = candles[i]!;
    if (pos) {
      const buy = pos.side === "buy";
      const hitSl = buy ? bar.l <= pos.sl : bar.h >= pos.sl;
      const hitTp = buy ? bar.h >= pos.tp : bar.l <= pos.tp;
      if (hitSl || hitTp) {
        const exit = hitSl ? pos.sl : pos.tp; // conservative: stop wins when both hit
        const pnl = ((buy ? exit - pos.entry : pos.entry - exit) - opts.spread) * units;
        trades.push({ side: pos.side, entry: pos.entry, exit, pnl, openT: pos.t, closeT: bar.t });
        pos = null;
      }
      continue;
    }
    const sig = strat(candles.slice(0, i));
    if (sig) pos = { side: sig.side, entry: bar.o, sl: sig.sl, tp: sig.tp, t: bar.t };
  }
  let eq = 0, peak = 0, dd = 0;
  for (const t of trades) { eq += t.pnl; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  const wins = trades.filter((t) => t.pnl > 0).length;
  return { trades, net: eq, maxDrawdown: dd, avg: trades.length ? eq / trades.length : 0, winRate: trades.length ? wins / trades.length : 0 };
}

const ema = (xs: number[], n: number) => { const k = 2 / (n + 1); let e = xs[0] ?? 0; for (const x of xs) e = x * k + e * (1 - k); return e; };
const atr = (cs: Candle[], n = 14) => { const s = cs.slice(-n - 1); let t = 0; for (let i = 1; i < s.length; i++) t += Math.max(s[i]!.h - s[i]!.l, Math.abs(s[i]!.h - s[i - 1]!.c), Math.abs(s[i]!.l - s[i - 1]!.c)); return t / Math.max(1, s.length - 1); };

/** Baseline rules without AI: EMA20/50 trend + pullback to EMA20, 1.5 ATR stop, 1.5R target. */
export const trendPullback: Strategy = (h) => {
  if (h.length < 60) return null;
  const closes = h.map((c) => c.c);
  const f = ema(closes.slice(-120), 20), s = ema(closes.slice(-120), 50), a = atr(h);
  const last = h[h.length - 1]!;
  if (a <= 0) return null;
  if (f > s && last.l <= f && last.c > f) return { side: "buy", sl: last.c - 1.5 * a, tp: last.c + 2.25 * a };
  if (f < s && last.h >= f && last.c < f) return { side: "sell", sl: last.c + 1.5 * a, tp: last.c - 2.25 * a };
  return null;
};

/** Learned-rule lifecycle: a rule must repeat before it is trusted, and is retired when later evidence goes against it. */
export function ruleStatus(hits: number, current: string): "hypothesis" | "trial" | "approved" | "retired" {
  if (current === "retired") return "retired";
  if (hits >= 3) return "approved";
  if (hits >= 2) return "trial";
  return "hypothesis";
}
