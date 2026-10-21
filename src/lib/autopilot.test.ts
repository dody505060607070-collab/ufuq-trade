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
});
