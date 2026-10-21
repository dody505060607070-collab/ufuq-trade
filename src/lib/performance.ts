export const PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "all", label: "All Time" },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];

type T = { closed_at: string | null; profit: number | null };

export function inPeriod(closedAt: string | null, key: PeriodKey, now = new Date()) {
  if (key === "all") return true;
  if (!closedAt) return false;
  const d = new Date(closedAt);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (key === "today") return d >= start;
  if (key === "yesterday") {
    const y = new Date(start);
    y.setDate(y.getDate() - 1);
    return d >= y && d < start;
  }
  const days = key === "7d" ? 7 : 30;
  return now.getTime() - d.getTime() <= days * 86400_000;
}

export function periodStats<R extends T>(rows: R[], key: PeriodKey, now = new Date()) {
  const trades = rows.filter((r) => inPeriod(r.closed_at, key, now));
  const p = trades.map((t) => Number(t.profit ?? 0));
  const wins = p.filter((x) => x > 0).length;
  const losses = p.filter((x) => x < 0).length;
  return {
    trades,
    count: trades.length,
    wins,
    losses,
    net: p.reduce((s, x) => s + x, 0),
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    best: p.length ? Math.max(...p) : 0,
    worst: p.length ? Math.min(...p) : 0,
  };
}
