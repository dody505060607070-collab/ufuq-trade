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
