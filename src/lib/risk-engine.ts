// Deterministic risk engine: the AI only proposes; these rules can veto any trade.
// Rules are shared with the analysis guard (signal-guard.ts) so analysis, server and EA agree.
import { MIN_RR, STOP_ATR_MIN, STOP_ATR_MAX } from "./signal-guard";
import { lotProblem } from "./execution";

export type Proposal = { direction: string; confidence: number; entry: number | null; stop_loss: number | null; take_profit: number | null };
export type RiskContext = {
  price: number | null;          // current broker bid (never the signal entry)
  ask?: number | null;           // current broker ask; buy orders fill here
  priceAgeSec?: number | null;   // age of that price; null/undefined = unknown → rejected when requireFreshPrice
  spreadPrice: number | null;    // spread in price units (ask - bid), null if unknown
  atr: number | null;            // ATR in price units, null if unknown
  balance: number | null;
  lot: number;
  dollarsPerPricePerLot: number | null; // broker value of a 1.0 move per lot; null = unknown
  dayPnl: number;                // realised P/L today
  maxDailyLossPct: number;       // e.g. 5 → stop trading after -5% of balance
  maxRiskPct: number;            // e.g. 5 → one trade may risk at most 5% of balance
  requireFreshPrice?: boolean;   // automatic trading: demand a live broker price, specs and balance
  lotSpec?: { min?: number | null; max?: number | null; step?: number | null };
};

export const MAX_PRICE_AGE_SEC = 120;

export type RiskVerdict = { allow: boolean; reason: string; execPrice?: number | null; rr?: number; lossAtStop?: number | null };

const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** Expected market fill: ask for a buy, bid for a sell. Falls back to bid+spread when ask is missing. */
export function executionPrice(direction: string, c: Pick<RiskContext, "price" | "ask" | "spreadPrice">): number | null {
  if (c.price == null) return null;
  if (direction === "sell") return c.price;
  if (c.ask != null) return c.ask;
  return c.spreadPrice != null ? c.price + c.spreadPrice : c.price;
}

export function riskCheck(p: Proposal, c: RiskContext): RiskVerdict {
  if (p.direction !== "buy" && p.direction !== "sell") return { allow: false, reason: "No trade: AI is neutral" };
  const { entry, stop_loss: sl, take_profit: tp } = p;
  if (entry == null || sl == null || tp == null) return { allow: false, reason: "Missing entry, stop or target" };
  for (const v of [entry, sl, tp, c.lot, c.dayPnl, c.maxDailyLossPct, c.maxRiskPct]) if (!finite(v)) return { allow: false, reason: "Invalid number in signal or settings" };
  for (const v of [c.price, c.ask, c.spreadPrice, c.atr, c.balance, c.dollarsPerPricePerLot]) if (v != null && !finite(v)) return { allow: false, reason: "Invalid number in broker data" };
  if (entry <= 0 || sl <= 0 || tp <= 0 || c.lot <= 0 || (c.spreadPrice ?? 0) < 0) return { allow: false, reason: "Negative or zero values are not allowed" };
  if (c.requireFreshPrice) {
    if (c.price == null) return { allow: false, reason: "No current broker price" };
    if (c.priceAgeSec == null || !finite(c.priceAgeSec) || c.priceAgeSec < 0 || c.priceAgeSec > MAX_PRICE_AGE_SEC) return { allow: false, reason: "Broker price is stale" };
    if (c.spreadPrice == null) return { allow: false, reason: "Broker spread unknown" };
    if (c.dollarsPerPricePerLot == null) return { allow: false, reason: "Broker contract specs missing" };
    if (c.balance == null || c.balance <= 0) return { allow: false, reason: "Account balance unknown" };
  }
  if (c.lotSpec) { const lp = lotProblem(c.lot, c.lotSpec); if (lp) return { allow: false, reason: lp }; }
  const buy = p.direction === "buy";
  // Evaluate against the price the order will actually fill at; the signal entry is only a reference.
  const px = executionPrice(p.direction, c) ?? entry;
  if (buy ? !(sl < px && px < tp) : !(tp < px && px < sl)) return { allow: false, reason: "Price moved past stop or target", execPrice: px };
  const stopDist = Math.abs(px - sl);
  const rr = Math.abs(tp - px) / stopDist;
  if (rr < MIN_RR) return { allow: false, reason: `Reward/risk ${rr.toFixed(2)} at current price is below ${MIN_RR}`, execPrice: px, rr };
  const signalStop = Math.abs(entry - sl);
  if (c.price != null && Math.abs(px - entry) > signalStop * 0.5) return { allow: false, reason: "Price drifted too far from the signal entry", execPrice: px, rr };
  if (c.atr != null && c.atr > 0) {
    if (stopDist < c.atr * STOP_ATR_MIN) return { allow: false, reason: "Stop is tighter than market noise (ATR)", execPrice: px, rr };
    if (stopDist > c.atr * STOP_ATR_MAX) return { allow: false, reason: "Stop is unrealistically wide (ATR)", execPrice: px, rr };
  }
  if (c.spreadPrice != null && c.spreadPrice > stopDist * 0.25) return { allow: false, reason: "Spread is too high for this stop", execPrice: px, rr };
  let lossAtStop: number | null = null;
  if (c.balance != null && c.balance > 0) {
    if (c.dayPnl <= -(c.balance * c.maxDailyLossPct) / 100) return { allow: false, reason: `Daily loss limit of ${c.maxDailyLossPct}% reached`, execPrice: px, rr };
    // Loss at stop from the fill price; the closing side pays the spread again for buys (exit at bid).
    lossAtStop = stopDist * c.lot * (c.dollarsPerPricePerLot ?? dollarsPerPrice("XAUUSD"));
    if (lossAtStop > (c.balance * c.maxRiskPct) / 100) return { allow: false, reason: `Trade risks $${lossAtStop.toFixed(2)}, more than ${c.maxRiskPct}% of balance`, execPrice: px, rr, lossAtStop };
  }
  return { allow: true, reason: `Approved · R/R ${rr.toFixed(2)} at ${px}`, execPrice: px, rr, lossAtStop };
}

/** Broker value of a 1.0 move per lot, or null when the broker has not sent specs. */
export function brokerDollarsPerPrice(tickValue?: number | null, point?: number | null): number | null {
  return tickValue && point && point > 0 ? tickValue / point : null;
}

/** Dollars per 1.0 price move for 1 lot, using broker specs when known. */
export function dollarsPerPrice(symbol: string, tickValue?: number | null, point?: number | null): number {
  if (tickValue && point && point > 0) return tickValue / point;
  const s = symbol.toUpperCase();
  if (s.startsWith("XAU")) return 100;
  if (s.startsWith("XAG")) return 5000;
  if (s.includes("OIL") || s.startsWith("XTI")) return 1000;
  return 100000;
}
