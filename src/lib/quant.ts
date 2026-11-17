// Pure helpers for the Quant EA (UfuqQuantEA.mq5 v2). Unit-tested in quant.test.ts.

/** Strategy book exactly as compiled into the EA (names must match the EA). */
export const QUANT_STRATEGIES = [
  {
    name: "GOLD_TREND",
    symbol: "XAUUSD",
    tf: "H4",
    weight: 1.0,
    kind: "trend",
    desc: "Gold 55-bar breakout, D1 EMA200 regime, 2 ATR stop, 3 ATR trailing",
  },
  {
    name: "GOLD_TREND_H1",
    symbol: "XAUUSD",
    tf: "H1",
    weight: 0.5,
    kind: "trend",
    desc: "Gold 100-bar breakout on H1, same regime and exits",
  },
  {
    name: "NAS_TREND",
    symbol: "NAS100",
    tf: "H4",
    weight: 1.0,
    kind: "trend",
    desc: "Nasdaq 55-bar breakout, long only above D1 EMA200",
  },
  {
    name: "NAS_TREND_H1",
    symbol: "NAS100",
    tf: "H1",
    weight: 0.5,
    kind: "trend",
    desc: "Nasdaq 100-bar breakout on H1, long only",
  },
  {
    name: "SPX_TREND",
    symbol: "US500",
    tf: "H4",
    weight: 0.5,
    kind: "trend",
    desc: "S&P 500 55-bar breakout, long only",
  },
  {
    name: "NAS_DIP",
    symbol: "NAS100",
    tf: "D1",
    weight: 0.5,
    kind: "dip",
    desc: "Buy RSI(2)<10 above SMA200, exit close>SMA5 or 10 days",
  },
  {
    name: "SPX_DIP",
    symbol: "US500",
    tf: "D1",
    weight: 0.5,
    kind: "dip",
    desc: "Same dip rule on the S&P 500",
  },
] as const;

export type QuantStrategyName = (typeof QUANT_STRATEGIES)[number]["name"];
export const QUANT_NAMES: readonly string[] = QUANT_STRATEGIES.map((s) => s.name);

export type QuantSettings = {
  risk_pct: number;
  daily_loss_pct: number;
  paused: boolean;
  strategies: Record<string, boolean>;
};

export const QUANT_DEFAULTS: QuantSettings = {
  risk_pct: 0.75,
  daily_loss_pct: 3,
  paused: false,
  strategies: {},
};

/** Clamp to the same limits the EA accepts (it ignores anything outside them). */
export function sanitizeSettings(s: Partial<QuantSettings>): QuantSettings {
  const num = (v: unknown, lo: number, hi: number, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > lo && n <= hi ? Math.round(n * 100) / 100 : d;
  };
  const strategies: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(s.strategies ?? {}))
    if (QUANT_NAMES.includes(k)) strategies[k] = !!v;
  return {
    risk_pct: num(s.risk_pct, 0, 3, QUANT_DEFAULTS.risk_pct),
    daily_loss_pct: num(s.daily_loss_pct, 0, 20, QUANT_DEFAULTS.daily_loss_pct),
    paused: !!s.paused,
    strategies,
  };
}

/** Pipe-separated reply the EA parses: `S|key|value` per line. */
export function settingsLines(s: QuantSettings, now: string): string {
  const lines = [
    `OK|${now}`,
    `S|risk_pct|${s.risk_pct}`,
    `S|daily_loss_pct|${s.daily_loss_pct}`,
    `S|paused|${s.paused ? 1 : 0}`,
  ];
  for (const name of QUANT_NAMES)
    if (name in s.strategies) lines.push(`S|enabled_${name}|${s.strategies[name] ? 1 : 0}`);
  return lines.join("\n") + "\n";
}

/** Profit in R per strategy from closed trades joined with their strategy tags. */
export function perStrategy(
  trades: { ticket: string; profit: number | null; status: string }[],
  tags: { ticket: string; strategy: string }[],
) {
  const byTicket = new Map(tags.map((t) => [t.ticket, t.strategy]));
  const out = new Map<string, { trades: number; wins: number; net: number }>();
  for (const t of trades) {
    if (t.status !== "closed") continue;
    const s = byTicket.get(t.ticket);
    if (!s) continue;
    const row = out.get(s) ?? { trades: 0, wins: 0, net: 0 };
    row.trades++;
    const p = Number(t.profit ?? 0);
    if (p > 0) row.wins++;
    row.net += p;
    out.set(s, row);
  }
  return out;
}
