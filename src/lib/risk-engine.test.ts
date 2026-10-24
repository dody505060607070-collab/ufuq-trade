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
  const auto = { ...ctx, requireFreshPrice: true, priceAgeSec: 10 };
  it("auto: approves with a fresh broker price", () => expect(riskCheck(buy, auto).allow).toBe(true));
  it("auto: rejects a stale price", () => expect(riskCheck(buy, { ...auto, priceAgeSec: 600 }).reason).toBe("Broker price is stale"));
  it("auto: rejects when no current price", () => expect(riskCheck(buy, { ...auto, price: null }).reason).toBe("No current broker price"));
  it("auto: rejects when broker specs are missing", () => expect(riskCheck(buy, { ...auto, dollarsPerPricePerLot: null }).allow).toBe(false));
  it("uses the user's daily loss %, not a fixed 5%", () => {
    expect(riskCheck(buy, { ...ctx, dayPnl: -25, maxDailyLossPct: 2 }).allow).toBe(false);
    expect(riskCheck(buy, { ...ctx, dayPnl: -25, maxDailyLossPct: 5 }).allow).toBe(true);
  });
  it("uses the user's max risk %", () => expect(riskCheck(buy, { ...ctx, maxRiskPct: 1 }).allow).toBe(false));
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
