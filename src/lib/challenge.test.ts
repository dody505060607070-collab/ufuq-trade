import { describe, it, expect } from "vitest";
import { SIM_START, SIM_TARGET, costsFor, openSim, pnl, exitHit, liquidated, challengeProgress, drawdownPct, fillPrice } from "./challenge";

const c = costsFor("XAUUSD");
const base = { mid: 4000, equity: 100, freeMargin: 100, riskPct: 10, leverage: 100, costs: c };

describe("free demo challenge simulator", () => {
  it("starts at $100 with a $1M target", () => { expect(SIM_START).toBe(100); expect(SIM_TARGET).toBe(1_000_000); });
  it("buy fills above mid by half spread + slippage", () => expect(fillPrice("buy", 4000, c)).toBeCloseTo(4000.2));
  it("sizes 0.01 lot on $100 with a $5 stop (risk ~ $5.07 <= $10)", () => {
    const t = openSim({ ...base, side: "buy", sl: 3995, tp: 4010 });
    expect("lot" in t && t.lot).toBe(0.01);
  });
  it("rejects a trade whose minimum lot risks more than the limit", () => {
    const t = openSim({ ...base, side: "buy", sl: 3980, tp: 4050 });
    expect("error" in t).toBe(true);
  });
  it("margin at 1:100 for 0.01 lot of gold at ~4000 is ~$40", () => {
    const t = openSim({ ...base, side: "buy", sl: 3995, tp: 4010 });
    expect("margin" in t && Math.round(t.margin)).toBe(40);
  });
  it("profit includes commission", () => {
    const t = openSim({ ...base, side: "buy", sl: 3995, tp: 4010 });
    if ("error" in t) throw new Error();
    expect(pnl(t, 4010, c)).toBeCloseTo((4010 - 4000.2) * 1 - 0.07, 5);
  });
  it("sell stop/target hits", () => {
    const t = { side: "sell" as const, lot: 0.01, entry: 4000, stop_loss: 4005, take_profit: 3990, margin: 40, fees: 0.07 };
    expect(exitHit(t, 4001, 3989)?.reason).toBe("take_profit");
    expect(exitHit(t, 4006, 3989)?.reason).toBe("stop_loss");
    expect(exitHit(t, 4001, 3995)).toBeNull();
  });
  it("liquidates below 50% margin level", () => { expect(liquidated(19, 40)).toBe(true); expect(liquidated(21, 40)).toBe(false); });
  it("progress and drawdown", () => { expect(challengeProgress(100, 1e6, 1e6)).toBe(100); expect(challengeProgress(100, 100, 1e6)).toBe(0); expect(drawdownPct(200, 150)).toBe(25); });
});
