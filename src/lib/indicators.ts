// Pure technical indicators computed locally (no AI cost). Ideas adapted from TradingAgents / trading-skills.
export type Bar = { o: number; h: number; l: number; c: number };

export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]!];
  for (let i = 1; i < values.length; i++) out.push(values[i]! * k + out[i - 1]! * (1 - k));
  return out;
}

export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

export function atr(bars: Bar[], period = 14): number | null {
  if (bars.length <= period) return null;
  const tr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i]!, p = bars[i - 1]!.c;
    tr.push(Math.max(b.h - b.l, Math.abs(b.h - p), Math.abs(b.l - p)));
  }
  let a = tr.slice(0, period).reduce((s, x) => s + x, 0) / period;
  for (let i = period; i < tr.length; i++) a = (a * (period - 1) + tr[i]!) / period;
  return a;
}

/** Wilder ADX: trend strength. <20 ranging, >25 trending (filter idea from XAUUSD strategy repos). */
export function adx(bars: Bar[], period = 14): number | null {
  if (bars.length < period * 2 + 1) return null;
  const tr: number[] = [], pdm: number[] = [], ndm: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i]!, p = bars[i - 1]!;
    const up = b.h - p.h, dn = p.l - b.l;
    pdm.push(up > dn && up > 0 ? up : 0); ndm.push(dn > up && dn > 0 ? dn : 0);
    tr.push(Math.max(b.h - b.l, Math.abs(b.h - p.c), Math.abs(b.l - p.c)));
  }
  const sum = (a: number[]) => a.slice(0, period).reduce((s, x) => s + x, 0);
  let t = sum(tr), pp = sum(pdm), nn = sum(ndm);
  const dx: number[] = [];
  for (let i = period; i <= tr.length; i++) {
    if (i > period) { t = t - t / period + tr[i - 1]!; pp = pp - pp / period + pdm[i - 1]!; nn = nn - nn / period + ndm[i - 1]!; }
    const pdi = t ? (100 * pp) / t : 0, ndi = t ? (100 * nn) / t : 0;
    dx.push(pdi + ndi ? (100 * Math.abs(pdi - ndi)) / (pdi + ndi) : 0);
  }
  if (dx.length < period) return null;
  let a = dx.slice(0, period).reduce((s, x) => s + x, 0) / period;
  for (let i = period; i < dx.length; i++) a = (a * (period - 1) + dx[i]!) / period;
  return a;
}

export type Snapshot = {
  price: number; rsi14: number | null; atr14: number | null;
  ema10: number; ema50: number; ema200: number | null;
  macd: number; macdSignal: number; trend: "up" | "down" | "range"; adx14: number | null;
  swingHigh: number; swingLow: number;
};

export function snapshot(bars: Bar[]): Snapshot | null {
  if (bars.length < 30) return null;
  const closes = bars.map((b) => b.c);
  const e10 = ema(closes, 10), e50 = ema(closes, 50), e12 = ema(closes, 12), e26 = ema(closes, 26);
  const macdLine = e12.map((v, i) => v - e26[i]!);
  const sig = ema(macdLine, 9);
  const n = closes.length - 1;
  const price = closes[n]!; const t10 = e10[n]!, t50 = e50[n]!;
  const trend = t10 > t50 && price > t50 ? "up" : t10 < t50 && price < t50 ? "down" : "range";
  const recent = bars.slice(-20);
  return {
    price, rsi14: rsi(closes), atr14: atr(bars),
    ema10: t10, ema50: t50, ema200: closes.length >= 200 ? ema(closes, 200)[n]! : null,
    macd: macdLine[n]!, macdSignal: sig[n]!, trend, adx14: adx(bars),
    swingHigh: Math.max(...recent.map((b) => b.h)), swingLow: Math.min(...recent.map((b) => b.l)),
  };
}

export function snapshotText(s: Snapshot, dec: number): string {
  const f = (v: number | null) => (v == null ? "n/a" : v.toFixed(dec));
  return [
    `Price ${f(s.price)} | Trend (EMA10 vs EMA50): ${s.trend}`,
    `EMA10 ${f(s.ema10)} | EMA50 ${f(s.ema50)} | EMA200 ${f(s.ema200)}`,
    `RSI14 ${s.rsi14?.toFixed(1) ?? "n/a"} | MACD ${s.macd.toFixed(dec)} vs signal ${s.macdSignal.toFixed(dec)} (${s.macd > s.macdSignal ? "bullish" : "bearish"} momentum)`,
    `ADX14 ${s.adx14?.toFixed(1) ?? "n/a"} (${s.adx14 == null ? "n/a" : s.adx14 < 20 ? "ranging — fade extremes, small targets" : s.adx14 > 25 ? "strong trend — trade with it" : "moderate trend"})`,
    `ATR14 ${f(s.atr14)} → suggested stop distance 1.5×ATR = ${f(s.atr14 && s.atr14 * 1.5)}`,
    `20-bar swing high ${f(s.swingHigh)} / swing low ${f(s.swingLow)}`,
  ].join("\n");
}
