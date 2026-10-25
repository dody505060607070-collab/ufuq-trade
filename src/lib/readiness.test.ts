import { describe, expect, it } from "vitest";
import { readiness, firstBlocker, reconcile } from "./readiness";
import { sessionBlocked } from "./execution";
import { summarizeDeals } from "./deals";

const now = new Date("2026-10-21T12:00:00Z"); // Wednesday, market open
const seen = new Date(now.getTime() - 30_000).toISOString();
const acc = { id: "a", auto_trading: true, last_seen_at: seen, protocol_version: 2, margin_mode: "hedging", last_snapshot_at: seen };
const base = { enabled: true, shadow: false, symbols: ["XAUUSD"], accounts: [acc], quotes: [], brokerCandles: 100, now };

describe("why is Auto-Pilot not trading", () => {
  it("all ready → no blocker", () => expect(firstBlocker(readiness(base))).toBeNull());
  it("Auto-Pilot off is the main reason", () => expect(firstBlocker(readiness({ ...base, enabled: false }))?.key).toBe("enabled"));
  it("old EA (no protocol) blocks", () => expect(firstBlocker(readiness({ ...base, accounts: [{ ...acc, protocol_version: null }] }))?.key).toBe("ea"));
  it("weekend blocks gold", () => expect(firstBlocker(readiness({ ...base, now: new Date("2026-10-24T12:00:00Z"), accounts: [{ ...acc, last_seen_at: "2026-10-24T11:59:30Z" }] }))?.key).toBe("market"));
  it("missing broker candles is not a blocker (Yahoo fallback)", () => expect(firstBlocker(readiness({ ...base, brokerCandles: 0 }))).toBeNull());
});

describe("broker session", () => {
  it("fresh closed session blocks", () => expect(sessionBlocked({ trade_allowed: false, updated_at: now.toISOString() }, now.getTime())).toBe(true));
  it("unknown session never blocks", () => expect(sessionBlocked({ trade_allowed: null, updated_at: now.toISOString() }, now.getTime())).toBe(false));
  it("stale closed flag does not block", () => expect(sessionBlocked({ trade_allowed: false, updated_at: new Date(now.getTime() - 11 * 60_000).toISOString() }, now.getTime())).toBe(false));
});

describe("opening commission", () => {
  it("counts in realised profit but does not close the position", () => {
    const s = summarizeDeals([{ deal_ticket: "f", position_ticket: "P", volume: 0, price: null, profit: -3.5, closed_at: "2026-10-21T10:00:00Z" }]);
    expect(s.realized).toBe(-3.5);
    expect(s.lastAt).toBeNull();
  });
  it("profit after exit is net of the commission", () => {
    const s = summarizeDeals([{ deal_ticket: "f", position_ticket: "P", volume: 0, price: null, profit: -3.5, closed_at: "2026-10-21T10:00:00Z" }, { deal_ticket: "x", position_ticket: "P", volume: 0.02, price: 2010, profit: 20, closed_at: "2026-10-21T11:00:00Z" }]);
    expect(s.realized).toBe(16.5);
    expect(s.lastPrice).toBe(2010);
  });
});

describe("MT5 reconciliation", () => {
  const cmd = { id: "12345678-x", command: "open_trade", filled_count: 1, created_at: now.toISOString(), result: null };
  it("flags unknown orders", () => expect(reconcile({ account: acc, now, trades: [], commands: [{ ...cmd, status: "unknown" }] })).toHaveLength(1));
  it("flags open positions MT5 has not confirmed for 10 min", () => expect(reconcile({ account: { ...acc, last_snapshot_at: "2026-10-21T11:40:00Z", last_seen_at: "2026-10-21T11:40:00Z" }, now, commands: [], trades: [{ ticket: "1", status: "open", volume: 0.02, closed_volume: 0 }] })).toHaveLength(1));
  it("clean records → no issues", () => expect(reconcile({ account: acc, now, commands: [{ ...cmd, status: "done" }], trades: [{ ticket: "1", status: "closed", volume: 0.02, closed_volume: 0.02 }] })).toEqual([]));
});
