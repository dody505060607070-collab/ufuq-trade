import { describe, it, expect } from "vitest";
import { cotBias, hourStats, outcomeOf, ruleKey, rulesText } from "./brain";

describe("brain", () => {
  it("classifies outcomes", () => {
    expect(outcomeOf(12)).toBe("win");
    expect(outcomeOf(-3)).toBe("loss");
    expect(outcomeOf(0.2)).toBe("breakeven");
  });
  it("merges similar rules", () => {
    expect(ruleKey("Avoid selling gold before US CPI!")).toBe(ruleKey("avoid selling  gold before us cpi"));
  });
  it("groups win rate by hour", () => {
    const s = hourStats([
      { profit: 5, closed_at: "2026-10-20T08:10:00Z" },
      { profit: -2, closed_at: "2026-10-20T08:40:00Z" },
    ]);
    expect(s).toEqual([{ hour: 8, trades: 2, winRate: 50, net: 3 }]);
  });
  it("reads gold COT as bullish when speculators are heavily long", () => {
    expect(cotBias(245300, 37421, -103, 2353).bias).toBe("bullish");
  });
  it("reads euro COT as bearish when speculators add shorts", () => {
    expect(cotBias(222929, 360502, -20091, 18150).bias).toBe("bearish");
  });
  it("lists rules for the prompt", () => {
    expect(rulesText([])).toBe("none yet");
    expect(rulesText([{ rule: "Wait for London open", hits: 2, symbol: "XAUUSD" }])).toContain("seen 2x");
  });
});
