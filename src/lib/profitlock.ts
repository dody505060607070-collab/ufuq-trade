/** Pure profit-lock rules: decide when an open trade's floating profit should be banked. */
export type LockRules = { profit_target_usd: number; lock_start_usd: number; giveback_pct: number };

/** Returns the close reason, or null to keep the trade open. */
export function lockReason(profit: number, peak: number, r: LockRules): string | null {
  if (r.profit_target_usd > 0 && profit >= r.profit_target_usd) return `Target $${r.profit_target_usd} reached ($${profit.toFixed(2)})`;
  if (r.lock_start_usd > 0 && peak >= r.lock_start_usd && profit > 0 && profit <= peak * (1 - r.giveback_pct / 100))
    return `Locked $${profit.toFixed(2)} after peak $${peak.toFixed(2)}`;
  return null;
}

/** Blocks new trades during cooldown after a close, or once the daily profit goal is met. */
export function pauseReason(minutesSinceLastClose: number | null, cooldown: number, todayProfit: number, dailyTarget: number): string | null {
  if (dailyTarget > 0 && todayProfit >= dailyTarget) return `Daily goal $${dailyTarget} reached — resting until tomorrow`;
  if (cooldown > 0 && minutesSinceLastClose != null && minutesSinceLastClose < cooldown) return `Resting ${Math.ceil(cooldown - minutesSinceLastClose)} min after last close`;
  return null;
}

/** Short trade-memory text for the AI prompt. */
export function memoryText(rows: { side: string; profit: number | null; closed_at: string | null }[]): string {
  if (!rows.length) return "no closed trades yet";
  const wins = rows.filter((r) => (r.profit ?? 0) > 0).length;
  const net = rows.reduce((s, r) => s + (r.profit ?? 0), 0);
  const lines = rows.map((r) => `${(r.closed_at ?? "").slice(0, 16)} ${r.side.toUpperCase()} ${(r.profit ?? 0) >= 0 ? "+" : ""}${(r.profit ?? 0).toFixed(2)}`);
  return `Last ${rows.length}: ${wins} wins, net ${net.toFixed(2)} USD\n${lines.join("\n")}`;
}
