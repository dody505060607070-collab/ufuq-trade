import { describe, expect, it } from "vitest";
import { sanitizeLevels } from "./levels";

describe("sanitizeLevels", () => {
  it("keeps valid buy levels", () => {
    expect(sanitizeLevels({ direction: "buy", entry: 100, stop_loss: 95, take_profit: 110 })).toEqual({ direction: "buy", entry: 100, stop_loss: 95, take_profit: 110 });
  });
  it("drops a buy stop loss above entry", () => {
    expect(sanitizeLevels({ direction: "buy", entry: 100, stop_loss: 105, take_profit: 110 }).stop_loss).toBeNull();
  });
  it("drops a sell take profit above entry", () => {
    expect(sanitizeLevels({ direction: "sell", entry: 100, stop_loss: 105, take_profit: 101 }).take_profit).toBeNull();
  });
  it("clears all levels on neutral", () => {
    expect(sanitizeLevels({ direction: "neutral", entry: 100, stop_loss: 95, take_profit: 110 })).toEqual({ direction: "neutral", entry: null, stop_loss: null, take_profit: null });
  });
});
