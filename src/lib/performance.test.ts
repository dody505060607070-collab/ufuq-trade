import { describe, expect, it } from "vitest";
import { periodStats } from "./performance";

const now = new Date("2026-10-21T15:00:00");
const rows = [
  { closed_at: "2026-10-21T10:00:00", profit: 50 },
  { closed_at: "2026-10-20T10:00:00", profit: -20 },
  { closed_at: "2026-10-10T10:00:00", profit: 30 },
  { closed_at: "2026-08-01T10:00:00", profit: 100 },
];

describe("periodStats", () => {
  it("today counts only today's trades", () => expect(periodStats(rows, "today", now).net).toBe(50));
  it("yesterday counts only yesterday", () => expect(periodStats(rows, "yesterday", now).net).toBe(-20));
  it("last 30 days excludes older trades", () => expect(periodStats(rows, "30d", now).count).toBe(3));
  it("all time win rate is 75%", () => expect(periodStats(rows, "all", now).winRate).toBe(75));
});
