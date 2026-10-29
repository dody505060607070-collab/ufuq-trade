import { describe, it, expect } from "vitest";
import { REAL_SECOND_CHECK, SINGLE_AI_CALL } from "./autopilot";

describe("AI credit saver", () => {
  it("real trades use one AI analysis (no second AI check)", () => { expect(REAL_SECOND_CHECK).toBe(false); });
  it("demo challenge uses one AI analysis (no debate)", () => { expect(SINGLE_AI_CALL).toBe(true); });
});
