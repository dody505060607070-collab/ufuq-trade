import { describe, expect, it } from "vitest";
import { oauthReturnPath } from "./oauth-return-path";
import { DEFAULT_TRADE_LOT, validAutopilotLot } from "./lot-settings";

describe("private assistant return paths", () => {
  it("preserves consent requests", () => {
    expect(oauthReturnPath("/.lovable/oauth/consent?authorization_id=abc#confirm")).toBe("/.lovable/oauth/consent?authorization_id=abc#confirm");
  });
  it("rejects external and ambiguous paths", () => {
    for (const path of ["https://outside.invalid", "//outside.invalid", "/\\outside.invalid", "/\nadmin", "/%2f%2foutside.invalid/../..//outside.invalid"]) {
      expect(oauthReturnPath(path)).toBe("/");
    }
  });
});
it("defaults to the requested 0.02 lot", () => {
  expect(DEFAULT_TRADE_LOT).toBe(0.02);
  expect(validAutopilotLot(DEFAULT_TRADE_LOT)).toBe(true);
  expect(validAutopilotLot(NaN)).toBe(false);
  expect(validAutopilotLot(0)).toBe(false);
});