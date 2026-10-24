import { describe, expect, it } from "vitest";
import { summarizeDeals, positionStatus, fallbackDealId } from "./deals";

const d1 = { deal_ticket: "11", position_ticket: "P", volume: 0.01, price: 2010, profit: 10, closed_at: "2026-10-24T10:00:00Z" };
const d2 = { deal_ticket: "12", position_ticket: "P", volume: 0.01, price: 2020, profit: 20, closed_at: "2026-10-24T11:00:00Z" };

describe("deals vs positions", () => {
  it("partial close: realized profit and closed volume of the first half", () => {
    const s = summarizeDeals([d1]);
    expect(s.realized).toBe(10);
    expect(s.closedVolume).toBe(0.01);
  });
  it("partial close keeps the position open while the terminal still reports it", () => expect(positionStatus(true)).toBe("open"));
  it("position closes only when no longer reported", () => expect(positionStatus(false)).toBe("closed"));
  it("re-sync of the same deal is counted once", () => {
    const s = summarizeDeals([d1, d1, d2, d1]);
    expect(s.realized).toBe(30);
    expect(s.closedVolume).toBe(0.02);
    expect(s.lastPrice).toBe(2020);
  });
  it("fallback id is stable for the same deal", () => expect(fallbackDealId("P", "t", 0.01, 2010)).toBe(fallbackDealId("P", "t", 0.01, 2010)));
});
