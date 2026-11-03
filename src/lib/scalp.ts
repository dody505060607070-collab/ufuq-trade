// Fast scalping research engine (pure). The SAME breakout rule runs in the EA on M1 bars (public/ea/ArrissaEA.mq5,
// ScalpSignal) and here for the Evolution Lab, so lab results describe what the EA actually does.
// Rule on a CLOSED bar i: close breaks the highest high (lowest low) of the previous `lookback` bars and is on the
// right side of EMA(emaLen) -> buy (sell) at the next bar's open. Stop = slAtr x ATR(atrLen), target = rr x stop,
// time exit after holdBars bars. Costs: the spread is paid once (buy at mid+spread/2, exit at mid-spread/2).

export type Bar = { t: number; o: number; h: number; l: number; c: number };
export type ScalpParams = { lookback: number; atrLen: number; slAtr: number; rr: number; holdBars: number; emaLen: number; spreadFrac: number };
export type Exit = "tp" | "sl" | "time";
export type SimTrade = { i: number; side: "buy" | "sell"; r: number; bars: number; exit: Exit };
export type SimStats = { trades: number; wins: number; net_r: number; max_dd_r: number; avg_bars: number; exits: Record<Exit, number>; win_rate: number };

/** Current EA defaults (M1 bars). rr never below 1.5 — same as the risk engine's minimum R/R. */
export const SCALP_DEFAULTS: ScalpParams = { lookback: 20, atrLen: 14, slAtr: 1.5, rr: 1.5, holdBars: 5, emaLen: 50, spreadFrac: 0.25 };
export const SCALP_BOUNDS: Record<keyof ScalpParams, [number, number, boolean]> = {
  lookback: [5, 60, true], atrLen: [5, 30, true], slAtr: [0.8, 3, false], rr: [1.5, 3, false], holdBars: [1, 15, true], emaLen: [10, 200, true], spreadFrac: [0.1, 0.4, false],
};
export const SCALP_MIN_RR = 1.5;
/** Markets fast scalping may trade (the user's main markets; indices were removed after losses). */
export const SCALP_SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD"];
export const SCALP_MAX_POSITIONS = 2;      // scalps open at the same time, all symbols
export const SCALP_LOSS_COOLDOWN_MIN = 10; // per symbol after a losing scalp
export const SCALP_SIGNAL_TTL_SEC = 120;   // EA opens no new scalp when the website's settings are older than this
export const SCALP_MAX_RISK_PCT = 2;       // a scalp at the account lot may risk at most this % of the balance

/** Keep every parameter inside its bounds (integers rounded). */
export function clampParams(p: ScalpParams): ScalpParams {
  const out = { ...p };
  for (const k of Object.keys(SCALP_BOUNDS) as (keyof ScalpParams)[]) {
    const [lo, hi, int] = SCALP_BOUNDS[k];
    let v = Math.min(hi, Math.max(lo, Number(p[k])));
    if (!Number.isFinite(v)) v = SCALP_DEFAULTS[k];
    out[k] = int ? Math.round(v) : Math.round(v * 100) / 100;
  }
  return out;
}

export function emaSeries(c: number[], len: number): number[] {
  const k = 2 / (len + 1), out = new Array<number>(c.length);
  let e = c[0] ?? 0;
  for (let i = 0; i < c.length; i++) { e = i === 0 ? c[0]! : c[i]! * k + e * (1 - k); out[i] = e; }
  return out;
}

export function atrSeries(b: Bar[], len: number): number[] {
  const out = new Array<number>(b.length).fill(NaN);
  let sum = 0;
  const tr = b.map((x, i) => (i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - b[i - 1]!.c), Math.abs(x.l - b[i - 1]!.c))));
  for (let i = 0; i < b.length; i++) {
    sum += tr[i]!;
    if (i >= len) sum -= tr[i - len]!;
    if (i >= len) out[i] = sum / len;
  }
  return out;
}

