// Pure checks for broker candles before they are trusted by the analysis. Tested in candles.test.ts.
export type Bar = { t: number; o: number; h: number; l: number; c: number };

export const TF_SECONDS: Record<string, number> = { M5: 300, M15: 900, H1: 3600, H4: 14400, D1: 86400 };

/** One bar is usable: finite positive prices and a consistent high/low range. */
export function validBar(b: Bar): boolean {
  const v = [b.o, b.h, b.l, b.c];
  if (!Number.isFinite(b.t) || b.t <= 0 || v.some((x) => !Number.isFinite(x) || x <= 0)) return false;
  return b.h >= Math.max(b.o, b.c) - 1e-9 && b.l <= Math.min(b.o, b.c) + 1e-9 && b.h >= b.l;
}

/** Gap between two bars that is explained by the weekend close (Fri 21:00 → Sun 22:00 UTC). */
function weekendGap(a: number, b: number): boolean {
  const da = new Date(a * 1000), db = new Date(b * 1000);
  return (da.getUTCDay() === 5 || da.getUTCDay() === 6) && (db.getUTCDay() === 0 || db.getUTCDay() === 1) && b - a < 4 * 86400;
}

/**
 * Why a broker candle series must not be used (null = usable).
 * Checks: enough bars, valid OHLC, strictly increasing time, no large unexplained gaps, not frozen, not stale.
 */
export function candleProblem(rows: Bar[], timeframe: string, nowSec: number, minBars = 30): string | null {
  const step = TF_SECONDS[timeframe] ?? 3600;
  if (rows.length < minBars) return `Only ${rows.length} broker candles (need ${minBars})`;
  if (rows.some((b) => !validBar(b))) return "Broker candles contain invalid prices";
  let gaps = 0;
  for (let i = 1; i < rows.length; i++) {
    const d = rows[i]!.t - rows[i - 1]!.t;
    if (d <= 0) return "Broker candles are out of order or duplicated";
    if (d > step * 3 && !weekendGap(rows[i - 1]!.t, rows[i]!.t) && step < 86400) gaps++;
  }
  if (gaps > Math.max(2, rows.length * 0.1)) return `Broker candles have ${gaps} unexplained gaps`;
  const tail = rows.slice(-10);
  if (tail.length >= 10 && tail.every((b) => b.o === tail[0]!.o && b.h === tail[0]!.h && b.l === tail[0]!.l && b.c === tail[0]!.c)) return "Broker price looks frozen";
  if (nowSec - rows[rows.length - 1]!.t > 3 * step + 600) return "Broker candles are stale";
  return null;
}
