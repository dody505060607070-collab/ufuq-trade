import { describe, expect, it } from "vitest";
import { alignToFill, assetSpec, fillPrice } from "@/lib/challenge";

const eur = assetSpec("EURUSD")!;
// The real rejected case from Oct 27: AI sell 1.11396, stop 1.1152, target 1.1121 (exactly 1.5 R:R).
const ai = { entry: 1.11396, stop_loss: 1.1152, take_profit: 1.1121 };

describe("demo challenge keeps the AI's reward/risk after the spread", () => {
  it("a 1.5 R:R plan stays 1.5 when measured from the fill price", () => {
    const mid = 1.1137;
    const p = alignToFill("sell", mid, eur, ai);
    const fill = fillPrice("sell", mid, eur);
    const rr = Math.abs(p.take_profit - fill) / Math.abs(fill - p.stop_loss);
    expect(rr).toBeCloseTo(1.5, 6);
  });
  it("a plan that is below 1.5 R:R stays below 1.5 (no trade is forced)", () => {
    const p = alignToFill("buy", 1.1, eur, { entry: 1.1, stop_loss: 1.099, take_profit: 1.1013 });
    const fill = fillPrice("buy", 1.1, eur);
    expect(Math.abs(p.take_profit - fill) / Math.abs(fill - p.stop_loss)).toBeCloseTo(1.3, 6);
  });
});
