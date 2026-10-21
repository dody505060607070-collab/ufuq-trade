/** Pure Auto-Pilot rules: decides whether an analysis may open a trade. Returns a skip reason or null. */
export type AutoRules = { min_confidence: number; max_open: number; max_daily: number };
export type AutoState = { openTotal: number; openOnSymbol: number; todayCount: number; recentOnSymbol: boolean; newsNearby: boolean; avoidNews: boolean };
export type AutoSignal = { direction: string; confidence: number; entry: number | null; stop_loss: number | null; take_profit: number | null };

export function skipReason(sig: AutoSignal, rules: AutoRules, st: AutoState): string | null {
  if (sig.direction !== "buy" && sig.direction !== "sell") return "No clear direction";
  if (sig.stop_loss == null || sig.take_profit == null || sig.entry == null) return "Missing SL/TP levels";
  if (sig.confidence < rules.min_confidence) return `Confidence ${sig.confidence}% below ${rules.min_confidence}%`;
  if (st.avoidNews && st.newsNearby) return "High-impact news within 30 minutes";
  if (st.openOnSymbol > 0) return "A trade is already open on this symbol";
  if (st.recentOnSymbol) return "Already traded this symbol in the last hour";
  if (st.openTotal >= rules.max_open) return `Max ${rules.max_open} open trades reached`;
  if (st.todayCount >= rules.max_daily) return `Daily limit of ${rules.max_daily} trades reached`;
  return null;
}
