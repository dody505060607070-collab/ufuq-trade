/** Pure Auto-Pilot rules: decides whether an analysis may open a trade. Returns a skip reason or null. */
export type AutoRules = { min_confidence: number; max_open: number; max_daily: number };
export type AutoState = { openTotal: number; openOnSymbol: number; todayCount: number; recentOnSymbol: boolean; newsNearby: boolean; avoidNews: boolean; lostSameSide?: boolean };
export type AutoSignal = { direction: string; confidence: number; entry: number | null; stop_loss: number | null; take_profit: number | null };

/** Hard floor: no Auto-Pilot trade below this confidence, whatever the saved setting. */
export const MIN_CONFIDENCE_FLOOR = 65;
/** At or above this confidence a second trade may stack on the same symbol (still capped by max_open). */
export const STACK_CONFIDENCE = 75;
export const MAX_PER_SYMBOL = 2;
/** After a losing trade, the same direction on that symbol is locked this long unless confidence >= STACK_CONFIDENCE. */
export const LOSS_LOCK_MINUTES = 120;

/** Human reason for a neutral analysis: the code block reason when one applied, else the AI's first sentence. */
export function neutralReason(summary: string | null | undefined): string {
  const s = (summary ?? "").trim();
  const blocked = s.match(/^No trade \(([^)]*)\)\. AI view: (\w+ \d+%)/);
  if (blocked) return `AI saw ${blocked[2]} but blocked: ${blocked[1]}`;
  const first = s.split(/(?<=\.)\s/)[0]?.slice(0, 160);
  return first ? `Waiting: ${first}` : "Waiting for a setup";
}

export function skipReason(sig: AutoSignal & { summary?: string | null }, rules: AutoRules, st: AutoState): string | null {
  if (sig.direction !== "buy" && sig.direction !== "sell") return neutralReason(sig.summary);
  if (sig.stop_loss == null || sig.take_profit == null || sig.entry == null) return "Missing SL/TP levels";
  const min = Math.max(MIN_CONFIDENCE_FLOOR, rules.min_confidence);
  if (sig.confidence < min) return `Confidence ${sig.confidence}% below ${min}%`;
  const strong = sig.confidence >= STACK_CONFIDENCE;
  if (st.lostSameSide && !strong) return `Last ${sig.direction} on this symbol lost; same direction locked ${LOSS_LOCK_MINUTES} min (needs ${STACK_CONFIDENCE}%+)`;
  if (st.avoidNews && st.newsNearby) return "High-impact news within 30 minutes";
  if (st.openOnSymbol >= MAX_PER_SYMBOL) return `Already ${MAX_PER_SYMBOL} trades open on this symbol`;
  if (st.openOnSymbol > 0 && !strong) return `A trade is already open on this symbol (a second needs ${STACK_CONFIDENCE}%+)`;
  if (st.recentOnSymbol && !strong) return `Same setup already traded in the last ${REPEAT_WINDOW_MINUTES} min (repeat needs ${STACK_CONFIDENCE}%+)`;
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

/** Credit saver for the demo challenge: one AI analysis per decision (no debate). Code risk checks still veto. */
export const SINGLE_AI_CALL = true;
/** Real-account trades get an independent second Gemini check before the order is queued (only approved trades, so few calls). */
export const REAL_SECOND_CHECK = true;

/** Thin-liquidity window (UTC hours, start inclusive → end exclusive): daily broker break + early Asian session.
 *  On the live account every Auto-Pilot trade opened here lost (5/5, -$91) while the rest won 9/10. */
export const QUIET_START_UTC = 21;
export const QUIET_END_UTC = 2;
export function inQuietHours(d: Date): boolean {
  const h = d.getUTCHours();
  return QUIET_START_UTC > QUIET_END_UTC ? h >= QUIET_START_UTC || h < QUIET_END_UTC : h >= QUIET_START_UTC && h < QUIET_END_UTC;
}
export const QUIET_REASON = `Thin market hours (${QUIET_START_UTC}:00–0${QUIET_END_UTC}:00 UTC): no new trades — every past trade opened here lost`;

/** A repeat on the same symbol is blocked only if it is the SAME setup: same side, within this window, stop within half a stop-distance. */
export const REPEAT_WINDOW_MINUTES = 30;
export type RecentOrder = { side: string; sl: number | null; ageMin: number };
export function isSameSetup(recent: RecentOrder[], sig: { direction: string; entry: number | null; stop_loss: number | null }): boolean {
  if (sig.entry == null || sig.stop_loss == null) return recent.some((o) => o.ageMin < REPEAT_WINDOW_MINUTES);
  const half = Math.abs(sig.entry - sig.stop_loss) / 2;
  return recent.some((o) => o.ageMin < REPEAT_WINDOW_MINUTES && o.side === sig.direction && (o.sl == null || Math.abs(o.sl - sig.stop_loss!) <= half));
}