/** Signal on closed bar i, or null. Same logic as the EA. */
export function scalpSignal(b: Bar[], i: number, p: ScalpParams, ema: number[], atr: number[], spread: number): { side: "buy" | "sell"; slDist: number } | null {
  if (i < Math.max(p.lookback, p.atrLen, p.emaLen) + 1) return null;
  const a = atr[i]!;
  if (!(a > 0)) return null;
  const slDist = p.slAtr * a;
  if (spread > p.spreadFrac * slDist) return null; // cost too big for this stop
  let hi = -Infinity, lo = Infinity;
  for (let j = i - p.lookback; j < i; j++) { if (b[j]!.h > hi) hi = b[j]!.h; if (b[j]!.l < lo) lo = b[j]!.l; }
  const c = b[i]!.c;
  if (c > hi && c > ema[i]!) return { side: "buy", slDist };
  if (c < lo && c < ema[i]!) return { side: "sell", slDist };
  return null;
}

/** Walk one trade from the open of bar i+1. Stop is checked before target on the same bar (conservative). */
export function walkTrade(b: Bar[], i: number, side: "buy" | "sell", slDist: number, rr: number, holdBars: number, spread: number, end = b.length, gapSec = 180): SimTrade | null {
  const e = b[i + 1];
  if (!e || i + 1 >= end) return null;
  const buy = side === "buy", entry = e.o;
  const sl = buy ? entry - slDist : entry + slDist, tp = buy ? entry + rr * slDist : entry - rr * slDist;
  for (let k = 0; k < holdBars; k++) {
    const j = i + 1 + k, x = b[j];
    if (!x || j >= end) return null;
    if (k > 0 && x.t - b[j - 1]!.t > gapSec) return null; // market gap: skip, can't be simulated honestly
    // Bid/ask: a buy closes at bid (mid - spread/2), so the stop is touched spread/2 earlier.
    const adverse = buy ? x.l - spread / 2 <= sl : x.h + spread / 2 >= sl;
    const favour = buy ? x.h - spread / 2 >= tp : x.l + spread / 2 <= tp;
    if (adverse) return { i, side, r: -1 - spread / 2 / slDist, bars: k + 1, exit: "sl" };
    if (favour) return { i, side, r: rr - spread / 2 / slDist, bars: k + 1, exit: "tp" };
  }
  const last = b[i + holdBars]!;
  const move = buy ? last.c - entry : entry - last.c;
  return { i, side, r: (move - spread) / slDist, bars: holdBars, exit: "time" };
}

export function stats(t: SimTrade[]): SimStats {
  let eq = 0, peak = 0, dd = 0, wins = 0, bars = 0;
  const exits: Record<Exit, number> = { tp: 0, sl: 0, time: 0 };
  for (const x of t) { eq += x.r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); if (x.r > 0) wins++; bars += x.bars; exits[x.exit]++; }
  return { trades: t.length, wins, net_r: round(eq), max_dd_r: round(dd), avg_bars: t.length ? round(bars / t.length) : 0, exits, win_rate: t.length ? round(wins / t.length) : 0 };
}

const round = (x: number) => Math.round(x * 100) / 100;

/** Backtest the rule on bars[from, to): one position at a time, entries and exits inside the segment. */
export function simulate(b: Bar[], p: ScalpParams, spread: number, from = 0, to = b.length): SimTrade[] {
  const ema = emaSeries(b.map((x) => x.c), p.emaLen), atr = atrSeries(b, p.atrLen);
  const out: SimTrade[] = [];
  for (let i = Math.max(from, 1); i < to - 1; i++) {
    const s = scalpSignal(b, i, p, ema, atr, spread);
    if (!s) continue;
    const tr = walkTrade(b, i, s.side, s.slDist, p.rr, p.holdBars, spread, to);
    if (!tr) continue;
    out.push(tr);
    i += tr.bars; // flat again after the exit bar
  }
  return out;
}

