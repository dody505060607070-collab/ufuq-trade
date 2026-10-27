import { describe, it, expect } from "vitest";
import { buildEvidence, checklistVerdict, preTradeChecklist, reviewTrade, thesisBroken, riskAdjusted } from "./evidence";

const bars = Array.from({ length: 120 }, (_, i) => { const c = 100 + i * 0.5 + Math.sin(i) * 0.3; return { t: i * 900, o: c - 0.2, h: c + 0.6, l: c - 0.6, c }; });
const ev = buildEvidence({ symbol: "EURUSD", dir: "buy", m15: bars, h1: bars, headlines: ["gold rises"], now: new Date(Date.UTC(2026, 0, 5, 3)) });
const base = { trends: { M15: "up", H1: "up", H4: "up", D1: "up" }, dir: "buy" as const, priceAgeMin: 1, ev, rr: 2, costShare: 0.05, debate: { bull: ["trend"], bear: ["resistance"], failure: ["close below EMA"], missing: [] } };

describe("evidence pipeline", () => {
  it("skips the gold news model for non-metals and says why", () => {
    const n = ev.tools.find((t) => t.name.startsWith("News"));
    expect(n?.used).toBe(false);
    expect(n?.why).toMatch(/gold\/silver/);
  });
  it("records the session tool as outside London/NY at 03:00 UTC", () => {
    expect(ev.tools.find((t) => t.name.startsWith("Session"))?.result).toBe("outside London/NY");
  });
  it("rejects when costs eat more than 20% of the stop", () => {
    expect(checklistVerdict(preTradeChecklist({ ...base, costShare: 0.3 })).decision).toBe("reject");
  });
  it("rejects stale data older than 20 minutes", () => {
    expect(checklistVerdict(preTradeChecklist({ ...base, priceAgeMin: 45 })).decision).toBe("reject");
  });
  it("waits when timeframes disagree", () => {
    expect(checklistVerdict(preTradeChecklist({ ...base, trends: { M15: "down", H1: "up", H4: "down", D1: "down" } })).decision).not.toBe("accept");
  });
  it("waits when the AI debate is missing (too much uncertainty)", () => {
    expect(checklistVerdict(preTradeChecklist({ ...base, debate: null, priceAgeMin: null })).decision).toBe("wait");
  });
  it("thesis is broken only when both H1 and H4 turn against", () => {
    expect(thesisBroken("buy", { H1: "down", H4: "down" })).toBeTruthy();
    expect(thesisBroken("buy", { H1: "down", H4: "up" })).toBeNull();
  });
  it("a rule-following loss is classed as variance, not a bad decision", () => {
    const cl = preTradeChecklist(base);
    const r = reviewTrade({ profit: -2, risk_usd: 2, close_reason: "stop_loss", checklist: cl, votes: null });
    expect(r.r_multiple).toBe(-1);
    expect(r.outcome_class).toBe("good decision, bad outcome (variance)");
  });
  it("a win from a checklist that failed is a lucky win", () => {
    const cl = preTradeChecklist({ ...base, costShare: 0.5, rr: 1, priceAgeMin: 60, trends: { H1: "down", H4: "down" } });
    expect(reviewTrade({ profit: 3, risk_usd: 2, close_reason: "take_profit", checklist: cl, votes: null }).outcome_class).toBe("weak decision, lucky win");
  });
  it("risk-adjusted needs 3+ trades", () => {
    expect(riskAdjusted([1, -1])).toBeNull();
    expect(riskAdjusted([2, -1, 2])).toBeCloseTo(0.58, 1);
  });
});
