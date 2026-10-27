/** Free demo $100 → $1,000,000 challenge: a paper-trading simulator (pure, tested). Never sends real orders. */
export const SIM_START = 100;
export const SIM_TARGET = 1_000_000;
export const STOP_OUT_LEVEL = 0.5; // liquidate when equity < 50% of used margin
export const MIN_LOT = 0.01;

export type Costs = { contract: number; spread: number; slippage: number; commissionPerLot: number };
export function costsFor(symbol: string): Costs {
  const s = symbol.toUpperCase();
  const a = ASSETS.find((x) => x.symbol === s);
  if (a) return { contract: a.contract, spread: a.spread, slippage: a.slippage, commissionPerLot: a.commissionPerLot };
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
export function pnl(t: SimTrade, exitPrice: number, c: Costs, conv = 1): number {
  const dir = t.side === "buy" ? 1 : -1;
  return (exitPrice - t.entry) * dir * t.lot * c.contract * conv - t.fees;
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

// ───────────── Multi-asset registry (contract specs used by the simulator) ─────────────
export type AssetClass = "metal" | "fx" | "crypto" | "index" | "energy";
export type AssetSpec = Costs & {
  symbol: string; yahoo: string; cls: AssetClass;
  quote: "USD" | "JPY" | "CHF" | "EUR" | "GBP"; // currency profit is paid in
  maxLeverage: number; minLot: number; swapPerLotNight: number; group: string; hours: "24/7" | "Mon-Fri";
};
const fx = (symbol: string, yahoo: string, spread: number, quote: AssetSpec["quote"], group: string): AssetSpec =>
  ({ symbol, yahoo, cls: "fx", contract: 100_000, spread, slippage: spread / 6, commissionPerLot: 7, quote, maxLeverage: 500, minLot: 0.01, swapPerLotNight: quote === "JPY" ? 800 : 6, group, hours: "Mon-Fri" });
/** Only instruments with a free reliable price feed (Yahoo chart API). DXY is excluded: it is an index, not a tradable contract. */
export const ASSETS: AssetSpec[] = [
  { symbol: "XAUUSD", yahoo: "GC=F", cls: "metal", contract: 100, spread: 0.3, slippage: 0.05, commissionPerLot: 7, quote: "USD", maxLeverage: 200, minLot: 0.01, swapPerLotNight: 30, group: "metals", hours: "Mon-Fri" },
  { symbol: "XAGUSD", yahoo: "SI=F", cls: "metal", contract: 5000, spread: 0.03, slippage: 0.005, commissionPerLot: 7, quote: "USD", maxLeverage: 100, minLot: 0.01, swapPerLotNight: 20, group: "metals", hours: "Mon-Fri" },
  fx("EURUSD", "EURUSD=X", 0.00012, "USD", "usd"), fx("GBPUSD", "GBPUSD=X", 0.00015, "USD", "usd"), fx("AUDUSD", "AUDUSD=X", 0.00014, "USD", "usd"),
  fx("USDCHF", "USDCHF=X", 0.00016, "CHF", "usd"), fx("USDJPY", "USDJPY=X", 0.014, "JPY", "jpy"),
  fx("EURJPY", "EURJPY=X", 0.02, "JPY", "jpy"), fx("GBPJPY", "GBPJPY=X", 0.03, "JPY", "jpy"), fx("AUDJPY", "AUDJPY=X", 0.025, "JPY", "jpy"), fx("CHFJPY", "CHFJPY=X", 0.03, "JPY", "jpy"),
  { symbol: "BTCUSD", yahoo: "BTC-USD", cls: "crypto", contract: 1, spread: 20, slippage: 5, commissionPerLot: 0, quote: "USD", maxLeverage: 20, minLot: 0.01, swapPerLotNight: 15, group: "crypto", hours: "24/7" },
  { symbol: "ETHUSD", yahoo: "ETH-USD", cls: "crypto", contract: 1, spread: 1.5, slippage: 0.4, commissionPerLot: 0, quote: "USD", maxLeverage: 20, minLot: 0.1, swapPerLotNight: 1, group: "crypto", hours: "24/7" },
  { symbol: "US30", yahoo: "^DJI", cls: "index", contract: 1, spread: 2.5, slippage: 0.5, commissionPerLot: 0, quote: "USD", maxLeverage: 100, minLot: 0.1, swapPerLotNight: 2.5, group: "indices", hours: "Mon-Fri" },
  { symbol: "USTEC", yahoo: "^NDX", cls: "index", contract: 1, spread: 1.5, slippage: 0.4, commissionPerLot: 0, quote: "USD", maxLeverage: 100, minLot: 0.1, swapPerLotNight: 1.5, group: "indices", hours: "Mon-Fri" },
  { symbol: "DE30", yahoo: "^GDAXI", cls: "index", contract: 1, spread: 1.5, slippage: 0.4, commissionPerLot: 0, quote: "EUR", maxLeverage: 100, minLot: 0.1, swapPerLotNight: 1.5, group: "indices", hours: "Mon-Fri" },
  { symbol: "UK100", yahoo: "^FTSE", cls: "index", contract: 1, spread: 1.2, slippage: 0.3, commissionPerLot: 0, quote: "GBP", maxLeverage: 100, minLot: 0.1, swapPerLotNight: 0.8, group: "indices", hours: "Mon-Fri" },
  { symbol: "USOIL", yahoo: "CL=F", cls: "energy", contract: 1000, spread: 0.04, slippage: 0.01, commissionPerLot: 0, quote: "USD", maxLeverage: 100, minLot: 0.01, swapPerLotNight: 8, group: "energy", hours: "Mon-Fri" },
];
export const EXCLUDED_ASSETS: Record<string, string> = { DXY: "Dollar index is a reference index, not a tradable contract" };
export const assetSpec = (symbol: string) => ASSETS.find((a) => a.symbol === symbol.toUpperCase()) ?? null;

/** USD value of 1 unit of the asset's profit currency. prices = latest mids by symbol. null when the rate is unknown. */
export function quoteToUsd(a: AssetSpec, prices: Record<string, number | undefined>, ownMid: number): number | null {
  if (a.quote === "USD") return 1;
  if (a.quote === "JPY") { const r = a.symbol === "USDJPY" ? ownMid : prices["USDJPY"]; return r ? 1 / r : null; }
  if (a.quote === "CHF") { const r = a.symbol === "USDCHF" ? ownMid : prices["USDCHF"]; return r ? 1 / r : null; }
  if (a.quote === "EUR") return prices["EURUSD"] ?? null;
  return prices["GBPUSD"] ?? null;
}

// ───────────── Agent 1 — deterministic multi-timeframe scanner ─────────────
export type Bar = { t: number; o: number; h: number; l: number; c: number };
export const SCAN_TFS = ["M5", "M15", "M30", "H1", "H4", "D1"] as const;
export type ScanTf = (typeof SCAN_TFS)[number];
export function group(bars: Bar[], n: number): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < bars.length; i += n) { const g = bars.slice(i, i + n); if (g.length === n) out.push({ t: g[0]!.t, o: g[0]!.o, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)), c: g[g.length - 1]!.c }); }
  return out;
}
function emaLast(v: number[], p: number): number | null {
  if (v.length < p) return null; const k = 2 / (p + 1); let e = v.slice(0, p).reduce((s, x) => s + x, 0) / p;
  for (let i = p; i < v.length; i++) e = v[i]! * k + e * (1 - k); return e;
}
export function atrOf(bars: Bar[], p = 14): number | null {
  if (bars.length < p + 1) return null; let s = 0;
  for (let i = bars.length - p; i < bars.length; i++) { const b = bars[i]!, pc = bars[i - 1]!.c; s += Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)); }
  return s / p;
}
export function rsiOf(c: number[], p = 14): number | null {
  if (c.length < p + 1) return null; let g = 0, l = 0;
  for (let i = c.length - p; i < c.length; i++) { const d = c[i]! - c[i - 1]!; if (d > 0) g += d; else l -= d; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
/** Trend of one timeframe: EMA20 vs EMA50 with price on the right side. */
export function trendOf(bars: Bar[]): "up" | "down" | "range" | null {
  if (bars.length < 55) return null;
  const c = bars.map((b) => b.c), e20 = emaLast(c, 20)!, e50 = emaLast(c, 50)!, last = c[c.length - 1]!;
  const gap = Math.abs(e20 - e50) / last;
  if (e20 > e50 && last > e50 && gap > 0.0003) return "up";
  if (e20 < e50 && last < e50 && gap > 0.0003) return "down";
  return "range";
}
export type ScanResult = {
  symbol: string; direction: "buy" | "sell" | null; score: number; tradeTf: "M15" | "H1"; trends: Partial<Record<ScanTf, string | null>>;
  atr: number | null; rsi: number | null; entry: number; stop: number | null; target: number | null; rr: number | null; costShare: number | null; reason: string;
};
/** Score 0..100 from timeframe agreement. H1+H4 must agree; D1 against blocks; M15/M30 pullback or alignment adds. */
export function scanAsset(symbol: string, mid: number, tf: Partial<Record<ScanTf, Bar[]>>, costs: Costs): ScanResult {
  const trends: ScanResult["trends"] = {};
  for (const k of SCAN_TFS) trends[k] = tf[k] ? trendOf(tf[k]!) : null;
  const base = { symbol, trends, entry: mid, stop: null, target: null, rr: null, costShare: null, tradeTf: "M15" as const };
  const h1 = trends.H1, h4 = trends.H4, d1 = trends.D1;
  const atrM15 = tf.M15 ? atrOf(tf.M15) : null, atrH1 = tf.H1 ? atrOf(tf.H1) : null;
  const rsi = tf.M15 ? rsiOf(tf.M15.map((b) => b.c)) : null;
  if (!h1 || !h4) return { ...base, direction: null, score: 0, atr: atrM15, rsi, reason: "Not enough H1/H4 history" };
  if (h1 !== h4 || h1 === "range") return { ...base, direction: null, score: 0, atr: atrM15, rsi, reason: `No higher-timeframe agreement (H1 ${h1}, H4 ${h4})` };
  const dir = h1 === "up" ? "buy" : "sell", want = h1;
  if (d1 && d1 !== "range" && d1 !== want) return { ...base, direction: null, score: 0, atr: atrM15, rsi, reason: `D1 trend (${d1}) against H1/H4` };
  let score = 50;
  if (d1 === want) score += 15;
  if (trends.M30 === want) score += 8;
  if (trends.M15 === want) score += 7; else if (trends.M15 && trends.M15 !== "range") score += 4; // small pullback inside the trend
  if (trends.M5 === want) score += 5;
  if (rsi != null) { if ((dir === "buy" && rsi > 75) || (dir === "sell" && rsi < 25)) score -= 20; else if (rsi > 40 && rsi < 60) score += 5; }
  const tradeTf: "M15" | "H1" = d1 === want && atrH1 ? "H1" : "M15";
  const a = tradeTf === "H1" ? atrH1 : atrM15;
  if (!a) return { ...base, direction: null, score: 0, atr: null, rsi, reason: "No volatility data" };
  const stopDist = a * 1.5, sgn = dir === "buy" ? 1 : -1;
  const stop = mid - sgn * stopDist, target = mid + sgn * stopDist * 2;
  const costShare = (costs.spread + costs.slippage * 2) / stopDist;
  if (costShare > 0.2) return { ...base, tradeTf, direction: null, score: 0, atr: a, rsi, stop, target, rr: 2, costShare, reason: `Costs are ${(costShare * 100).toFixed(0)}% of the stop` };
  score = Math.max(0, Math.min(100, score - costShare * 50));
  return { symbol, direction: dir, score: Math.round(score), tradeTf, trends, atr: a, rsi, entry: mid, stop, target, rr: 2, costShare, reason: `H1/H4 ${want}${d1 === want ? " + D1" : ""}, RSI ${rsi?.toFixed(0) ?? "n/a"}` };
}
export const SCAN_MIN_SCORE = 60;

// ───────────── Agent 3 — risk & execution supervisor (pure, final veto) ─────────────
export type Limits = { riskPct: number; maxTotalRiskPct: number; maxDailyLossPct: number; maxDrawdownPct: number; maxOpen: number };
export type OpenPos = { symbol: string; side: "buy" | "sell"; risk_usd: number; margin: number; opened_at: string };
export const LEVERAGE_STEPS = [5, 10, 20, 30, 50, 100, 200, 500];
/** Lowest leverage step that keeps this trade's margin within 25% of free margin; never the max just because it exists. */
export function chooseLeverage(notionalUsd: number, freeMargin: number, maxLev: number): number | null {
  for (const l of LEVERAGE_STEPS) if (l <= maxLev && notionalUsd / l <= freeMargin * 0.25) return l;
  return null;
}
export type Supervision = { allow: boolean; reason: string; lot?: number; leverage?: number; margin?: number; risk_usd?: number; riskPct?: number; entry?: number; fees?: number };
export function supervise(p: {
  spec: AssetSpec; side: "buy" | "sell"; mid: number; sl: number; tp: number; conv: number;
  equity: number; balance: number; peak: number; dayPnl: number; open: OpenPos[]; recentSameSignalMin: number | null; limits: Limits;
}): Supervision {
  const { spec, limits: L } = p;
  const dd = p.peak > 0 ? ((p.peak - p.equity) / p.peak) * 100 : 0;
  if (dd >= L.maxDrawdownPct) return { allow: false, reason: `Drawdown ${dd.toFixed(1)}% reached the ${L.maxDrawdownPct}% limit` };
  if (p.dayPnl <= -(p.balance * L.maxDailyLossPct) / 100) return { allow: false, reason: `Daily loss limit ${L.maxDailyLossPct}% reached` };
  if (p.open.length >= L.maxOpen) return { allow: false, reason: `Already ${p.open.length} open trades (max ${L.maxOpen})` };
  if (p.open.some((o) => o.symbol === spec.symbol)) return { allow: false, reason: `Already a trade open on ${spec.symbol}` };
  if (p.recentSameSignalMin != null && p.recentSameSignalMin < 60) return { allow: false, reason: `Same signal traded ${Math.round(p.recentSameSignalMin)} min ago` };
  const sameGroup = p.open.filter((o) => assetSpec(o.symbol)?.group === spec.group);
  if (sameGroup.length >= 2) return { allow: false, reason: `Too much exposure to correlated ${spec.group} assets` };
  if (sameGroup.some((o) => o.side !== p.side) && spec.group !== "usd" && spec.group !== "jpy") return { allow: false, reason: `Opposite position already open in ${spec.group}` };
  const entry = fillPrice(p.side, p.mid, spec);
  if (p.side === "buy" ? !(p.sl < entry && entry < p.tp) : !(p.tp < entry && entry < p.sl)) return { allow: false, reason: "Stop/target on the wrong side after costs" };
  const rr = Math.abs(p.tp - entry) / Math.abs(entry - p.sl);
  if (rr < 1.5) return { allow: false, reason: `Reward/risk ${rr.toFixed(2)} below 1.5 after costs` };
  // Near the limits, halve the risk; never increase risk to recover losses.
  const riskPct = dd >= L.maxDrawdownPct / 2 ? L.riskPct / 2 : L.riskPct;
  const openRisk = p.open.reduce((s, o) => s + o.risk_usd, 0);
  const budget = Math.min((p.equity * riskPct) / 100, (p.equity * L.maxTotalRiskPct) / 100 - openRisk);
  if (budget <= 0) return { allow: false, reason: `Total open risk already at ${L.maxTotalRiskPct}% of equity` };
  const riskPerLot = (Math.abs(entry - p.sl) * spec.contract + spec.slippage * spec.contract) * p.conv + spec.commissionPerLot;
  const step = spec.minLot;
  const lot = Math.round(Math.floor(budget / riskPerLot / step) * step * 1000) / 1000;
  if (lot < spec.minLot) return { allow: false, reason: `Minimum ${spec.minLot} lot would risk $${(riskPerLot * spec.minLot).toFixed(2)}, above the $${budget.toFixed(2)} budget` };
  const usedMargin = p.open.reduce((s, o) => s + o.margin, 0);
  const free = p.equity - usedMargin;
  const notional = lot * spec.contract * entry * p.conv;
  const leverage = chooseLeverage(notional, free, spec.maxLeverage);
  if (leverage == null) return { allow: false, reason: `Not enough free margin ($${free.toFixed(2)}) even at 1:${spec.maxLeverage}` };
  const risk_usd = riskPerLot * lot;
  return { allow: true, reason: `Approved · ${lot} lot · 1:${leverage} · risk $${risk_usd.toFixed(2)} (${((risk_usd / p.equity) * 100).toFixed(1)}%) · R/R ${rr.toFixed(2)}`, lot, leverage, margin: notional / leverage, risk_usd, riskPct, entry, fees: lot * spec.commissionPerLot };
}

/** Walk bars in time order; gaps through the stop fill at the bar open; stop wins when one bar touches both. */
export function exitOnBars(t: SimTrade, bars: Bar[]): { price: number; reason: "stop_loss" | "take_profit"; t: number } | null {
  const buy = t.side === "buy";
  for (const b of bars) {
    if (buy ? b.o <= t.stop_loss : b.o >= t.stop_loss) return { price: b.o, reason: "stop_loss", t: b.t };
    if (buy ? b.o >= t.take_profit : b.o <= t.take_profit) return { price: t.take_profit, reason: "take_profit", t: b.t };
    const h = exitHit(t, b.h, b.l);
    if (h) return { ...h, t: b.t };
  }
  return null;
}
/** Number of daily 21:00 UTC rollovers between two times (swap charged per night). */
export function rollovers(fromMs: number, toMs: number): number {
  let n = 0; const d = new Date(fromMs); d.setUTCHours(21, 0, 0, 0); if (d.getTime() <= fromMs) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getTime() <= toMs) { n++; d.setUTCDate(d.getUTCDate() + 1); }
  return n;
}
