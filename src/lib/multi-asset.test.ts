import { describe, it, expect } from "vitest";
import { ASSETS, EXCLUDED_ASSETS, assetSpec, chooseLeverage, exitOnBars, quoteToUsd, rollovers, scanAsset, supervise, pnl, type Bar, type Limits } from "./challenge";

const L: Limits = { riskPct: 2, maxTotalRiskPct: 6, maxDailyLossPct: 8, maxDrawdownPct: 35, maxOpen: 4 };
const gold = assetSpec("XAUUSD")!;
const base = { spec: gold, side: "buy" as const, mid: 4000, sl: 3980, tp: 4050, conv: 1, equity: 10_000, balance: 10_000, peak: 10_000, dayPnl: 0, open: [], recentSameSignalMin: null, limits: L };
const trend = (n: number, step: number, start = 100): Bar[] => Array.from({ length: n }, (_, i) => { const c = start + i * step; return { t: i * 60, o: c - step / 2, h: c + Math.abs(step), l: c - Math.abs(step), c }; });

describe("multi-asset demo challenge", () => {
  it("covers metals, forex, crypto, indices and oil, and excludes DXY", () => {
    const cls = new Set(ASSETS.map((a) => a.cls));
    expect([...cls].sort()).toEqual(["crypto", "energy", "fx", "index", "metal"]);
    expect(assetSpec("XAGUSD")?.contract).toBe(5000);
    expect(EXCLUDED_ASSETS["DXY"]).toBeTruthy();
  });
  it("JPY profit converts to USD through USDJPY", () => {
    expect(quoteToUsd(assetSpec("EURJPY")!, { USDJPY: 150 }, 160)).toBeCloseTo(1 / 150);
    expect(quoteToUsd(assetSpec("EURJPY")!, {}, 160)).toBeNull();
  });
  it("picks the lowest leverage that fits, never the max by default", () => {
    expect(chooseLeverage(4000, 10_000, 200)).toBe(5);
    expect(chooseLeverage(40_000, 1_000, 200)).toBe(200);
    expect(chooseLeverage(400_000, 100, 200)).toBeNull();
  });
  it("supervisor sizes to 2% risk per trade", () => {
    const s = supervise(base);
    expect(s.allow).toBe(true);
    expect(s.risk_usd!).toBeLessThanOrEqual(200);
  });
  it("supervisor blocks a duplicate on the same asset", () => {
    expect(supervise({ ...base, open: [{ symbol: "XAUUSD", side: "buy", risk_usd: 50, margin: 100, opened_at: "" }] }).allow).toBe(false);
  });
  it("supervisor blocks at the max drawdown", () => {
    expect(supervise({ ...base, equity: 6000, peak: 10_000 }).reason).toMatch(/Drawdown/);
  });
  it("supervisor blocks when total open risk is used up", () => {
    const open = [{ symbol: "EURUSD", side: "buy" as const, risk_usd: 300, margin: 10, opened_at: "" }, { symbol: "BTCUSD", side: "buy" as const, risk_usd: 300, margin: 10, opened_at: "" }];
    expect(supervise({ ...base, open }).reason).toMatch(/Total open risk/);
  });
  it("supervisor halves risk past half the drawdown limit", () => {
    expect(supervise({ ...base, equity: 8000, peak: 10_000 }).riskPct).toBe(1);
  });
  it("supervisor blocks the same signal again within 60 minutes", () => {
    expect(supervise({ ...base, recentSameSignalMin: 20 }).allow).toBe(false);
  });
  it("scanner needs H1 and H4 to agree", () => {
    const up = trend(200, 0.5), down = trend(200, -0.5, 300);
    expect(scanAsset("XAUUSD", 199, { H1: up, H4: down, M15: up }, gold).direction).toBeNull();
    expect(scanAsset("XAUUSD", 199.5, { H1: up, H4: up, D1: up, M15: up }, gold).direction).toBe("buy");
  });
  it("a gap through the stop fills at the worse open price", () => {
    const t = { side: "buy" as const, lot: 1, entry: 100, stop_loss: 95, take_profit: 110, margin: 1, fees: 0 };
    expect(exitOnBars(t, [{ t: 1, o: 90, h: 91, l: 89, c: 90 }])?.price).toBe(90);
  });
  it("counts one swap night per 21:00 UTC rollover", () => {
    expect(rollovers(Date.UTC(2026, 0, 5, 20), Date.UTC(2026, 0, 6, 22))).toBe(2);
  });
  it("US30 P/L uses $1 per point per lot", () => {
    const s = assetSpec("US30")!;
    expect(pnl({ side: "buy", lot: 1, entry: 40000, stop_loss: 0, take_profit: 0, margin: 0, fees: 0 }, 40100, s)).toBe(100);
  });
});
