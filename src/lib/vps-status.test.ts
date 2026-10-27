import { describe, it, expect } from "vitest";
import { vpsStatus, parseReport, sanitize } from "./vps-status";

const now = Date.parse("2026-10-27T19:00:00Z");
describe("vps status", () => {
  it("nothing → Not configured", () => expect(vpsStatus({ reportOverall: null, lastSyncAt: null, now })).toBe("Not configured"));
  it("fresh sync without report is not Verified", () => expect(vpsStatus({ reportOverall: null, lastSyncAt: "2026-10-27T18:59:00Z", now })).toBe("Awaiting verification"));
  it("PASS report + fresh sync → Verified", () => expect(vpsStatus({ reportOverall: "PASS", lastSyncAt: "2026-10-27T18:58:00Z", now })).toBe("Verified"));
  it("PASS report + stale sync → Awaiting", () => expect(vpsStatus({ reportOverall: "PASS", lastSyncAt: "2026-10-27T18:40:00Z", now })).toBe("Awaiting verification"));
  it("FAIL report → Failed", () => expect(vpsStatus({ reportOverall: "FAIL", lastSyncAt: "2026-10-27T18:59:00Z", now })).toBe("Failed"));
  it("any failed check makes report FAIL", () => expect(parseReport(JSON.stringify({ checks: [{ name: "dns", result: "PASS" }, { name: "tls", result: "FAIL" }] })).overall).toBe("FAIL"));
  it("redacts keys", () => expect(sanitize("X-API-Key: abc e947448c-a11e-47b5-ac48-92e42a265d88")).not.toMatch(/e947448c|abc/));
});
