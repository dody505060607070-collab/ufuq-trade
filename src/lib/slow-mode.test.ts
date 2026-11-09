import { describe, it, expect } from "vitest";
import { OPENAI_MIN_CONFIDENCE } from "./ai-provider";
import * as guard from "./signal-guard";
import { skipReason, MIN_CONFIDENCE_FLOOR } from "./autopilot";

describe("no daily AI budget", () => {
  it("the daily Gemini cap and slow mode are gone (user removed them 2026-11-09)", () => {
    expect("DAILY_GEMINI_CALLS" in guard).toBe(false);
    expect("SLOW_MODE_MINUTES" in guard).toBe(false);
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
