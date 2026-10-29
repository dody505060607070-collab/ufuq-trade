import { describe, it, expect } from "vitest";
import { blockingEvent, eventBlocks } from "./news-guard";

const now = Date.parse("2026-10-28T14:20:00Z");
const ev = (title: string, impact: string, country = "USD", min = 10) => ({ title, impact, country, date: new Date(now + min * 60_000).toISOString() });

describe("news guard", () => {
  it("blocks oil 10 min before a medium-impact Crude Oil Inventories report", () => {
    expect(blockingEvent("USOIL", [ev("Crude Oil Inventories", "Medium")], now)?.title).toBe("Crude Oil Inventories");
  });
  it("blocks oil around OPEC meetings even without a USD country tag", () => {
    expect(eventBlocks("USOILm", ev("OPEC-JMMC Meetings", "Medium", "ALL"))).toBe(true);
  });
  it("does not block gold or EURUSD on a medium oil report", () => {
    expect(blockingEvent("XAUUSD", [ev("Crude Oil Inventories", "Medium")], now)).toBeNull();
    expect(blockingEvent("EURUSD", [ev("Crude Oil Inventories", "Medium")], now)).toBeNull();
  });
  it("still blocks gold on high-impact USD news within 30 minutes, not after 31", () => {
    expect(blockingEvent("XAUUSDm", [ev("Non-Farm Employment Change", "High", "USD", 20)], now)).not.toBeNull();
    expect(blockingEvent("XAUUSDm", [ev("Non-Farm Employment Change", "High", "USD", 31)], now)).toBeNull();
  });
});
