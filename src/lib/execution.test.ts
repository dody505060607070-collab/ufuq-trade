import { describe, expect, it } from "vitest";
import { canApplyResult, dayPnlFromDeals, executionsOf, lotProblem, mapEaStatus, marketClosed, reservedExecutions, snapshotUsable } from "./execution";
import { riskCheck, executionPrice } from "./risk-engine";

const ctx = { price: 2000, ask: 2000.3, spreadPrice: 0.3, atr: 5, balance: 1000, lot: 0.02, dollarsPerPricePerLot: 100, dayPnl: 0, maxDailyLossPct: 5, maxRiskPct: 5, requireFreshPrice: true, priceAgeSec: 5 };
const buy = { direction: "buy", confidence: 70, entry: 2000, stop_loss: 1993, take_profit: 2012 };

describe("risk at live execution price", () => {
  it("mandatory: buy 2000/1993/2012 is rejected after price moves to 2006 (old R/R 1.71 not used)", () => {
    const v = riskCheck(buy, { ...ctx, price: 2005.7, ask: 2006 });
    expect(v.allow).toBe(false);
    expect(v.execPrice).toBe(2006);
    expect(v.rr).toBeCloseTo(6 / 13, 3);
  });
  it("buy uses ask, sell uses bid", () => {
    expect(executionPrice("buy", ctx)).toBe(2000.3);
    expect(executionPrice("sell", ctx)).toBe(2000);
  });
  it("rejects price past the target", () => expect(riskCheck(buy, { ...ctx, price: 2013, ask: 2013.3 }).reason).toMatch(/moved past/));
  it("rejects NaN and Infinity", () => {
    expect(riskCheck({ ...buy, take_profit: NaN }, ctx).allow).toBe(false);
    expect(riskCheck(buy, { ...ctx, atr: Infinity }).allow).toBe(false);
  });
  it("rejects negative values", () => expect(riskCheck(buy, { ...ctx, spreadPrice: -1 }).allow).toBe(false));
  it("auto: rejects unknown spread", () => expect(riskCheck(buy, { ...ctx, spreadPrice: null }).reason).toBe("Broker spread unknown"));
  it("rejects a lot below the broker minimum instead of raising it", () => expect(riskCheck(buy, { ...ctx, lot: 0.005, lotSpec: { min: 0.01, step: 0.01 } }).reason).toMatch(/minimum/));
  it("reports loss at stop from the fill price", () => expect(riskCheck(buy, ctx).lossAtStop).toBeCloseTo(7.3 * 0.02 * 100, 6));
});

describe("command lifecycle", () => {
  it("late result cannot overwrite a finished command", () => {
    expect(canApplyResult("done", "failed")).toBe(false);
    expect(canApplyResult("expired", "done")).toBe(false);
    expect(canApplyResult("sent", "done")).toBe(true);
    expect(canApplyResult("unknown", "done")).toBe(true);
  });
  it("partial maps to partially_filled", () => expect(mapEaStatus("partial")).toBe("partially_filled"));
  it("multi-trade command counts each execution", () => expect(executionsOf({ count: 3 })).toBe(3));
  it("reserved executions include unknown and yesterday's queued", () => {
    expect(reservedExecutions([{ status: "queued", payload: { count: 2 } }, { status: "unknown", payload: {} }, { status: "done", payload: { count: 5 } }])).toBe(3);
  });
});

describe("accounting and data", () => {
  it("daily P/L counts deals on their own day, not the position close day", () => {
    const deals = [{ profit: 30, closed_at: "2026-10-23T23:00:00Z" }, { profit: -5, closed_at: "2026-10-24T01:00:00Z" }];
    expect(dayPnlFromDeals(deals, "2026-10-24T00:00:00Z")).toBe(-5);
    expect(dayPnlFromDeals(deals, "2026-10-23T00:00:00Z")).toBe(30);
  });
  it("partial snapshot never closes missing positions", () => expect(snapshotUsable({ positionsOk: false }).closeMissing).toBe(false));
  it("older snapshot arriving late is ignored", () => expect(snapshotUsable({ snapshotAt: 100, lastSnapshotAt: 200 }).use).toBe(false));
  it("lot step is enforced", () => expect(lotProblem(0.015, { step: 0.01 })).toMatch(/step/));
  it("weekend closes gold but not bitcoin", () => {
    const sat = new Date("2026-10-24T12:00:00Z");
    expect(marketClosed("XAUUSD", sat)).toBe(true);
    expect(marketClosed("BTCUSD", sat)).toBe(false);
  });
});
