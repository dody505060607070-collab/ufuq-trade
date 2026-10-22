import { describe, expect, it } from "vitest";
import { lockReason, pauseReason } from "./profitlock";

const r = { profit_target_usd: 20, lock_start_usd: 10, giveback_pct: 40 };

describe("profit lock", () => {
  it("closes at the $20 target", () => expect(lockReason(20, 20, r)).not.toBeNull());
  it("keeps open below target with no peak", () => expect(lockReason(15, 15, r)).toBeNull());
  it("locks when $25 peak falls back 40%", () => expect(lockReason(15, 25, r)).not.toBeNull());
  it("does not lock a loss", () => expect(lockReason(-2, 25, r)).toBeNull());
  it("rests 30 min after a close", () => expect(pauseReason(10, 30, 0, 0)).not.toBeNull());
  it("resumes after cooldown", () => expect(pauseReason(31, 30, 0, 0)).toBeNull());
  it("stops after daily goal", () => expect(pauseReason(null, 30, 50, 50)).not.toBeNull());
});
