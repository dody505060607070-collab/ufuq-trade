import { describe, it, expect } from "vitest";
import { parseSummary, rewardRisk } from "./analysis-view";

describe("analysis view", () => {
  it("separates the code block reason, the AI view and the sentences", () => {
    const p = parseSummary("No trade (Price data is stale (12 min old)). AI view: BUY 72%. Gold is rising. Target 4100.");
    expect(p.blocked).toBe("Price data is stale (12 min old)");
    expect(p.aiView).toBe("BUY 72%");
    expect(p.sentences).toEqual(["Gold is rising.", "Target 4100."]);
  });
  it("works for Arabic text", () => {
    const p = parseSummary("لا صفقة (بيانات السعر قديمة (منذ 12 دقيقة)). رأي الذكاء الاصطناعي: شراء 72%. الذهب صاعد. الهدف 4100.");
    expect(p.blocked).toBe("بيانات السعر قديمة (منذ 12 دقيقة)");
    expect(p.aiView).toBe("شراء 72%");
    expect(p.sentences.length).toBe(2);
  });
  it("reward/risk", () => {
    expect(rewardRisk(100, 99, 102)).toBe(2);
    expect(rewardRisk(100, null, 102)).toBeNull();
  });
});
