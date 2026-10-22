import { describe, it, expect } from "vitest";
import { candlePattern, liquidityPools, dailyContext } from "./priceaction";

const bar = (o: number, h: number, l: number, c: number) => ({ o, h, l, c });

describe("priceaction", () => {
  it("detects a bullish engulfing", () => {
    expect(candlePattern([bar(10, 10.2, 9, 9.2), bar(9.1, 10.5, 9, 10.3)])).toBe("bullish engulfing");
  });
  it("detects a bullish pin bar", () => {
    expect(candlePattern([bar(10, 11, 9.5, 10.5), bar(10, 10.1, 8, 10.05)])).toMatch(/bullish pin bar/);
  });
  it("finds equal highs as buy-side liquidity", () => {
    const bars = [bar(1, 100, 90, 95), bar(95, 96, 91, 92), bar(92, 94, 91, 93), bar(93, 97, 92, 96), bar(96, 100.05, 93, 94)];
    expect(liquidityPools(bars).bsl).toBe(100.05);
  });
  it("uses the previous daily candle for PDH/PDL", () => {
    expect(dailyContext([bar(1, 5, 0, 4), bar(4, 8, 3, 7), bar(7, 9, 6, 8)])).toMatchObject({ pdh: 8, pdl: 3 });
  });
});
