import { describe, expect, it } from "vitest";
import { QUANT_NAMES, perStrategy, sanitizeSettings, settingsLines } from "./quant";

describe("quant settings", () => {
  it("clamps risk and loss limits to what the EA accepts", () => {
    expect(sanitizeSettings({ risk_pct: 9, daily_loss_pct: 0 })).toMatchObject({
      risk_pct: 0.75,
      daily_loss_pct: 3,
    });
    expect(sanitizeSettings({ risk_pct: 1.234, daily_loss_pct: 5 })).toMatchObject({
      risk_pct: 1.23,
      daily_loss_pct: 5,
    });
  });
  it("drops unknown strategy names", () => {
    expect(sanitizeSettings({ strategies: { GOLD_TREND: false, HACK: true } }).strategies).toEqual({
      GOLD_TREND: false,
    });
  });
  it("renders S| lines the EA parses", () => {
    const out = settingsLines(
      sanitizeSettings({ risk_pct: 0.5, paused: true, strategies: { SPX_DIP: false } }),
      "T",
    );
    expect(out.split("\n")).toEqual([
      "OK|T",
      "S|risk_pct|0.5",
      "S|daily_loss_pct|3",
      "S|paused|1",
      "S|enabled_SPX_DIP|0",
      "",
    ]);
  });
  it("names match the EA book", () => {
    expect(QUANT_NAMES).toEqual([
      "GOLD_TREND",
      "GOLD_TREND_H1",
      "NAS_TREND",
      "NAS_TREND_H1",
      "SPX_TREND",
      "NAS_DIP",
      "SPX_DIP",
    ]);
  });
});

describe("perStrategy", () => {
  it("joins closed trades with tags", () => {
    const m = perStrategy(
      [
        { ticket: "1", profit: 10, status: "closed" },
        { ticket: "2", profit: -4, status: "closed" },
        { ticket: "3", profit: 5, status: "open" },
        { ticket: "9", profit: 1, status: "closed" },
      ],
      [
        { ticket: "1", strategy: "GOLD_TREND" },
        { ticket: "2", strategy: "GOLD_TREND" },
        { ticket: "3", strategy: "NAS_DIP" },
      ],
    );
    expect(m.get("GOLD_TREND")).toEqual({ trades: 2, wins: 1, net: 6 });
    expect(m.has("NAS_DIP")).toBe(false);
  });
});
