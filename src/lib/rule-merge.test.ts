import { describe, it, expect } from "vitest";
import { consolidate, similarRule, ruleTheme } from "./brain";

describe("AI Brain rule merging", () => {
  it("merges reworded 'hold to target' lessons", () => {
    expect(similarRule("Never manually exit a trending trade before target without a confirmed structural reversal signal.",
      "Hold trending positions to planned target unless market structure explicitly breaks against you.")).toBe(true);
  });
  it("keeps different topics apart", () => {
    expect(similarRule("Move stop to breakeven or trail once momentum stalls.", "Place stops beyond structural swing levels with extra buffer.")).toBe(false);
  });
  it("Asian-session lessons are a session rule", () => expect(ruleTheme("Move stop-loss to breakeven once price moves favorably during Asian session chop.")).toBe("session"));
  it("three reworded lessons sum to 3 hits on the oldest rule", () => {
    const r = consolidate([
      { id: "a", rule: "Trail stops into profit once price approaches major swing targets.", hits: 1, status: "hypothesis", created_at: "2026-10-27" },
      { id: "b", rule: "Move stop to breakeven or trail once momentum stalls.", hits: 1, status: "hypothesis", created_at: "2026-10-28" },
      { id: "c", rule: "Trail stops tightly once price enters target support zones.", hits: 1, status: "hypothesis", created_at: "2026-10-29" },
      { id: "d", rule: "Place stops beyond structural swing levels with extra buffer.", hits: 1, status: "hypothesis", created_at: "2026-10-29" },
    ]);
    expect(r.keep).toEqual([{ id: "a", hits: 3 }]);
    expect(r.drop.sort()).toEqual(["b", "c"]);
  });
});
