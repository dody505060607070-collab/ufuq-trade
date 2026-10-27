import { describe, expect, it } from "vitest";
import { gradePath, hindsightText } from "./hindsight";

describe("hindsight", () => {
  it("skipped sell 4029.7 / SL 4036.7 / TP 4017.2 that drops to 4015 counts as a target win", () => {
    expect(gradePath("sell", 4029.7, 4036.7, 4017.2, [{ t: 1, h: 4031, l: 4024 }, { t: 2, h: 4026, l: 4015 }]).outcome).toBe("tp_first");
  });
  it("a bar touching both stop and target counts as a stop", () => {
    expect(gradePath("buy", 100, 95, 110, [{ t: 1, h: 111, l: 94 }]).outcome).toBe("sl_first");
  });
  it("neither touched stays open", () => {
    expect(gradePath("buy", 100, 95, 110, [{ t: 1, h: 104, l: 97 }])).toEqual({ outcome: "open", move: 4 });
  });
  it("summarises skipped ideas per reason", () => {
    const t = hindsightText([
      { risk_verdict: "rejected", risk_reason: "Entry is too far", ai_confidence: 68, outcome: "tp_first" },
      { risk_verdict: "approved", risk_reason: "ok", ai_confidence: 62, outcome: "sl_first" },
    ]);
    expect(t).toContain("SKIPPED (Entry is too far): 1 would reach target first, 0 stop first");
    expect(t).toContain("TAKEN trades: 0 would reach target first, 1 stop first");
  });
});
