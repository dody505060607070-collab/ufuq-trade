/** Free demo $100 → $1,000,000 challenge: a paper-trading simulator (pure, tested). Never sends real orders. */
export const SIM_START = 100;
export const SIM_TARGET = 1_000_000;
export const STOP_OUT_LEVEL = 0.5; // liquidate when equity < 50% of used margin
export const MIN_LOT = 0.01;

export type Costs = { contract: number; spread: number; slippage: number; commissionPerLot: number };
export function costsFor(symbol: string): Costs {
  const s = symbol.toUpperCase();
  if (s.startsWith("XAU")) return { contract: 100, spread: 0.3, slippage: 0.05, commissionPerLot: 7 };
  return { contract: 100_000, spread: 0.00012, slippage: 0.00002, commissionPerLot: 7 };
}

export type SimTrade = { side: "buy" | "sell"; lot: number; entry: number; stop_loss: number; take_profit: number; margin: number; fees: number };

/** Fill price for a market order around a mid price (half spread + slippage against you). */
export function fillPrice(side: "buy" | "sell", mid: number, c: Costs, closing = false): number {
  const adverse = c.spread / 2 + c.slippage;
  const buying = closing ? side === "sell" : side === "buy";
  return buying ? mid + adverse : mid - adverse;
}

/** Size a new paper trade so the loss at the stop is <= riskPct of equity and margin fits. null = too small to trade. */
export function openSim(p: { side: "buy" | "sell"; mid: number; sl: number; tp: number; equity: number; freeMargin: number; riskPct: number; leverage: number; costs: Costs }): SimTrade | { error: string } {
  const entry = fillPrice(p.side, p.mid, p.costs);
  const stopDist = Math.abs(entry - p.sl);
  if (p.side === "buy" ? !(p.sl < entry && entry < p.tp) : !(p.tp < entry && entry < p.sl)) return { error: "Stop/target on the wrong side after costs" };
  const riskPerLot = stopDist * p.costs.contract + p.costs.commissionPerLot;
  let lot = Math.floor(((p.equity * p.riskPct) / 100 / riskPerLot) / MIN_LOT) * MIN_LOT;
  const marginPerLot = (p.costs.contract * entry) / p.leverage;
  lot = Math.min(lot, Math.floor((p.freeMargin * 0.9) / marginPerLot / MIN_LOT) * MIN_LOT);
  lot = Math.round(lot * 100) / 100;
  if (lot < MIN_LOT) return { error: `Balance too small: min lot would risk more than ${p.riskPct}% or exceed margin` };
  return { side: p.side, lot, entry, stop_loss: p.sl, take_profit: p.tp, margin: lot * marginPerLot, fees: lot * p.costs.commissionPerLot };
}

/** Profit of a position closed at exitPrice (fill already includes costs), minus commission. */
export function pnl(t: SimTrade, exitPrice: number, c: Costs): number {
  const dir = t.side === "buy" ? 1 : -1;
  return (exitPrice - t.entry) * dir * t.lot * c.contract - t.fees;
}

/** Did the bar range hit stop or target? Stop wins when both were touched (conservative). */
export function exitHit(t: SimTrade, high: number, low: number): { price: number; reason: "stop_loss" | "take_profit" } | null {
  const buy = t.side === "buy";
  const sl = buy ? low <= t.stop_loss : high >= t.stop_loss;
  const tp = buy ? high >= t.take_profit : low <= t.take_profit;
  if (sl) return { price: t.stop_loss, reason: "stop_loss" };
  if (tp) return { price: t.take_profit, reason: "take_profit" };
  return null;
}

/** Margin call: equity below STOP_OUT_LEVEL of used margin, or nothing left. */
export function liquidated(equity: number, usedMargin: number): boolean {
  return equity <= 0 || (usedMargin > 0 && equity < usedMargin * STOP_OUT_LEVEL);
}

/** Progress from start to target on a log scale (each doubling counts equally), 0..100. */
export function challengeProgress(start: number, current: number, target: number): number {
  if (start <= 0 || current <= 0 || target <= start) return 0;
  return Math.max(0, Math.min(100, (Math.log(current / start) / Math.log(target / start)) * 100));
}

export function drawdownPct(peak: number, current: number): number {
  return peak > 0 ? Math.max(0, ((peak - current) / peak) * 100) : 0;
}
