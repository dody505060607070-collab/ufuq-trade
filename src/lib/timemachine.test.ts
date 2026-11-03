import { describe, it, expect } from "vitest";
import { timeMachine, verdictOf, breakevenShare, tmBlocks, type TmBar } from "./timemachine";

// 30 days of 24h M5 bars from a seeded random walk (no drift unless asked).
function walk(days: number, drift = 0, vol = 0.0008): TmBar[] {
  let s = 7, px = 2000;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const out: TmBar[] = [];
  const t0 = 1_700_000_000 - (1_700_000_000 % 86400);
  for (let i = 0; i < days * 288; i++) {
    const o = px, c = px * (1 + drift + (r() - 0.5) * vol);
    out.push({ t: t0 + i * 300, o, h: Math.max(o, c) * (1 + r() * vol / 4), l: Math.min(o, c) * (1 - r() * vol / 4), c });
    px = c;
  }
  return out;
}

describe("time machine", () => {
  it("break-even share is 50% at 1R, 33% at 2R", () => {
    expect(breakevenShare(1)).toBeCloseTo(0.5);
    expect(breakevenShare(2)).toBeCloseTo(1 / 3);
  });
  it("2R plan with 24.1% target vs 50.5% stop is close to break-even, not a loser (skill example)", () => {
    expect(verdictOf(0.241, 0.505, 2).lean).toBe("even");
  });
  it("1R plan with 20% target vs 60% stop is strongly toward the stop", () => {
    const v = verdictOf(0.2, 0.6, 1);
    expect(v.lean).toBe("stop");
    expect(v.strength).toBe("strong");
  });
  it("same data + same seed gives the same numbers", () => {
    const bars = walk(30);
    const e = bars[bars.length - 1]!.c;
    const a = timeMachine({ side: "buy", entry: e, sl: e * 0.997, tp: e * 1.003, bars, replays: 2000 })!;
    const b = timeMachine({ side: "buy", entry: e, sl: e * 0.997, tp: e * 1.003, bars, replays: 2000 })!;
    expect(a.tp_first).toBe(b.tp_first);
    expect(a.tp_first + a.sl_first + a.neither).toBeCloseTo(1);
  });
  it("a strong downtrend makes a buy lean to the stop and gets vetoed", () => {
    const bars = walk(30, -0.0004);
    const e = bars[bars.length - 1]!.c;
    const t = timeMachine({ side: "buy", entry: e, sl: e * 0.995, tp: e * 1.005, bars, replays: 2000 })!;
    expect(t.lean).toBe("stop");
    expect(tmBlocks(t)).toBe(true);
  });
  it("refuses a nonsense plan (buy with stop above entry) and too little history", () => {
    const bars = walk(30);
    expect(timeMachine({ side: "buy", entry: 2000, sl: 2010, tp: 2020, bars })).toBeNull();
    expect(timeMachine({ side: "buy", entry: 2000, sl: 1990, tp: 2010, bars: walk(5) })).toBeNull();
  });
});

describe("time machine veto", () => {
  const base = { replays: 10000, seed: 19, horizon: 48, days: 60, avg_r: -0.1, rr: 1.5, breakeven: 0.4, tp_share: 0.1, lean: "stop" as const, strength: "strong" as const, verdict: "" };
  it("does not veto when fewer than 30% of replays hit a side (2% target, 19% stop)", () => {
    expect(tmBlocks({ ...base, tp_first: 0.02, sl_first: 0.19, neither: 0.79 })).toBe(false);
  });
  it("vetoes a strong stop lean when most replays hit a side", () => {
    expect(tmBlocks({ ...base, tp_first: 0.15, sl_first: 0.8, neither: 0.05 })).toBe(true);
  });
});
