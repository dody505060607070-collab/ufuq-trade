import { describe, it, expect } from "vitest";
import { pickSlowPair, SLOW_MODE_MINUTES, DAILY_GEMINI_CALLS } from "./signal-guard";
import { OPENAI_MIN_CONFIDENCE } from "./ai-provider";
import { skipReason, MIN_CONFIDENCE_FLOOR } from "./autopilot";

describe("Gemini slow mode after the daily budget", () => {
  it("keeps analysing every 30 minutes instead of stopping", () => {
    expect(SLOW_MODE_MINUTES).toBe(30);
    expect(DAILY_GEMINI_CALLS).toBe(40);
  });
  it("analyses the symbol with the oldest Gemini analysis first", () => {
    const keys = ["XAUUSD|H1|gemini", "EURUSD|H1|gemini", "GBPUSD|H1|gemini"];
    expect(pickSlowPair(keys, { "XAUUSD|H1|gemini": 3000, "EURUSD|H1|gemini": 1000, "GBPUSD|H1|gemini": 2000 })).toBe("EURUSD|H1|gemini");
    expect(pickSlowPair(keys, { "XAUUSD|H1|gemini": 3000 })).toBe("EURUSD|H1|gemini");
  });
});

describe("ChatGPT account confidence", () => {
  const st = { openTotal: 0, openOnSymbol: 0, todayCount: 0, recentOnSymbol: false, newsNearby: false, avoidNews: true };
  const sig = { direction: "buy", confidence: 66, entry: 100, stop_loss: 99, take_profit: 102 };
  it("ChatGPT trades from 65% while the saved setting stays 70%", () => {
    expect(OPENAI_MIN_CONFIDENCE).toBe(65);
    expect(skipReason(sig, { min_confidence: Math.min(70, OPENAI_MIN_CONFIDENCE), max_open: 2, max_daily: 0 }, st)).toBeNull();
    expect(skipReason(sig, { min_confidence: 70, max_open: 2, max_daily: 0 }, st)).toMatch(/below 70%/);
  });
  it("never goes below the 65% hard floor", () => {
    expect(OPENAI_MIN_CONFIDENCE).toBeGreaterThanOrEqual(MIN_CONFIDENCE_FLOOR);
    expect(skipReason({ ...sig, confidence: 64 }, { min_confidence: OPENAI_MIN_CONFIDENCE, max_open: 2, max_daily: 0 }, st)).toMatch(/below 65%/);
  });
});
