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
