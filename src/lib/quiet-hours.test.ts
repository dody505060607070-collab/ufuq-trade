import { describe, it, expect } from "vitest";
import { inQuietHours, skipReason } from "./autopilot";

const rules = { min_confidence: 65, max_open: 2, max_daily: 0 };
const st = { openTotal: 0, openOnSymbol: 0, todayCount: 0, recentOnSymbol: false, newsNearby: false, avoidNews: true };
const sig = { direction: "buy", confidence: 72, entry: 4055, stop_loss: 4042.7, take_profit: 4073.2 };

describe("thin market hours (21:00–02:00 UTC)", () => {
  it("blocks the losing 22:40 UTC buy from 29 Oct", () => expect(inQuietHours(new Date("2026-10-28T22:40:00Z"))).toBe(true));
  it("blocks 00:50 UTC (the 29 Oct sell)", () => expect(inQuietHours(new Date("2026-10-29T00:50:00Z"))).toBe(true));
  it("starts at 21:00 UTC", () => expect(inQuietHours(new Date("2026-10-28T21:00:00Z"))).toBe(true));
  it("ends at 02:00 UTC", () => expect(inQuietHours(new Date("2026-10-29T02:00:00Z"))).toBe(false));
  it("allows the London/NY hours that won", () => {
    expect(inQuietHours(new Date("2026-10-28T09:40:00Z"))).toBe(false);
    expect(inQuietHours(new Date("2026-10-28T20:00:00Z"))).toBe(false);
  });
  it("skipReason refuses a 72% trade in quiet hours", () => expect(skipReason(sig, rules, { ...st, quietHours: true })).toMatch(/Thin market hours/));
  it("the same trade passes outside quiet hours", () => expect(skipReason(sig, rules, { ...st, quietHours: false })).toBeNull());
});

describe("quiet window 22:00–01:00 UTC", () => {
  it("21:30 UTC is open for trading", () => expect(inQuietHours(new Date("2026-10-30T21:30:00Z"))).toBe(false));
  it("23:00 UTC is paused", () => expect(inQuietHours(new Date("2026-10-30T23:00:00Z"))).toBe(true));
  it("00:30 UTC is paused", () => expect(inQuietHours(new Date("2026-10-30T00:30:00Z"))).toBe(true));
  it("01:00 UTC is open again", () => expect(inQuietHours(new Date("2026-10-30T01:00:00Z"))).toBe(false));
});
