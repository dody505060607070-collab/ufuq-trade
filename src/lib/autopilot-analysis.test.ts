import { describe, expect, it, vi } from "vitest";
import { SCAN_INTERVAL_MS, selectAutopilotAnalysis } from "./autopilot-analysis";

const signal = { direction: "neutral", confidence: 40, entry: null, stop_loss: null, take_profit: null };
describe("automated personal analysis", () => {
  it("checks every five minutes", () => expect(SCAN_INTERVAL_MS).toBe(300000));
  it("never reads or publishes another owner's personal signal", async () => {
    const io = { shared: vi.fn(async () => signal), cachedPersonal: vi.fn(async () => null), freshPersonal: vi.fn(async (owner: string) => ({ ...signal, owner })) };
    expect(await selectAutopilotAnalysis("owner-a", true, io)).toEqual({ ...signal, owner: "owner-a" });
    expect(io.cachedPersonal).toHaveBeenCalledWith("owner-a");
    expect(io.freshPersonal).toHaveBeenCalledWith("owner-a");
    expect(io.shared).not.toHaveBeenCalled();
  });
  it("uses only the requested owner's private cache", async () => {
    const fresh = vi.fn(async () => signal);
    await selectAutopilotAnalysis("owner-b", true, { shared: async () => signal, cachedPersonal: async (owner) => ({ ...signal, owner }), freshPersonal: fresh });
    expect(fresh).not.toHaveBeenCalled();
  });
});