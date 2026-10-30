import { describe, it, expect } from "vitest";
import { toArabic, firstSentence } from "./msg-ar";

describe("Arabic engine messages", () => {
  it("translates skip reasons and keeps numbers", () => {
    expect(toArabic("[ChatGPT] BUY 64% — Confidence 64% below 65%")).toBe("[ChatGPT] شراء 64% — الثقة 64% أقل من الحد 65%");
    expect(toArabic("Daily loss limit of 10% reached")).toBe("تم الوصول لحد الخسارة اليومي 10%");
    expect(toArabic("Trade risks $12.50, more than 5% of balance")).toBe("مخاطرة الصفقة $12.50، أكثر من 5% من الرصيد");
  });
  it("translates the lost-same-side lock", () => {
    expect(toArabic("Last sell on this symbol lost; same direction locked 120 min (needs 75%+)")).toBe("آخر بيع على هذا السوق خسر؛ نفس الاتجاه مقفول 120 دقيقة (يحتاج 75%+)");
  });
  it("keeps unknown text and handles empty", () => {
    expect(toArabic("XAUUSD")).toBe("XAUUSD");
    expect(toArabic(null)).toBe("");
  });
  it("first sentence", () => {
    expect(firstSentence("السعر صاعد. الهدف 4100.")).toBe("السعر صاعد.");
  });
});
