import { describe, it, expect } from "vitest";
import { pullbackBreakout, volRegime } from "./priceaction";
const mk = (o: number, c: number) => ({ o, c, h: Math.max(o, c) + 0.2, l: Math.min(o, c) - 0.2 });
describe("pullbackBreakout", () => {
  it("buys when an uptrend pulls back 2 bars then breaks the pullback high", () => {
    const bars = Array.from({ length: 30 }, (_, i) => mk(100 + i, 101 + i));
    bars.push(mk(131, 130), mk(130, 129.5), mk(129.5, 132));
    expect(pullbackBreakout(bars)).toBe("buy");
  });
  it("returns null with no pullback", () => {
    const bars = Array.from({ length: 33 }, (_, i) => mk(100 + i, 101 + i));
    expect(pullbackBreakout(bars)).toBeNull();
  });
  it("volRegime unknown on short data", () => expect(volRegime([mk(1, 2)])).toBe("unknown"));
});
