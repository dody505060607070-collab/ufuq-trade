import { describe, it, expect } from "vitest";
import { mtfConflict, shouldRetireRule } from "./mtf";

describe("multi-timeframe gate", () => {
  it("blocks a buy against the H4 downtrend", () => {
    expect(mtfConflict("buy", { M15: "up", H1: "up", H4: "down" })).toContain("H4");
  });
  it("allows a buy when H1 and H4 are up", () => {
    expect(mtfConflict("buy", { M15: "down", H1: "up", H4: "up" })).toBeNull();
  });
  it("blocks trades when H1 and H4 both range", () => {
    expect(mtfConflict("sell", { M15: "down", H1: "range", H4: "range" })).not.toBeNull();
  });
});

describe("learned rule check", () => {
  it("retires when win rate drops more than 10 points", () => {
    expect(shouldRetireRule({ wins: 2, total: 6 }, { wins: 4, total: 6 })).toBe(true);
  });
  it("keeps the rule with too few trades", () => {
    expect(shouldRetireRule({ wins: 0, total: 4 }, { wins: 4, total: 6 })).toBe(false);
  });
});
