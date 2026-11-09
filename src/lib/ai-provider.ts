// Which AI analyses a trading account's Auto-Pilot trades. Each account picks Gemini, ChatGPT, or "mixed" (takes turns); the default stays Gemini.
export type AiProvider = "gemini" | "openai";
export const AI_PROVIDERS: AiProvider[] = ["gemini", "openai"];
/** What an account can be set to: one AI, or "mixed" = Gemini and ChatGPT take turns. */
export type AiChoice = AiProvider | "mixed";
export const AI_CHOICES: AiChoice[] = ["gemini", "openai", "mixed"];
/** Default OpenAI model; OPENAI_MODEL env var overrides it once the key's model list is verified. */
export const OPENAI_MODEL = "gpt-6.1-terra"; // user-chosen (GPT-6.1 Terra); the ID exists on the key (401 scope, not 404)

/** Unknown / missing values fall back to Gemini so no account changes AI by accident. */
export function providerOf(v: unknown): AiProvider {
  return v === "openai" ? "openai" : "gemini";
}

/** A "mixed" account switches AI every this many minutes (same as the analysis cache, so each turn reuses one shared analysis). */
export const MIX_SLOT_MINUTES = 30;

/** The AI an account uses right now: "mixed" alternates Gemini → ChatGPT → Gemini… every MIX_SLOT_MINUTES; otherwise providerOf. */
export function accountProvider(v: unknown, nowMs: number): AiProvider {
  if (v !== "mixed") return providerOf(v);
  return Math.floor(nowMs / (MIX_SLOT_MINUTES * 60_000)) % 2 === 0 ? "gemini" : "openai";
}

/** Cache key of one shared analysis: same symbol + timeframe + AI. */
export function analysisKey(symbol: string, timeframe: string, provider: AiProvider): string {
  return `${symbol}|${timeframe}|${provider}`;
}

export function providerLabel(p: AiProvider): string {
  return p === "openai" ? "ChatGPT" : "Gemini";
}

export function choiceLabel(c: AiChoice): string {
  return c === "mixed" ? "Gemini + ChatGPT" : providerLabel(c);
}

/** ChatGPT rates the same setups ~5 points lower than Gemini, so ChatGPT accounts trade from this confidence (never below the 65% hard floor). User-approved 2026-10-30 for the $500 comparison account. */
export const OPENAI_MIN_CONFIDENCE = 65;
