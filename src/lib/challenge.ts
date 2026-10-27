/** $50 → $1,000,000 Challenge: pure rules used by the Auto-Pilot cycle (tested). */
export type ChallengeRow = {
  status: string;
  start_balance: number;
  target_balance: number;
  peak_balance: number;
  floor_balance: number;
};

export type ChallengeGate =
  | { trade: true; peak: number }
  | { trade: false; peak: number; end?: "failed" | "completed"; closeAll?: boolean; reason: string };

/** Decides whether the challenge may open a trade this cycle, and whether it has ended. */
export function challengeGate(c: ChallengeRow, equity: number | null): ChallengeGate {
  const peak = Math.max(Number(c.peak_balance), equity ?? 0);
  if (c.status !== "running") return { trade: false, peak, reason: `Challenge is ${c.status}` };
  if (equity == null) return { trade: false, peak, reason: "Account equity unknown — waiting for the EA" };
  if (equity <= Number(c.floor_balance)) return { trade: false, peak, end: "failed", closeAll: true, reason: `Equity $${equity.toFixed(2)} hit the floor $${Number(c.floor_balance).toFixed(2)}` };
  if (equity >= Number(c.target_balance)) return { trade: false, peak, end: "completed", closeAll: true, reason: `Target $${Number(c.target_balance)} reached` };
  return { trade: true, peak };
}

/** Progress from start to target on a log scale (each doubling counts equally), 0..100. */
export function challengeProgress(start: number, current: number, target: number): number {
  if (start <= 0 || current <= 0 || target <= start) return 0;
  const p = Math.log(current / start) / Math.log(target / start);
  return Math.max(0, Math.min(100, p * 100));
}

/** Drawdown from peak in percent. */
export function drawdownPct(peak: number, current: number): number {
  return peak > 0 ? Math.max(0, ((peak - current) / peak) * 100) : 0;
}
