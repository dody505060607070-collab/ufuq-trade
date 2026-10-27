import { describe, it, expect } from "vitest";
import { challengeGate, challengeProgress, drawdownPct } from "./challenge";

const base = { status: "running", start_balance: 50, target_balance: 1_000_000, peak_balance: 50, floor_balance: 10 };

describe("challenge", () => {
  it("allows trading while running above the floor", () => expect(challengeGate(base, 60).trade).toBe(true));
  it("does not trade when paused", () => expect(challengeGate({ ...base, status: "paused" }, 60).trade).toBe(false));
  it("does not trade when equity unknown", () => expect(challengeGate(base, null).trade).toBe(false));
  it("fails and closes all at the floor", () => {
    const g = challengeGate(base, 10);
    expect(g.trade).toBe(false);
    if (!g.trade) { expect(g.end).toBe("failed"); expect(g.closeAll).toBe(true); }
  });
  it("completes at the target", () => { const g = challengeGate(base, 1_000_000); expect(!g.trade && g.end).toBe("completed"); });
  it("tracks the peak", () => expect(challengeGate(base, 80).peak).toBe(80));
  it("progress is log scale", () => { expect(challengeProgress(50, 50, 1e6)).toBe(0); expect(challengeProgress(50, 1e6, 1e6)).toBe(100); expect(challengeProgress(50, 100, 1e6)).toBeCloseTo(7.0, 0); });
  it("drawdown", () => expect(drawdownPct(100, 75)).toBe(25));
});
