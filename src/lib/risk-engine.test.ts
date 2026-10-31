import { describe, expect, it } from "vitest";
import { riskCheck, dollarsPerPrice } from "./risk-engine";
import { backtest, ruleStatus } from "./backtest";

const ctx = { price: 2000, spreadPrice: 0.3, atr: 5, balance: 1000, lot: 0.02, dollarsPerPricePerLot: 100, dayPnl: 0, maxDailyLossPct: 5, maxRiskPct: 5 };
const buy = { direction: "buy", confidence: 70, entry: 2000, stop_loss: 1993, take_profit: 2012 };

describe("risk engine", () => {
  it("approves a sane buy", () => expect(riskCheck(buy, ctx).allow).toBe(true));
  it("rejects neutral", () => expect(riskCheck({ ...buy, direction: "neutral" }, ctx).allow).toBe(false));
  it("rejects reward/risk below 1", () => expect(riskCheck({ ...buy, take_profit: 2005 }, ctx).allow).toBe(false));
  it("rejects high spread", () => expect(riskCheck(buy, { ...ctx, spreadPrice: 3 }).allow).toBe(false));
  it("rejects after 5% daily loss", () => expect(riskCheck(buy, { ...ctx, dayPnl: -50 }).allow).toBe(false));
  it("rejects risking over 5% of balance", () => expect(riskCheck(buy, { ...ctx, lot: 1 }).allow).toBe(false));
  it("gold is $100 per 1.0 move per lot", () => expect(dollarsPerPrice("XAUUSD")).toBe(100));
});

describe("backtest & rules", () => {
  it("charges spread and records a stop-out", () => {
    const cs = Array.from({ length: 5 }, (_, i) => ({ t: i, o: 100, h: 101, l: i === 3 ? 95 : 99, c: 100 }));
    const r = backtest(cs, (h) => (h.length === 2 ? { side: "buy", sl: 96, tp: 110 } : null), { spread: 0.5, warmup: 2 });
    expect(r.trades).toHaveLength(1);
    expect(r.net).toBe(-4.5);
  });
  it("rule needs 3 hits to be approved", () => {
    expect(ruleStatus(1, "hypothesis")).toBe("hypothesis");
    expect(ruleStatus(2, "hypothesis")).toBe("trial");
    expect(ruleStatus(3, "trial")).toBe("approved");
    expect(ruleStatus(9, "retired")).toBe("retired");
  });
});

import { reanchor as _re } from "./risk-engine";
describe("reanchor", () => {
  it("68% sell at 4029.7 with live price 4040 keeps 7 stop / 12.5 target and passes", () => {
    const p = _re({ direction: "sell", confidence: 68, entry: 4029.7, stop_loss: 4036.7, take_profit: 4017.2 }, 4040);
    expect(p.entry).toBe(4040); expect(p.stop_loss).toBe(4047); expect(p.take_profit).toBe(4027.5);
  });
});

describe("broker reference & dollar risk", () => {
  const p = { direction: "buy", confidence: 70, entry: 4000, stop_loss: 3990, take_profit: 4020 };
  const c = { price: 4000, spreadPrice: 0.3, atr: 8, balance: 1000, lot: 0.02, dollarsPerPricePerLot: 100, dayPnl: 0, maxDailyLossPct: 5, maxRiskPct: 5 };
  it("blocks entries when the broker quote is older than 120s", () => {
    expect(riskCheck(p, { ...c, quoteAgeSec: 121 }).allow).toBe(false);
    expect(riskCheck(p, { ...c, quoteAgeSec: 30 }).allow).toBe(true);
  });
  it("counts the spread in the dollar loss at the stop", () => {
    // (10 + 0.3) * 0.02 * 100 = 20.6 > 2% of 1000 = 20
    expect(riskCheck(p, { ...c, maxRiskPct: 2 }).allow).toBe(false);
    expect(riskCheck(p, { ...c, spreadPrice: 0, maxRiskPct: 2 }).allow).toBe(true);
  });
});

describe("index dollar risk", () => {
  it("indices are about $1 per point per lot, not forex size", () => {
    expect(dollarsPerPrice("US30")).toBe(1);
    expect(dollarsPerPrice("UK100")).toBe(1.3);
    expect(dollarsPerPrice("EURUSD")).toBe(100000);
    expect(dollarsPerPrice("XAUUSD")).toBe(100);
  });
  it("broker tick value still wins when the EA sends it", () => {
    expect(dollarsPerPrice("US30", 0.01, 0.01)).toBe(1);
  });
});

import { brokerGate, effectiveLot, roundPrice } from "./risk-engine";
describe("real trades use the broker's own price", () => {
  // US30 on 2026-10-30: AI entry 51825, stop 52030 (205 pts), broker filled at 51630.5 (195 pts away).
  const us30 = { direction: "sell", confidence: 72, entry: 51825, stop_loss: 52030, take_profit: 51510 };
  it("blocks a market with no broker price", () => expect(brokerGate(us30, null)).toMatch(/no live broker price/));
  it("blocks when the analysed price is more than half a stop away from the broker", () => expect(brokerGate(us30, 51630.5)).toMatch(/too far/));
  it("allows gold when the broker price is close (0.6 of a 15-point stop)", () =>
    expect(brokerGate({ direction: "sell", confidence: 72, entry: 4004.34, stop_loss: 4019.5, take_profit: 3974 }, 4004.965)).toBeNull());
  it("measures risk on the broker minimum lot (UK100 0.02 -> 0.05)", () => {
    expect(effectiveLot(0.02, 0.05)).toBe(0.05);
    expect(effectiveLot(0.02, 0.01)).toBe(0.02);
  });
  it("keeps forex decimals when moving levels to the broker price", () => {
    const p = _re({ direction: "buy", confidence: 74, entry: 1.33835, stop_loss: 1.33615, take_profit: 1.342 }, 1.33879, 0.00001);
    expect(p.stop_loss).toBe(1.33659); expect(p.take_profit).toBe(1.34244);
    expect(roundPrice(1.123456)).toBe(1.12346);
  });
});

describe("2% per-trade risk (user setting 2026-10-31)", () => {
  const base = { price: 4055, spreadPrice: 0.2, atr: 8, balance: 990, lot: 0.02, dollarsPerPricePerLot: 100, dayPnl: 0, maxDailyLossPct: 5, maxRiskPct: 2 };
  it("blocks the 12-point gold stop at 0.02 lot (~$25 > $19.80)", () =>
    expect(riskCheck({ direction: "buy", confidence: 72, entry: 4055, stop_loss: 4042.7, take_profit: 4073.5 }, base).allow).toBe(false));
  it("allows an 8-point gold stop at 0.02 lot (~$16)", () =>
    expect(riskCheck({ direction: "buy", confidence: 72, entry: 4055, stop_loss: 4047, take_profit: 4067 }, base).allow).toBe(true));
  it("stops new trades after a 5% daily loss ($49.50 on $990)", () =>
    expect(riskCheck({ direction: "buy", confidence: 72, entry: 4055, stop_loss: 4047, take_profit: 4067 }, { ...base, dayPnl: -50 }).allow).toBe(false));
});
