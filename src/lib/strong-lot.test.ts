import { describe, it, expect } from "vitest";
import { tradeLot } from "./autopilot";
describe("tradeLot", () => {
  it("keeps 0.02 at 85% confidence (lot doubling is off)", () => expect(tradeLot(0.02, 85)).toBe(0.02));
  it("keeps 0.02 at 84%", () => expect(tradeLot(0.02, 84)).toBe(0.02));
});
