import { describe, it, expect } from "vitest";
import { lotForRisk, riskLevel, dollarsPerMove } from "./risk";

describe("risk slider", () => {
  it("3000$ at 2% risk with $20 stop = 0.03 lot", () => expect(lotForRisk(3000, 2)).toBe(0.03));
  it("never below 0.01 lot", () => expect(lotForRisk(500, 0.5)).toBe(0.01));
  it("1.5% is balanced (recommended zone)", () => expect(riskLevel(1.5)).toBe("balanced"));
  it("0.01 lot earns $1 per $1 gold move", () => expect(dollarsPerMove(0.01)).toBe(1));
});

import { riskForLot as _rfl } from "./risk";
describe("riskForLot", () => {
  it("2% on $3000 saved as 0.03 lot reads back as 2%", () => { expect(_rfl(3000, 0.03)).toBe(2); });
});
