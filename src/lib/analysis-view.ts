// Pure helpers to show an AI analysis clearly: code block reason, the AI's own view, its sentences, and reward/risk.

export type SummaryParts = { blocked: string | null; aiView: string | null; sentences: string[] };

/** Splits "No trade (reason). AI view: BUY 72%. sentence. sentence." (English or Arabic) into its parts. */
export function parseSummary(text: string | null | undefined): SummaryParts {
  let s = (text ?? "").trim();
  let blocked: string | null = null, aiView: string | null = null;
  const b = s.match(/^(?:No trade|لا صفقة) \((.*?)\)\.\s*/);
  if (b) { blocked = b[1] ?? null; s = s.slice(b[0].length); }
  const v = s.match(/^(?:AI view|رأي الذكاء الاصطناعي): ([^.]*\d+%)\.\s*/);
  if (v) { aiView = v[1] ?? null; s = s.slice(v[0].length); }
  const sentences = s.split(/(?<=[.!؟?])\s+(?=\S)/).map((x) => x.trim()).filter((x) => x.length > 1);
  return { blocked, aiView, sentences };
}

/** Reward/risk of a trade plan, or null when levels are missing. */
export function rewardRisk(entry: number | null, sl: number | null, tp: number | null): number | null {
  if (entry == null || sl == null || tp == null) return null;
  const risk = Math.abs(entry - sl);
  return risk > 0 ? Math.round((Math.abs(tp - entry) / risk) * 100) / 100 : null;
}
