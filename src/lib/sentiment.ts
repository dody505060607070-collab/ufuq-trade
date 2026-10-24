// Pure keyword-based news sentiment for gold (XAUUSD). Positive score = bullish for gold.
const GOLD_UP = ["rate cut", "cuts rates", "dovish", "weaker dollar", "dollar falls", "dollar slips", "dollar drops", "safe haven", "safe-haven", "war", "conflict", "tension", "recession", "inflation rises", "hotter inflation", "yields fall", "yields drop", "gold rises", "gold climbs", "gold jumps", "record high", "central bank buying", "geopolitical", "uncertainty", "crisis", "sanctions", "jobless claims rise", "weak jobs"];
const GOLD_DOWN = ["rate hike", "hikes rates", "hawkish", "stronger dollar", "dollar rises", "dollar gains", "dollar jumps", "yields rise", "yields climb", "yields jump", "gold falls", "gold slips", "gold drops", "gold slides", "risk-on", "ceasefire", "strong jobs", "beats expectations", "cooling inflation", "inflation eases", "profit-taking", "sell-off in gold"];

export type Sentiment = { score: number; bullish: number; bearish: number; label: "bullish" | "bearish" | "mixed" | "none" };

export function newsSentiment(titles: string[]): Sentiment {
  let bullish = 0, bearish = 0;
  for (const raw of titles) {
    const t = raw.toLowerCase();
    if (GOLD_UP.some((k) => t.includes(k))) bullish++;
    if (GOLD_DOWN.some((k) => t.includes(k))) bearish++;
  }
  const total = bullish + bearish;
  const score = total ? Math.round(((bullish - bearish) / total) * 100) : 0;
  const label = total === 0 ? "none" : score >= 30 ? "bullish" : score <= -30 ? "bearish" : "mixed";
  return { score, bullish, bearish, label };
}

export function sentimentText(s: Sentiment): string {
  if (s.label === "none") return "No gold-relevant headlines detected.";
  return `Headline sentiment for gold: ${s.label.toUpperCase()} (score ${s.score} from -100 to +100; ${s.bullish} bullish vs ${s.bearish} bearish headlines). Use as a secondary filter only; do not trade against strongly opposing sentiment without clear technical confirmation.`;
}
