import { describe, it, expect } from "vitest";
import { mtfConflict, shouldRetireRule } from "./mtf";

describe("multi-timeframe gate", () => {
  it("blocks a buy against the H4 downtrend when M15 is not up", () => {
    expect(mtfConflict("buy", { M15: "range", H1: "up", H4: "down" })).toContain("H4");
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
  it("split mode allows M15+H1 up at ADX 20 (70% floor applies)", () => { expect(mc2("buy", { M15: "up", H1: "up", H4: "down" }, null, 20)).toBeNull(); });
  it("still blocks when H1 is against and M15 is down", () => { expect(mc2("buy", { M15: "down", H1: "down", H4: "up" }, null, 57)).not.toBeNull(); });
});

import { momentumBias, mtfText } from "./mtf";
describe("momentum mode for the AI prompt", () => {
  it("gold M15+H1 up, H4 down, ADX 57.8 → buy allowed", () => { expect(momentumBias({ M15: "up", H1: "up", H4: "down" }, 57.8)).toBe("buy"); });
  it("ADX 35 → no momentum mode", () => { expect(momentumBias({ M15: "up", H1: "up", H4: "down" }, 35)).toBeNull(); });
  it("prompt text tells the AI momentum mode is active", () => { expect(mtfText({ M15: "up", H1: "up", H4: "down" }, 57.8)).toContain("MOMENTUM MODE ACTIVE"); });
});
