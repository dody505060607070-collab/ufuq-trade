import { describe, expect, it } from "vitest";
import { exitReview, lockReason, pauseReason } from "./profitlock";

const r = { profit_target_usd: 20, lock_start_usd: 10, giveback_pct: 40 };

describe("profit lock", () => {
  it("closes at the $20 target", () => expect(lockReason(20, 20, r)).not.toBeNull());
  it("keeps open below target with no peak", () => expect(lockReason(15, 15, r)).toBeNull());
  it("$25 peak locks by $18, not $10", () => {
    expect(lockReason(18, 25, r)).not.toBeNull();
    expect(lockReason(19, 25, r)).toBeNull();
  });
  it("does not lock a loss", () => expect(lockReason(-2, 25, r)).toBeNull());
  it("lets a strong trend run past $20", () => expect(lockReason(22, 22, r, true)).toBeNull());
  it("runner trails 15% from peak", () => expect(lockReason(84, 100, r, true)).not.toBeNull());
  it("rests 30 min after a close", () => expect(pauseReason(10, 30, 0, 0)).not.toBeNull());
  it("resumes after cooldown", () => expect(pauseReason(31, 30, 0, 0)).toBeNull());
  it("stops after daily goal", () => expect(pauseReason(null, 30, 50, 50)).not.toBeNull());
  it("closed $20 but price gave $80 more = early", () => expect(exitReview(20, 21, 80).verdict).toBe("early"));
  it("peak $25 closed $10 = late", () => expect(exitReview(10, 25, 0).verdict).toBe("late"));
});
