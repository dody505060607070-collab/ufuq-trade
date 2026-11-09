import { describe, it, expect } from "vitest";
import { providerOf, analysisKey, accountProvider, MIX_SLOT_MINUTES } from "./ai-provider";

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

describe("mixed account takes turns between Gemini and ChatGPT", () => {
  const slot = MIX_SLOT_MINUTES * 60_000;
  it("switches every 30 minutes", () => {
    expect(MIX_SLOT_MINUTES).toBe(30);
    expect(accountProvider("mixed", 0)).toBe("gemini");
    expect(accountProvider("mixed", slot)).toBe("openai");
    expect(accountProvider("mixed", 2 * slot)).toBe("gemini");
    expect(accountProvider("mixed", slot - 1)).toBe("gemini");
  });
  it("single-AI accounts never switch", () => {
    expect(accountProvider("gemini", slot)).toBe("gemini");
    expect(accountProvider("openai", 0)).toBe("openai");
  });
});
