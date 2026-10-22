import { describe, it, expect } from "vitest";
import { fairValueGaps, premiumDiscount, killZone, marketStructure } from "./ict";

const bar = (o: number, h: number, l: number, c: number) => ({ o, h, l, c });

describe("ict", () => {
  it("detects an unfilled bullish FVG", () => {
    const g = fairValueGaps([bar(10, 11, 9, 10.5), bar(10.5, 14, 10.5, 13.8), bar(13.8, 15, 12, 14.5)]);
    expect(g).toEqual([{ type: "bull", top: 12, bottom: 11, index: 1 }]);
  });
  it("drops a FVG once price trades back into it", () => {
    expect(fairValueGaps([bar(10, 11, 9, 10.5), bar(10.5, 14, 10.5, 13.8), bar(13.8, 15, 12, 14.5), bar(14, 14, 10.8, 11)])).toEqual([]);
  });
  it("classifies price near range high as premium", () => {
    expect(premiumDiscount([bar(0, 100, 0, 50), bar(50, 95, 80, 90)]).zone).toBe("premium");
  });
  it("London kill zone at 08:00 UTC, none at 20:00", () => {
    expect(killZone(new Date("2026-01-01T08:00:00Z"))).toBe("London");
    expect(killZone(new Date("2026-01-01T20:00:00Z"))).toBeNull();
  });
  it("close above last swing high is bullish break", () => {
    const bars = [1, 3, 5, 3, 1, 2, 4, 2, 1, 6].map((p) => bar(p, p + 0.5, p - 0.5, p));
    expect(marketStructure(bars).bias).toBe("bullish");
  });
});
