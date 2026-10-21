import { describe, expect, it } from "vitest";
import { validateOrder } from "./trading";

const base = { side: "buy" as const, orderType: "market", lot: 0.01, count: 1, interval: 1, sl: null, tp: null, price: null, ref: 100 };

describe("validateOrder", () => {
  it("accepts a plain market buy", () => expect(validateOrder(base)).toBeNull());
  it("rejects a BUY stop loss above price", () => expect(validateOrder({ ...base, sl: 101 })).toMatch(/below/));
  it("rejects a SELL take profit above price", () => expect(validateOrder({ ...base, side: "sell", tp: 101 })).toMatch(/below/));
  it("rejects more than 50 trades", () => expect(validateOrder({ ...base, count: 51 })).toMatch(/1 to 50/));
  it("requires a price for pending orders", () => expect(validateOrder({ ...base, orderType: "buy_limit" })).toMatch(/price/));
});
