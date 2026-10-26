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
  it("no duplicate on same symbol", () => expect(skipReason(sig, rules, { ...st, openOnSymbol: 1 })).not.toBeNull());
  it("accepts exactly 60% confidence when all other rules pass", () => expect(skipReason({ ...sig, confidence: 60 }, { ...rules, min_confidence: 60 }, st)).toBeNull());
  it("rejects confidence below 60%", () => expect(skipReason({ ...sig, confidence: 59 }, { ...rules, min_confidence: 60 }, st)).toBe("Confidence 59% below 60%"));
  it("allows another instrument while one position is open within the account limit", () => expect(skipReason(sig, rules, { ...st, openTotal: 1, openOnSymbol: 0 })).toBeNull());
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
