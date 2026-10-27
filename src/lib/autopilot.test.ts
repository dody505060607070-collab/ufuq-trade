import { describe, it, expect } from "vitest";
import { skipReason } from "./autopilot";

const rules = { min_confidence: 75, max_open: 2, max_daily: 4 };
const st = { openTotal: 0, openOnSymbol: 0, todayCount: 0, recentOnSymbol: false, newsNearby: false, avoidNews: true };
const sig = { direction: "buy", confidence: 80, entry: 100, stop_loss: 99, take_profit: 102 };

describe("autopilot rules", () => {
  it("trades a strong signal", () => expect(skipReason(sig, rules, st)).toBeNull());
  it("skips below min confidence", () => expect(skipReason({ ...sig, confidence: 74 }, rules, st)).not.toBeNull());
  it("skips neutral", () => expect(skipReason({ ...sig, direction: "neutral" }, rules, st)).not.toBeNull());
  it("skips without stop loss", () => expect(skipReason({ ...sig, stop_loss: null }, rules, st)).not.toBeNull());
  it("skips near high-impact news", () => expect(skipReason(sig, rules, { ...st, newsNearby: true })).not.toBeNull());
  it("respects max open trades", () => expect(skipReason(sig, rules, { ...st, openTotal: 2 })).not.toBeNull());
  it("respects daily limit", () => expect(skipReason(sig, rules, { ...st, todayCount: 4 })).not.toBeNull());
  it("no duplicate on same symbol below 75%", () => expect(skipReason({ ...sig, confidence: 70 }, { ...rules, min_confidence: 60 }, { ...st, openOnSymbol: 1 })).not.toBeNull());
  it("68% passes but 64% is blocked even if the setting says 60%", () => {
    const r60 = { ...rules, min_confidence: 60 };
    expect(skipReason({ ...sig, confidence: 68 }, r60, st)).toBeNull();
    expect(skipReason({ ...sig, confidence: 64 }, r60, st)).toBe("Confidence 64% below 65%");
  });
  it("80% may stack a second trade on the same symbol, never a third", () => {
    expect(skipReason(sig, rules, { ...st, openOnSymbol: 1, openTotal: 1, recentOnSymbol: true })).toBeNull();
    expect(skipReason(sig, { ...rules, max_open: 5 }, { ...st, openOnSymbol: 2, openTotal: 2 })).not.toBeNull();
  });
});

describe("unlimited daily trades", () => {
  const sig = { direction: "buy", confidence: 90, entry: 1, stop_loss: 0.9, take_profit: 1.2 };
  const st = { openTotal: 0, openOnSymbol: 0, todayCount: 50, recentOnSymbol: false, newsNearby: false, avoidNews: true };
  it("max_daily 0 never blocks on the daily count", () => {
    expect(skipReason(sig, { min_confidence: 60, max_open: 2, max_daily: 0 }, st)).toBeNull();
  });
  it("a positive max_daily still blocks", () => {
    expect(skipReason(sig, { min_confidence: 60, max_open: 2, max_daily: 10 }, st)).toBe("Daily limit of 10 trades reached");
  });
});
