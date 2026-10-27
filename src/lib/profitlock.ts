/** Pure profit-lock rules: decide when an open trade's floating profit should be banked. */
export type LockRules = { profit_target_usd: number; lock_start_usd: number; giveback_pct: number };

/** Allowed giveback shrinks as the peak grows; never looser than the user's setting. */
export function givebackFor(peak: number, userPct: number): number {
  const tier = peak < 8 ? 40 : peak < 15 ? 20 : peak < 30 ? 18 : 15;
  return Math.min(userPct, tier);
}

/** Returns the close reason, or null to keep the trade open. strongTrend lets a winner run past the target on a tight trail. */
export function lockReason(profit: number, peak: number, r: LockRules, strongTrend = false): string | null {
  const hitTarget = r.profit_target_usd > 0 && peak >= r.profit_target_usd;
  if (hitTarget && !strongTrend && profit >= r.profit_target_usd) return `Target $${r.profit_target_usd} reached ($${profit.toFixed(2)})`;
  const pct = hitTarget && strongTrend ? 15 : givebackFor(peak, r.giveback_pct);
  const start = r.lock_start_usd > 0 ? r.lock_start_usd : hitTarget ? r.profit_target_usd : 0;
  if (start > 0 && peak >= start && profit > 0 && profit <= peak * (1 - pct / 100))
    return `Locked $${profit.toFixed(2)} after peak $${peak.toFixed(2)}${hitTarget && strongTrend ? " (runner)" : ""}`;
  return null;
}

export type ExitVerdict = "early" | "late" | "good";
/** Judges an exit: missed = extra profit price reached within 2h after close; giveback = peak minus realised. */
export function exitReview(profit: number, peak: number, missed: number): { verdict: ExitVerdict; giveback: number } {
  const giveback = Math.max(0, peak - profit);
  if (missed > Math.max(10, Math.abs(profit))) return { verdict: "early", giveback };
  if (peak > 0 && giveback > Math.max(5, peak * 0.35)) return { verdict: "late", giveback };
  return { verdict: "good", giveback };
}

/** Blocks new trades during cooldown after a close, or once the daily profit goal is met. */
/** Rest adapts to recent results: after a win the market is moving our way, so rest is short; loss streaks rest longer. */
export function adaptiveCooldown(base: number, recentProfits: number[]): number {
  if (base <= 0 || !recentProfits.length) return base;
  if ((recentProfits[0] ?? 0) > 0) return Math.min(base, 5);
  let streak = 0; for (const p of recentProfits) { if (p < 0) streak++; else break; }
  return streak >= 2 ? Math.min(base * 2, 120) : base;
}

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
