// End-to-end paper-trade cycle on fixed historical-style bars: approve → open → close → review → lesson.
// Pure functions only: no database, no broker, no trade_commands.
import { describe, it, expect } from "vitest";
import { assetSpec, supervise, fillPrice, pnl, exitOnBars, SIM_START, type Limits, type SimTrade, type Bar } from "./challenge";
import { checklistVerdict, reviewTrade, type Checklist } from "./evidence";

const LIMITS: Limits = { riskPct: 2, maxTotalRiskPct: 6, maxDailyLossPct: 8, maxDrawdownPct: 35, maxOpen: 4 };
const spec = assetSpec("EURUSD")!;
const okList: Checklist = [
  { q: "Is the trend clear (not ranging)?", ok: true, note: "" },
  { q: "Do several timeframes agree?", ok: true, note: "" },
  { q: "Is the data fresh?", ok: true, note: "2 min" },
  { q: "Do costs leave the trade worthwhile?", ok: true, note: "" },
  { q: "Is reward/risk acceptable (≥1.5)?", ok: true, note: "2.0" },
];
const base = { spec, side: "buy" as const, mid: 1.1, sl: 1.0989, tp: 1.1025, conv: 1, equity: SIM_START, balance: SIM_START, peak: SIM_START, dayPnl: 0, open: [], recentSameSignalMin: null, limits: LIMITS };

describe("full simulated trade cycle", () => {
  it("approves, fills with costs, closes at target, reviews, and keeps risk unchanged", () => {
    expect(checklistVerdict(okList).decision).toBe("accept");
    const s = supervise(base);
    expect(s.allow).toBe(true);
    expect(s.risk_usd!).toBeLessThanOrEqual(2); // 2% of $100
    const t: SimTrade = { side: "buy", lot: s.lot!, entry: s.entry!, stop_loss: base.sl, take_profit: base.tp, margin: s.margin!, fees: s.fees! };
    expect(t.entry).toBeCloseTo(fillPrice("buy", 1.1, spec), 10);
    // bars recorded AFTER the decision (evaluation data)
    const later: Bar[] = [{ t: 1, o: 1.1001, h: 1.1015, l: 1.0992, c: 1.101 }, { t: 2, o: 1.101, h: 1.103, l: 1.1008, c: 1.1026 }];
    const exit = exitOnBars(t, later)!;
    expect(exit.reason).toBe("take_profit");
    const profit = pnl(t, exit.price, spec);
    expect(profit).toBeCloseTo((exit.price - t.entry) * t.lot * spec.contract - t.fees, 8);
    const rv = reviewTrade({ profit, risk_usd: s.risk_usd!, close_reason: exit.reason, checklist: okList, votes: { for: 3, against: 1 } });
    expect(rv.outcome_class).toBe("good decision, good outcome");
    expect(LIMITS.riskPct).toBe(2); // lessons never mutate limits
  });

  it("a stopped-out good decision is variance, and the lesson says not to change strategy", () => {
    const s = supervise(base);
    const t: SimTrade = { side: "buy", lot: s.lot!, entry: s.entry!, stop_loss: base.sl, take_profit: base.tp, margin: s.margin!, fees: s.fees! };
    const exit = exitOnBars(t, [{ t: 1, o: 1.0999, h: 1.1, l: 1.0985, c: 1.0987 }])!;
    expect(exit.reason).toBe("stop_loss");
    const profit = pnl(t, exit.price, spec);
    expect(profit).toBeLessThan(0);
    expect(-profit).toBeLessThanOrEqual(s.risk_usd! + 1e-9);
    const rv = reviewTrade({ profit, risk_usd: s.risk_usd!, close_reason: exit.reason, checklist: okList, votes: { for: 3, against: 1 } });
    expect(rv.outcome_class).toBe("good decision, bad outcome (variance)");
    expect(rv.lessons.join(" ")).toMatch(/not a reason to change the strategy/);
  });

  it("stale data is rejected before any trade", () => {
    const stale = okList.map((x) => (x.q.startsWith("Is the data fresh") ? { ...x, ok: false } : x));
    expect(checklistVerdict(stale).decision).toBe("reject");
  });
});
