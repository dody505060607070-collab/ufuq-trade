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

import { mtfConflict as mc2 } from "./mtf";
describe("strong momentum vs lagging H4", () => {
  it("allows buy when M15+H1 up, H4 down, ADX 57", () => { expect(mc2("buy", { M15: "up", H1: "up", H4: "down" }, null, 57)).toBeNull(); });
  it("still blocks when ADX is 30", () => { expect(mc2("buy", { M15: "up", H1: "up", H4: "down" }, null, 30)).not.toBeNull(); });
  it("still blocks when H1 is against", () => { expect(mc2("buy", { M15: "up", H1: "down", H4: "up" }, null, 57)).not.toBeNull(); });
});
