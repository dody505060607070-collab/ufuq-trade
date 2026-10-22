import { describe, it, expect } from "vitest";
import { rsi, atr, snapshot } from "./indicators";

describe("indicators", () => {
  it("RSI is 100 when price only rises", () => {
    expect(rsi(Array.from({ length: 30 }, (_, i) => 100 + i))).toBe(100);
  });
  it("ATR equals constant bar range", () => {
    const bars = Array.from({ length: 30 }, () => ({ o: 10, h: 12, l: 10, c: 11 }));
    expect(atr(bars)).toBeCloseTo(2);
  });
  it("detects uptrend", () => {
    const bars = Array.from({ length: 80 }, (_, i) => ({ o: i, h: i + 1, l: i - 1, c: i }));
    expect(snapshot(bars)?.trend).toBe("up");
  });
});
