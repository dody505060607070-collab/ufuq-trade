// "Time Machine" (idea from the MIT day-trader-skill, adapted to 24h gold/forex markets). Pure.
// Before a trade: replay the next HORIZON M5 bars thousands of times, each bar drawn from the symbol's own
// past M5 bars at the same time of day (± WINDOW slots), scaled to the current price. Counts how often the
// stop or the target is hit first. Same seed + same data = same numbers. A simulation, not a prediction.

export type TmBar = { t: number; o: number; h: number; l: number; c: number };
export type TmResult = {
  replays: number; seed: number; horizon: number; days: number;
  tp_first: number; sl_first: number; neither: number; // shares 0..1
  avg_r: number; rr: number; breakeven: number; tp_share: number | null;
  lean: "target" | "stop" | "even"; strength: "strong" | "lean" | "even";
  verdict: string;
};

export const TM_REPLAYS = 10_000;
export const TM_SEED = 19;
export const TM_HORIZON = 48; // 48 × 5 min = 4 hours
export const TM_WINDOW = 2; // ± 2 five-minute slots
export const TM_MIN_DAYS = 15;
const SLOT = 300, SLOTS = 288;

/** Seeded PRNG (mulberry32): deterministic on every machine. */
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

type Ratio = [number, number, number, number]; // o,h,l,c over the previous close

/** Pool of bar ratios by time-of-day slot. Bars after a gap (> 10 min, e.g. weekend) are skipped. */
export function buildPool(bars: TmBar[]): { pool: Ratio[][]; days: number } {
  const pool: Ratio[][] = Array.from({ length: SLOTS }, () => []);
  const days = new Set<number>();
  for (let i = 1; i < bars.length; i++) {
    const p = bars[i - 1]!, b = bars[i]!;
    if (b.t - p.t > 600 || p.c <= 0) continue;
    const slot = Math.floor((((b.t % 86400) + 86400) % 86400) / SLOT);
    pool[slot]!.push([b.o / p.c, b.h / p.c, b.l / p.c, b.c / p.c]);
    days.add(Math.floor(b.t / 86400));
  }
  return { pool, days: days.size };
}

/** Breakeven share of decisive replays the target must win: 1 / (1 + R). */
export const breakevenShare = (rr: number) => 1 / (1 + rr);

/** One-line verdict from the replays that hit a side, weighed by the target's R (5 / 15 point bands). */
export function verdictOf(tpFirst: number, slFirst: number, rr: number): { lean: TmResult["lean"]; strength: TmResult["strength"]; tp_share: number | null; text: string } {
  const decisive = tpFirst + slFirst;
  if (decisive <= 0) return { lean: "even", strength: "even", tp_share: null, text: "Almost no replay hit the stop or the target in the horizon" };
  const share = tpFirst / decisive, be = breakevenShare(rr), edge = (share - be) * 100;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const tail = `target first ${pct(tpFirst)} vs stop first ${pct(slFirst)} (needs ${pct(be)} of decisive, got ${pct(share)})`;
  if (Math.abs(edge) < 5) return { lean: "even", strength: "even", tp_share: share, text: `${Math.abs(rr - 1) < 0.05 ? "Close to a coin flip" : "Close to break-even"}: ${tail}` };
  const lean = edge > 0 ? "target" : "stop", strength = Math.abs(edge) >= 15 ? "strong" : "lean";
  return { lean, strength, tp_share: share, text: `${strength === "strong" ? "Strongly toward" : "Leans toward"} the ${lean}: ${tail}` };
}

/** Run the Time Machine. Returns null when the plan makes no sense or the pool has too few days. */
export function timeMachine(p: { side: "buy" | "sell"; entry: number; sl: number; tp: number; bars: TmBar[]; now?: number; replays?: number; seed?: number; horizon?: number; window?: number }): TmResult | null {
  const { side, entry, sl, tp } = p;
  const buy = side === "buy";
  if (!(entry > 0) || (buy ? !(sl < entry && tp > entry) : !(sl > entry && tp < entry))) return null;
  const { pool, days } = buildPool(p.bars);
  if (days < TM_MIN_DAYS) return null;
  const replays = p.replays ?? TM_REPLAYS, seed = p.seed ?? TM_SEED, horizon = p.horizon ?? TM_HORIZON, win = p.window ?? TM_WINDOW;
  const risk = Math.abs(entry - sl), rr = Math.abs(tp - entry) / risk;
  const now = p.now ?? (p.bars[p.bars.length - 1]?.t ?? 0) + SLOT;
  const startSlot = Math.floor((((now % 86400) + 86400) % 86400) / SLOT);
  // Candidate ratios per step (slot ± window), precomputed once.
  const steps: Ratio[][] = [];
  for (let k = 0; k < horizon; k++) {
    const s = (startSlot + k) % SLOTS, c: Ratio[] = [];
    for (let d = -win; d <= win; d++) c.push(...pool[(s + d + SLOTS) % SLOTS]!);
    if (!c.length) return null;
    steps.push(c);
  }
  const r = rng(seed);
  let tpN = 0, slN = 0, sumR = 0;
  for (let i = 0; i < replays; i++) {
    let px = entry, done = 0;
    for (let k = 0; k < horizon && !done; k++) {
      const c = steps[k]!, x = c[Math.floor(r() * c.length)]!;
      const h = px * x[1], l = px * x[2];
      // Stop is checked first; a bar touching both counts as the stop (conservative).
      if (buy ? l <= sl : h >= sl) done = -1;
      else if (buy ? h >= tp : l <= tp) done = 1;
      px *= x[3];
    }
    if (done === 1) { tpN++; sumR += rr; }
    else if (done === -1) { slN++; sumR -= 1; }
    else sumR += ((buy ? px - entry : entry - px) / risk);
  }
  const tpF = tpN / replays, slF = slN / replays, v = verdictOf(tpF, slF, rr);
  return { replays, seed, horizon, days, tp_first: tpF, sl_first: slF, neither: 1 - tpF - slF, avg_r: sumR / replays, rr, breakeven: breakevenShare(rr), tp_share: v.tp_share, lean: v.lean, strength: v.strength, verdict: v.text };
}

/** Short line for logs. */
export function tmLine(t: TmResult): string {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  return `Time Machine (${t.replays.toLocaleString("en")} replays, ${t.horizon * 5 / 60}h, ${t.days} days, seed ${t.seed}): target ${pct(t.tp_first)} · stop ${pct(t.sl_first)} · open ${pct(t.neither)} · avg ${t.avg_r >= 0 ? "+" : ""}${t.avg_r.toFixed(2)}R — ${t.verdict.split(":")[0]}`;
}

/** Paper-challenge veto: only when the replays point strongly toward the stop AND at least TM_MIN_DECISIVE of
 *  them hit a side (otherwise the price at the end of the horizon decides, and the lean is noise). */
export const TM_MIN_DECISIVE = 0.3;
export const tmBlocks = (t: TmResult | null) => !!t && t.lean === "stop" && t.strength === "strong" && t.tp_first + t.sl_first >= TM_MIN_DECISIVE;
