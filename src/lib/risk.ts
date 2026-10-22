/** Risk slider math. Gold (XAUUSD): 1.00 lot = 100 oz, so $1 move = $100 per lot. */
export const TYPICAL_GOLD_STOP = 20; // typical stop distance in $ of gold price
export const RISK_MIN = 0.5;
export const RISK_MAX = 5;
export const RISK_RECOMMENDED = 1.5;

export type RiskLevel = "low" | "balanced" | "high";

export function riskLevel(pct: number): RiskLevel {
  if (pct < 1) return "low";
  if (pct <= 2) return "balanced";
  return "high";
}

/** Lot size so that hitting a typical stop loses `pct`% of balance. Floor to 0.01, clamp 0.01–10. */
export function lotForRisk(balance: number, pct: number, stop = TYPICAL_GOLD_STOP): number {
  if (!(balance > 0)) return 0.01;
  const raw = (balance * pct) / 100 / (stop * 100);
  const lot = Math.floor(raw * 100 + 1e-9) / 100;
  return Math.min(10, Math.max(0.01, lot));
}

/** Dollars won/lost per $1 move of gold for a lot size. */
export const dollarsPerMove = (lot: number) => Math.round(lot * 100 * 100) / 100;

/** Inverse of lotForRisk: the risk % a saved lot represents, snapped to 0.25 and clamped to the slider range. */
export function riskForLot(balance: number, lot: number, stop = TYPICAL_GOLD_STOP): number {
  if (!(balance > 0) || !(lot > 0)) return RISK_RECOMMENDED;
  const pct = (lot * stop * 100 * 100) / balance;
  return Math.min(RISK_MAX, Math.max(RISK_MIN, Math.round(pct * 4) / 4));
}
