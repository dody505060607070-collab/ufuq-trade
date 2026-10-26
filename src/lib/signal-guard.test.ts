import { describe, expect, it } from "vitest";
import { dataBlockers, levelProblem } from "./signal-guard";

const now = 1_800_000_000;
const good = { direction: "buy", confidence: 70, entry: 2000, stop_loss: 1994, take_profit: 2010 }; // stop 6, rr 1.67

describe("signal guard", () => {
  it("weak signal is rejected", () => expect(levelProblem({ ...good, confidence: 50 }, 5)).toMatch(/Weak/));
  it("calendar outage alone does not block trading", () => expect(dataBlockers({ lastCandleT: now, timeframe: "H1", calendarOk: false, nowSec: now })).toEqual([]));
  it("empty calendar that loaded is fine", () => expect(dataBlockers({ lastCandleT: now - 60, timeframe: "H1", calendarOk: true, nowSec: now })).toEqual([]));
  it("stale prices block trading", () => expect(dataBlockers({ lastCandleT: now - 4 * 3600, timeframe: "H1", calendarOk: true, nowSec: now })[0]).toMatch(/stale/));
  it("missing prices block trading", () => expect(dataBlockers({ lastCandleT: null, timeframe: "M15", calendarOk: true, nowSec: now })).toContain("No price data"));
  it("valid levels pass", () => expect(levelProblem(good, 5)).toBeNull());
  it("wrong-side stop is rejected", () => expect(levelProblem({ ...good, stop_loss: 2004 }, 5)).toMatch(/wrong side/));
  it("reward/risk below 1.5 is rejected", () => expect(levelProblem({ ...good, take_profit: 2008 }, 5)).toMatch(/Reward/));
  it("stop inside noise is rejected", () => expect(levelProblem({ ...good, stop_loss: 1999, take_profit: 2005 }, 5)).toMatch(/noise/));
  it("stop too wide is rejected", () => expect(levelProblem({ ...good, stop_loss: 1980, take_profit: 2040 }, 5)).toMatch(/too wide/));
  it("neutral is always allowed", () => expect(levelProblem({ ...good, direction: "neutral" }, 5)).toBeNull());
});
