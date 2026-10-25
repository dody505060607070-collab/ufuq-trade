import { describe, expect, it } from "vitest";
import { candleProblem, validBar } from "./candles";

const base = Date.UTC(2026, 9, 21, 0, 0, 0) / 1000; // Wednesday
const series = (n: number, step = 3600) => Array.from({ length: n }, (_, i) => ({ t: base + i * step, o: 2000 + i, h: 2002 + i, l: 1999 + i, c: 2001 + i }));
const nowAfter = (rows: { t: number }[]) => rows[rows.length - 1]!.t + 60;

describe("broker candle validation", () => {
  it("accepts a clean series", () => { const r = series(40); expect(candleProblem(r, "H1", nowAfter(r))).toBeNull(); });
  it("rejects high below close", () => expect(validBar({ t: 1, o: 10, h: 9, l: 8, c: 10 })).toBe(false));
  it("rejects zero prices", () => expect(validBar({ t: 1, o: 0, h: 1, l: 0, c: 1 })).toBe(false));
  it("rejects too few bars", () => { const r = series(10); expect(candleProblem(r, "H1", nowAfter(r))).toMatch(/Only 10/); });
  it("rejects duplicated times", () => { const r = series(40); r[5] = { ...r[5]!, t: r[4]!.t }; expect(candleProblem(r, "H1", nowAfter(r))).toMatch(/out of order/); });
  it("rejects stale data older than 3 bars + 10 min", () => { const r = series(40); expect(candleProblem(r, "H1", r[39]!.t + 3 * 3600 + 601)).toMatch(/stale/); });
  it("rejects a frozen price", () => { const r = series(40).map((b, i) => (i >= 30 ? { ...b, o: 1, h: 1, l: 1, c: 1 } : b)); expect(candleProblem(r, "H1", nowAfter(r))).toMatch(/frozen/); });
  it("rejects many unexplained gaps", () => { const r = series(40).map((b, i) => ({ ...b, t: base + i * 4 * 3600 })); expect(candleProblem(r, "H1", nowAfter(r))).toMatch(/gaps/); });
});
