// Which AI analyses a trading account's Auto-Pilot trades. Each account picks one; the default stays Gemini.
export type AiProvider = "gemini" | "openai";
export const AI_PROVIDERS: AiProvider[] = ["gemini", "openai"];
/** Default OpenAI model; OPENAI_MODEL env var overrides it once the key's model list is verified. */
export const OPENAI_MODEL = "gpt-6.1-terra"; // user-chosen (GPT-6.1 Terra); the ID exists on the key (401 scope, not 404)

/** Unknown / missing values fall back to Gemini so no account changes AI by accident. */
export function providerOf(v: unknown): AiProvider {
  return v === "openai" ? "openai" : "gemini";
}

/** Cache key of one shared analysis: same symbol + timeframe + AI. */
export function analysisKey(symbol: string, timeframe: string, provider: AiProvider): string {
  return `${symbol}|${timeframe}|${provider}`;
}

export function providerLabel(p: AiProvider): string {
  return p === "openai" ? "ChatGPT" : "Gemini";
}

/** ChatGPT rates the same setups ~5 points lower than Gemini, so ChatGPT accounts trade from this confidence (never below the 65% hard floor). User-approved 2026-10-30 for the $500 comparison account. */
export const OPENAI_MIN_CONFIDENCE = 65;
