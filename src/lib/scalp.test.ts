import { describe, expect, it } from "vitest";
import { SCALP_DEFAULTS, clampParams, evolve, scalpLine, simulate, stats, walkTrade, type Bar } from "./scalp";

const flat = (n: number, px = 100, t0 = 0): Bar[] => Array.from({ length: n }, (_, i) => ({ t: t0 + i * 60, o: px, h: px + 0.1, l: px - 0.1, c: px }));

describe("fast scalping rule", () => {
  it("never lets the evolution lower R/R below 1.5", () => {
    expect(clampParams({ ...SCALP_DEFAULTS, rr: 0.5 }).rr).toBe(1.5);
  });

  it("charges the spread once on a time exit (no move = minus the spread)", () => {
    const b = flat(10);
    const t = walkTrade(b, 0, "buy", 1, 1.5, 3, 0.1)!;
    expect(t.exit).toBe("time");
    expect(t.r).toBeCloseTo(-0.1, 5);
  });

  it("counts a bar touching both stop and target as a stop (conservative)", () => {
    const b = flat(5);
    b[2] = { t: 120, o: 100, h: 105, l: 95, c: 100 };
    expect(walkTrade(b, 0, "buy", 1, 1.5, 3, 0)!.exit).toBe("sl");
  });

  it("does not simulate a trade across a market gap", () => {
    const b = flat(6);
    b[3] = { ...b[3]!, t: b[2]!.t + 3600 };
    expect(walkTrade(b, 1, "buy", 1, 1.5, 3, 0)).toBeNull();
  });

  it("90% wins of $1 and one $15 loss is still a losing record", () => {
    const s = stats([...Array.from({ length: 9 }, (_, i) => ({ i, side: "buy" as const, r: 1, bars: 1, exit: "tp" as const })), { i: 9, side: "buy", r: -15, bars: 1, exit: "sl" }]);
    expect(s.win_rate).toBe(0.9);
    expect(s.net_r).toBe(-6);
  });

  it("buys a breakout above the range and above the EMA", () => {
    const b = flat(80);
    b[70] = { t: 70 * 60, o: 100, h: 101, l: 100, c: 101 };
    const tr = simulate(b, { ...SCALP_DEFAULTS, lookback: 10, emaLen: 20, atrLen: 5 }, 0);
    expect(tr[0]?.i).toBe(70);
    expect(tr[0]?.side).toBe("buy");
  });

  it("evolution is reproducible with the same seed and reports a verdict", () => {
    const r = (s: number) => { let a = s; return () => ((a = (a * 16807) % 2147483647) / 2147483647); };
    const g = r(3); let px = 100;
    const b: Bar[] = Array.from({ length: 1500 }, (_, i) => { const o = px; px += (g() - 0.5) * 0.4; return { t: i * 60, o, h: Math.max(o, px) + g() * 0.1, l: Math.min(o, px) - g() * 0.1, c: px }; });
    const a1 = evolve(b, 0.02, { seed: 5, population: 12, generations: 3, randomPolicies: 100 });
    const a2 = evolve(b, 0.02, { seed: 5, population: 12, generations: 3, randomPolicies: 100 });
    expect(a1.chosen).toEqual(a2.chosen);
    expect(["passed", "not_proven"]).toContain(a1.verdict);
    expect(a1.split.val[0]).toBeGreaterThan(a1.split.train[1]);
  });

  it("builds the EA settings line with hold time in seconds", () => {
    expect(scalpLine(true, ["XAUUSD", "EURUSD"], SCALP_DEFAULTS, 0.02, 48.5, "")).toBe("S|1|XAUUSD,EURUSD|20|14|1.5|1.5|300|0.25|50|0.02|48.5|");
  });
});
