import { describe, it, expect } from "vitest";
import { providerOf, analysisKey } from "./ai-provider";

describe("per-account AI provider", () => {
  it("an account set to openai uses ChatGPT", () => { expect(providerOf("openai")).toBe("openai"); });
  it("missing or unknown provider stays Gemini", () => {
    expect(providerOf(null)).toBe("gemini");
    expect(providerOf(undefined)).toBe("gemini");
    expect(providerOf("claude")).toBe("gemini");
  });
  it("ChatGPT and Gemini analyses of the same symbol are kept apart", () => {
    expect(analysisKey("XAUUSD", "M15", "openai")).not.toBe(analysisKey("XAUUSD", "M15", "gemini"));
  });
});
