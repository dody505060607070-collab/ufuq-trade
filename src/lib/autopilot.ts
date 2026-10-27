/** Pure Auto-Pilot rules: decides whether an analysis may open a trade. Returns a skip reason or null. */
export type AutoRules = { min_confidence: number; max_open: number; max_daily: number };
export type AutoState = { openTotal: number; openOnSymbol: number; todayCount: number; recentOnSymbol: boolean; newsNearby: boolean; avoidNews: boolean };
export type AutoSignal = { direction: string; confidence: number; entry: number | null; stop_loss: number | null; take_profit: number | null };

/** Hard floor: no Auto-Pilot trade below this confidence, whatever the saved setting. */
export const MIN_CONFIDENCE_FLOOR = 65;
/** At or above this confidence a second trade may stack on the same symbol (still capped by max_open). */
export const STACK_CONFIDENCE = 75;
export const MAX_PER_SYMBOL = 2;

export function skipReason(sig: AutoSignal, rules: AutoRules, st: AutoState): string | null {
  if (sig.direction !== "buy" && sig.direction !== "sell") return "No clear direction";
  if (sig.stop_loss == null || sig.take_profit == null || sig.entry == null) return "Missing SL/TP levels";
  const min = Math.max(MIN_CONFIDENCE_FLOOR, rules.min_confidence);
  if (sig.confidence < min) return `Confidence ${sig.confidence}% below ${min}%`;
  const strong = sig.confidence >= STACK_CONFIDENCE;
  if (st.avoidNews && st.newsNearby) return "High-impact news within 30 minutes";
  if (st.openOnSymbol >= MAX_PER_SYMBOL) return `Already ${MAX_PER_SYMBOL} trades open on this symbol`;
  if (st.openOnSymbol > 0 && !strong) return `A trade is already open on this symbol (a second needs ${STACK_CONFIDENCE}%+)`;
  if (st.recentOnSymbol && !strong) return `Already traded this symbol in the last hour (repeat needs ${STACK_CONFIDENCE}%+)`;
  if (st.openTotal >= rules.max_open) return `Max ${rules.max_open} open trades reached`;
  if (rules.max_daily > 0 && st.todayCount >= rules.max_daily) return `Daily limit of ${rules.max_daily} trades reached`;
  return null;
}

/** Confidence at which a trade uses a bigger size, and how much bigger. */
export const STRONG_CONFIDENCE = 85;
export const STRONG_LOT_MULT = 2;
export function tradeLot(baseLot: number, confidence: number): number {
  const lot = confidence >= STRONG_CONFIDENCE ? baseLot * STRONG_LOT_MULT : baseLot;
  return Math.round(lot * 100) / 100;
}
