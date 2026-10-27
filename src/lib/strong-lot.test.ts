import { describe, it, expect } from "vitest";
import { tradeLot } from "./autopilot";
describe("tradeLot", () => {
  it("doubles 0.02 to 0.04 at 85% confidence", () => expect(tradeLot(0.02, 85)).toBe(0.04));
  it("keeps 0.02 at 84%", () => expect(tradeLot(0.02, 84)).toBe(0.02));
});
