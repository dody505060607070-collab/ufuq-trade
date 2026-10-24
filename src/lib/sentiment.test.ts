import { describe, expect, it } from "vitest";
import { newsSentiment } from "./sentiment";

describe("news sentiment", () => {
  it("dovish Fed headlines are bullish for gold", () => expect(newsSentiment(["Fed signals rate cut", "Dollar falls on weak jobs"]).label).toBe("bullish"));
  it("hawkish headlines are bearish for gold", () => expect(newsSentiment(["Fed turns hawkish", "Treasury yields rise"]).label).toBe("bearish"));
  it("unrelated headlines give no signal", () => expect(newsSentiment(["Apple launches new phone"]).label).toBe("none"));
  it("balanced headlines are mixed", () => expect(newsSentiment(["Gold rises", "Gold falls"]).score).toBe(0));
});
