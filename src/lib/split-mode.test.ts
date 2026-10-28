import { describe, it, expect } from "vitest";
import { mtfConflict, isSplitTrade, SPLIT_MIN_CONFIDENCE } from "./mtf";

describe("split mode — H1 and H4 disagree", () => {
  it("allows a sell when M15+H4 down, H1 up and a pullback-breakout confirms", () => {
    expect(mtfConflict("sell", { M15: "down", H1: "up", H4: "down" }, null, 18, "sell")).toBeNull();
  });
  it("allows a buy when M15+H1 up, H4 down and ADX is 25", () => {
    expect(mtfConflict("buy", { M15: "up", H1: "up", H4: "down" }, null, 25, null)).toBeNull();
  });
  it("allows split trade when M15 trends with one side even at ADX 18", () => {
    expect(mtfConflict("buy", { M15: "up", H1: "up", H4: "down" }, null, 18, null)).toBeNull();
    expect(isSplitTrade("buy", { M15: "up", H1: "up", H4: "down" }, null, 18, null)).toBe(true);
  });
  it("still blocks when M15 is against the trade", () => {
    expect(mtfConflict("buy", { M15: "down", H1: "up", H4: "down" }, null, 30, "buy")).not.toBeNull();
  });
  it("never trades against both H1 and H4", () => {
    expect(mtfConflict("buy", { M15: "up", H1: "down", H4: "down" }, null, 50, "buy")).not.toBeNull();
  });
  it("both ranging: allowed only with a pullback-breakout", () => {
    expect(mtfConflict("buy", { M15: "up", H1: "range", H4: "range" }, null, 30, "buy")).toBeNull();
    expect(mtfConflict("buy", { M15: "up", H1: "range", H4: "range" }, null, 30, null)).not.toBeNull();
  });
  it("split trades need 70% confidence", () => {
    expect(SPLIT_MIN_CONFIDENCE).toBe(70);
    expect(isSplitTrade("sell", { M15: "down", H1: "up", H4: "down" }, null, 18, "sell")).toBe(true);
    expect(isSplitTrade("sell", { M15: "up", H1: "down", H4: "down" }, null, 18, null)).toBe(false);
  });
});

describe("split mode with M15 still ranging", () => {
  it("allows a confirmed sell when H4 down, H1 up and M15 ranging with a pullback-breakout", () => {
    expect(mtfConflict("sell", { M15: "range", H1: "up", H4: "down" }, null, 20, "sell")).toBeNull();
  });
  it("blocks the same sell without confirmation", () => {
    expect(mtfConflict("sell", { M15: "range", H1: "up", H4: "down" }, null, 20, null)).not.toBeNull();
  });
});