/** Fitness: net R minus half the drawdown, minus a small complexity cost. More trades are NOT rewarded. */
export function fitness(s: SimStats, minTrades = 8): number {
  if (s.trades < minTrades) return -1e9 + s.trades;
  return s.net_r - 0.5 * s.max_dd_r;
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomParams(r: () => number): ScalpParams {
  const p = { ...SCALP_DEFAULTS };
  for (const k of Object.keys(SCALP_BOUNDS) as (keyof ScalpParams)[]) { const [lo, hi] = SCALP_BOUNDS[k]; p[k] = lo + r() * (hi - lo); }
  return clampParams(p);
}

function mutate(p: ScalpParams, r: () => number, rate = 0.35): ScalpParams {
  const q = { ...p };
  for (const k of Object.keys(SCALP_BOUNDS) as (keyof ScalpParams)[]) {
    if (r() > rate) continue;
    const [lo, hi] = SCALP_BOUNDS[k];
    q[k] = p[k] + (r() * 2 - 1) * 0.15 * (hi - lo);
  }
  return clampParams(q);
}

function cross(a: ScalpParams, b: ScalpParams, r: () => number): ScalpParams {
  const q = { ...a };
  for (const k of Object.keys(SCALP_BOUNDS) as (keyof ScalpParams)[]) q[k] = r() < 0.5 ? a[k] : b[k];
  return q;
}

export type Split = { train: [number, number]; val: [number, number]; test: [number, number] };
/** Chronological 60/20/20 split with an embargo of `gap` bars between segments (no shuffling). */
export function splitBars(n: number, gap: number): Split {
  const a = Math.floor(n * 0.6), b = Math.floor(n * 0.8);
  return { train: [0, a], val: [a + gap, b], test: [b + gap, n] };
}

export type GenLog = { gen: number; best_train: number; best_val: number; median_train: number };
export type LabResult = {
  bars: number; first_t: number; last_t: number; spread: number; seed: number; population: number; generations: number; evaluations: number;
  split: Split; gens: GenLog[];
  chosen: ScalpParams; chosen_train: SimStats; chosen_val: SimStats; chosen_test: SimStats;
  current: ScalpParams; current_test: SimStats;
  random: { policies: number; trades_each: number; p50: number; p95: number; beaten_pct: number };
  verdict: "passed" | "not_proven";
  verdict_reasons: string[];
};

/** Evolve rule parameters on train, choose on validation, test once, compare with random-entry policies. */
export function evolve(b: Bar[], spread: number, opt: { seed?: number; population?: number; generations?: number; randomPolicies?: number; current?: ScalpParams } = {}): LabResult {
  const seed = opt.seed ?? 7, P = opt.population ?? 40, G = opt.generations ?? 15, R = opt.randomPolicies ?? 1000;
  const current = clampParams(opt.current ?? SCALP_DEFAULTS);
  const r = rng(seed);
  const split = splitBars(b.length, SCALP_BOUNDS.holdBars[1] + 1);
  const evalOn = (p: ScalpParams, seg: [number, number]) => stats(simulate(b, p, spread, seg[0], seg[1]));
  let pop: ScalpParams[] = [current, ...Array.from({ length: P - 1 }, () => randomParams(r))];
  const gens: GenLog[] = [];
  const hall: { p: ScalpParams; train: number }[] = [];
  let evaluations = 0;
  for (let g = 0; g < G; g++) {
    const scored = pop.map((p) => { evaluations++; return { p, f: fitness(evalOn(p, split.train)) }; }).sort((x, y) => y.f - x.f);
    const top = scored.slice(0, Math.max(2, Math.floor(P / 4)));
    hall.push(...top.slice(0, 3).map((x) => ({ p: x.p, train: x.f })));
    const bestVal = fitness(evalOn(top[0]!.p, split.val), 4);
    gens.push({ gen: g + 1, best_train: round(top[0]!.f), best_val: round(bestVal), median_train: round(scored[Math.floor(scored.length / 2)]!.f) });
    pop = [...top.map((x) => x.p)];
    while (pop.length < P) { const a = top[Math.floor(r() * top.length)]!.p, c = top[Math.floor(r() * top.length)]!.p; pop.push(mutate(cross(a, c, r), r)); }
  }
  // Choose on validation among the hall of fame (train winners only); the test segment is touched once below.
  const uniq = new Map<string, ScalpParams>();
  for (const h of hall) uniq.set(JSON.stringify(h.p), h.p);
  let chosen = current, bestV = -Infinity;
  for (const p of uniq.values()) { const v = fitness(evalOn(p, split.val), 4); if (v > bestV) { bestV = v; chosen = p; } }
  const chosen_test_trades = simulate(b, chosen, spread, split.test[0], split.test[1]);
  const chosen_test = stats(chosen_test_trades);
  // Random policies: same number of trades, same stop/target/hold rule, random entry bars and sides, test segment.
  const atrC = atrSeries(b, chosen.atrLen);
  const n = Math.max(5, chosen_test.trades), nets: number[] = [];
  for (let k = 0; k < R; k++) {
    let net = 0;
    for (let m = 0; m < n; m++) {
      let tr: SimTrade | null = null;
      for (let tries = 0; tries < 20 && !tr; tries++) {
        const i = split.test[0] + Math.floor(r() * Math.max(1, split.test[1] - split.test[0] - chosen.holdBars - 2));
        const a = atrC[i];
        if (!(a! > 0)) continue;
        tr = walkTrade(b, i, r() < 0.5 ? "buy" : "sell", chosen.slAtr * a!, chosen.rr, chosen.holdBars, spread, split.test[1]);
      }
      if (tr) net += tr.r;
    }
    nets.push(net);
  }
  nets.sort((x, y) => x - y);
  const beaten = nets.filter((x) => x < chosen_test.net_r).length / R;
  const reasons: string[] = [];
  if (chosen_test.trades < 20) reasons.push(`only ${chosen_test.trades} test trades (need 20+)`);
  if (chosen_test.net_r <= 0) reasons.push("test net result is not positive after costs");
  if (beaten < 0.95) reasons.push(`beats ${(beaten * 100).toFixed(0)}% of random policies (need 95%)`);
  return {
    bars: b.length, first_t: b[0]?.t ?? 0, last_t: b[b.length - 1]?.t ?? 0, spread, seed, population: P, generations: G, evaluations, split, gens,
    chosen, chosen_train: evalOn(chosen, split.train), chosen_val: evalOn(chosen, split.val), chosen_test,
    current, current_test: evalOn(current, split.test),
    random: { policies: R, trades_each: n, p50: round(nets[Math.floor(R * 0.5)] ?? 0), p95: round(nets[Math.floor(R * 0.95)] ?? 0), beaten_pct: round(beaten * 100) },
    verdict: reasons.length ? "not_proven" : "passed", verdict_reasons: reasons,
  };
}

/** Typical spread in price units when no broker quote is available. */
export function fallbackSpread(symbol: string, price: number): number {
  const s = symbol.toUpperCase();
  if (s.startsWith("XAU")) return 0.2;
  if (s.endsWith("JPY")) return 0.015;
  if (/^(EUR|GBP|AUD|NZD|USD)/.test(s)) return 0.00012;
  return price * 0.0001;
}

/** Percentile (0..100) of a sorted-or-not list. */
export function pctl(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((q / 100) * s.length))]!;
}

/** Text line the website sends to the EA: S|on|symbols|lookback|atrLen|slAtr|rr|holdSec|spreadFrac|emaLen|lot|dayLossUsd|reason */
export function scalpLine(on: boolean, symbols: string[], p: ScalpParams, lot: number, dayLossUsd: number, reason: string): string {
  const clean = (x: string) => x.replace(/[|\n\r,]/g, " ");
  return ["S", on ? "1" : "0", symbols.map(clean).join(","), p.lookback, p.atrLen, p.slAtr, p.rr, p.holdBars * 60, p.spreadFrac, p.emaLen, lot, Math.round(dayLossUsd * 100) / 100, clean(reason)].join("|");
}
