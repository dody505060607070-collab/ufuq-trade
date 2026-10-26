import { describe, it, expect } from "vitest";
import { climaxReversal } from "./priceaction";
import { mtfConflict } from "./mtf";
const flat = Array.from({ length: 20 }, () => ({ o: 100, h: 100.5, l: 99.5, c: 100 }));
const drop = Array.from({ length: 8 }, (_, i) => ({ o: 100 - i, h: 100 - i + 0.2, l: 99 - i - 0.2, c: 99 - i }));
const up = Array.from({ length: 8 }, (_, i) => ({ o: 100 + i, h: 101 + i + 0.2, l: 100 + i - 0.2, c: 101 + i }));
describe("climax reversal", () => {
  it("buys a bullish rejection after a sharp drop", () => {
    expect(climaxReversal([...flat, ...drop, { o: 92.2, h: 93, l: 91, c: 92.9 }])).toBe("buy");
  });
  it("sells a bearish rejection after a sharp spike", () => {
    expect(climaxReversal([...flat, ...up, { o: 107.8, h: 109, l: 107, c: 107.1 }])).toBe("sell");
  });
  it("ignores quiet markets", () => {
    expect(climaxReversal([...flat, ...flat, { o: 100, h: 100.5, l: 99.5, c: 100.3 }])).toBeNull();
  });
  it("lets a reversal trade against one higher timeframe but not both", () => {
    expect(mtfConflict("buy", { M15: "down", H1: "down", H4: "up" }, "buy")).toBeNull();
    expect(mtfConflict("buy", { M15: "down", H1: "down", H4: "down" }, "buy")).not.toBeNull();
    expect(mtfConflict("buy", { M15: "down", H1: "down", H4: "up" }, null)).not.toBeNull();
  });
});
