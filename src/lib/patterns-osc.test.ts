import { describe, it, expect } from "vitest";
import { multiCandlePattern } from "./priceaction";
import { bollinger, stochastic } from "./indicators";
import { oscillatorVote, buildEvidence } from "./evidence";

const bar = (o: number, h: number, l: number, c: number) => ({ o, h, l, c, t: 0 });

describe("multi-candle patterns", () => {
  it("morning star votes buy", () => {
    expect(multiCandlePattern([bar(110, 110.5, 99.5, 100), bar(100, 100.6, 99.4, 100.1), bar(100.2, 108, 100, 107)])).toEqual({ name: "morning star", dir: "buy" });
  });
  it("three outside down votes sell", () => {
    expect(multiCandlePattern([bar(100, 102.2, 99.8, 102), bar(102.5, 102.6, 98.5, 99), bar(99, 99.2, 97, 97.5)])?.dir).toBe("sell");
  });
  it("TheStrat 2-1-2 up needs a close above the inside bar", () => {
    expect(multiCandlePattern([bar(100, 110, 95, 108), bar(106, 107, 102, 104), bar(104, 112, 103, 111)])?.name).toBe("TheStrat 2-1-2 up");
  });
  it("returns null on too few bars", () => { expect(multiCandlePattern([bar(1, 2, 0, 1)])).toBeNull(); });
});

describe("oscillators", () => {
  it("Bollinger on flat prices has zero width", () => { expect(bollinger(Array(20).fill(5))?.widthPct).toBe(0); });
  it("Stochastic is 100 when closing at the high of a steady rally", () => {
    const bars = Array.from({ length: 30 }, (_, i) => bar(i, i + 1, i - 0.5, i + 1));
    expect(stochastic(bars)!.k).toBeCloseTo(100, 0);
  });
  it("a close far below the lower band votes buy (mean reversion)", () => {
    const bars = [...Array.from({ length: 40 }, (_, i) => bar(100, 100.5, 99.5, 100 + (i % 2 ? 0.2 : -0.2))), bar(100, 100, 94, 94.5)];
    expect(oscillatorVote(bars).bbVote).toBe("buy");
  });
  it("new tools appear in the evidence report", () => {
    const m15 = Array.from({ length: 80 }, (_, i) => bar(100 + i * 0.1, 100.3 + i * 0.1, 99.8 + i * 0.1, 100.1 + i * 0.1));
    const names = buildEvidence({ symbol: "EURUSD", dir: "buy", m15, h1: m15, headlines: null }).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["Multi-candle pattern (M15)", "Stochastic (M15)", "Bollinger Bands (M15)"]));
  });
});
