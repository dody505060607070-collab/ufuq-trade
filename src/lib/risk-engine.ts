// Deterministic risk engine: the AI only proposes; these rules can veto any trade.
export type Proposal = { direction: string; confidence: number; entry: number | null; stop_loss: number | null; take_profit: number | null };
export type RiskContext = {
  price: number | null;          // current market price
  spreadPrice: number | null;    // spread in price units (ask - bid), null if unknown
  atr: number | null;            // ATR in price units, null if unknown
  balance: number | null;
  lot: number;
  dollarsPerPricePerLot: number; // e.g. 100 for XAUUSD (1 lot = 100 oz)
  dayPnl: number;                // realised P/L today
  maxDailyLossPct: number;       // e.g. 5 → stop trading after -5% of balance
  maxRiskPct: number;            // e.g. 5 → one trade may risk at most 5% of balance
  quoteAgeSec?: number | null;   // age of the broker quote; broker price is the execution reference
};

/** Broker quotes older than this block new entries (open positions keep their own protection). */
export const MAX_QUOTE_AGE_SEC = 120;

export type RiskVerdict = { allow: boolean; reason: string };

export function riskCheck(p: Proposal, c: RiskContext): RiskVerdict {
  if (p.direction !== "buy" && p.direction !== "sell") return { allow: false, reason: "No trade: AI is neutral" };
  const { entry, stop_loss: sl, take_profit: tp } = p;
  if (c.quoteAgeSec != null && c.quoteAgeSec > MAX_QUOTE_AGE_SEC) return { allow: false, reason: `Broker price is stale (${Math.round(c.quoteAgeSec)}s old)` };
  if (entry == null || sl == null || tp == null) return { allow: false, reason: "Missing entry, stop or target" };
  const buy = p.direction === "buy";
  if (buy ? !(sl < entry && entry < tp) : !(tp < entry && entry < sl)) return { allow: false, reason: "Stop/target on the wrong side of entry" };
  const stopDist = Math.abs(entry - sl);
  const rr = Math.abs(tp - entry) / stopDist;
  if (rr < 1.5) return { allow: false, reason: `Reward/risk ${rr.toFixed(2)} is below 1.5` };
  if (c.price != null && Math.abs(c.price - entry) > stopDist) return { allow: false, reason: "Entry is too far from the current price" };
  if (c.atr != null && c.atr > 0) {
    if (stopDist < c.atr * 0.3) return { allow: false, reason: "Stop is tighter than market noise (ATR)" };
    if (stopDist > c.atr * 6) return { allow: false, reason: "Stop is unrealistically wide (ATR)" };
  }
  if (c.spreadPrice != null && c.spreadPrice > stopDist * 0.25) return { allow: false, reason: "Spread is too high for this stop" };
  if (c.balance != null && c.balance > 0) {
    if (c.dayPnl <= -(c.balance * c.maxDailyLossPct) / 100) return { allow: false, reason: `Daily loss limit of ${c.maxDailyLossPct}% reached` };
    // Loss at the stop includes the spread paid on entry.
    const risk = (stopDist + (c.spreadPrice ?? 0)) * c.lot * c.dollarsPerPricePerLot;
    if (risk > (c.balance * c.maxRiskPct) / 100) return { allow: false, reason: `Trade risks $${risk.toFixed(2)}, more than ${c.maxRiskPct}% of balance` };
  }
  return { allow: true, reason: `Approved · R/R ${rr.toFixed(2)}` };
}

/** Dollars per 1.0 price move for 1 lot, using broker specs when known. */
export function dollarsPerPrice(symbol: string, tickValue?: number | null, point?: number | null): number {
  if (tickValue && point && point > 0) return tickValue / point;
  const s = symbol.toUpperCase();
  if (s.startsWith("XAU")) return 100;
  if (s.startsWith("XAG")) return 5000;
  if (s.includes("OIL") || s.startsWith("XTI")) return 1000;
  // Index CFDs (contract size 1): about $1 per point per lot (UK100 is quoted in GBP, DE30 in EUR).
  if (s.startsWith("UK100")) return 1.3;
  if (s.startsWith("DE30") || s.startsWith("DE40") || s.startsWith("GER")) return 1.1;
  if (/^(US30|US500|USTEC|NAS|SPX|JP225)/.test(s)) return 1;
  if (s.startsWith("BTC") || s.startsWith("ETH")) return 1;
  // JPY pairs: 100,000 units, priced ~150 yen → about $670 per 1.00 move.
  if (s.endsWith("JPY")) return 670;
  return 100000;
}

/** Rounds a price to the broker's tick (point); without one, keeps enough decimals for forex (5) or metals/indices (2-3). */
export function roundPrice(x: number, point?: number | null): number {
  if (point && point > 0) { const d = Math.max(0, Math.min(8, Math.round(-Math.log10(point)))); return Number(x.toFixed(d)); }
  const ax = Math.abs(x);
  return Number(x.toFixed(ax < 10 ? 5 : ax < 1000 ? 3 : 2));
}

// Market orders fill at the live price: move entry/SL/TP to it, keeping the AI's distances (same risk and RR).
export function reanchor<T extends Proposal>(p: T, price: number | null, point?: number | null): T {
  if (price == null || p.entry == null || p.stop_loss == null || p.take_profit == null) return p;
  const d = price - p.entry;
  const r = (x: number) => roundPrice(x, point);
  return { ...p, entry: r(price), stop_loss: r(p.stop_loss + d), take_profit: r(p.take_profit + d) };
}

/** The AI's price may be off from the broker by at most this share of the stop distance. */
export const MAX_PRICE_GAP_OF_STOP = 0.5;

/**
 * Real-money gate: a trade needs the broker's own live price for that market, and the price the AI
 * analysed must be close to it. Without it the stop, target and dollar risk are guesses
 * (e.g. a Dow trade analysed 195 points away from the broker price, on a 10x contract).
 */
export function brokerGate(p: Proposal, livePrice: number | null): string | null {
  if (p.direction !== "buy" && p.direction !== "sell") return null;
  if (livePrice == null) return "Waiting: no live broker price for this market yet (real trades use the broker's own price)";
  if (p.entry == null || p.stop_loss == null) return null;
  const stop = Math.abs(p.entry - p.stop_loss);
  if (stop > 0 && Math.abs(livePrice - p.entry) > stop * MAX_PRICE_GAP_OF_STOP) return "Waiting: the analysed price is too far from the broker price";
  return null;
}

/** Brokers raise orders below their minimum volume to that minimum, so risk is measured on the real volume. */
export function effectiveLot(lot: number, minLot?: number | null): number {
  return minLot && minLot > lot ? minLot : lot;
}
