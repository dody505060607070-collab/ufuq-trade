// Pure rules for the command lifecycle, executions accounting and market hours. Tested in execution.test.ts.

export type CommandStatus = "queued" | "sent" | "done" | "partially_filled" | "failed" | "expired" | "unknown";
export const OPEN_STATUSES: CommandStatus[] = ["queued", "sent", "unknown", "partially_filled"];

/** EA → server result status. "partial" means some but not all sub-trades opened. */
export type EaStatus = "done" | "failed" | "partial" | "unknown" | "expired";
export function mapEaStatus(s: EaStatus): CommandStatus {
  return s === "partial" ? "partially_filled" : s;
}

/** A result may only move a command forward from these states, so a late reply never wipes a newer one. */
export const RESULT_FROM: CommandStatus[] = ["sent", "unknown"];
export function canApplyResult(current: string, next: CommandStatus): boolean {
  if (!RESULT_FROM.includes(current as CommandStatus)) return false;
  return !(current === "unknown" && next === "unknown");
}

/** Number of broker executions a command will (or may still) create. */
export function executionsOf(payload: unknown): number {
  const p = (payload ?? {}) as { count?: unknown; until_no_margin?: unknown };
  if (p.until_no_margin) return 50;
  const n = Math.floor(Number(p.count ?? 1));
  return Number.isFinite(n) ? Math.max(1, Math.min(50, n)) : 1;
}

/** Executions still reserved by not-finished commands (unknown counts as possibly filled; partial counts what is filled). */
export function reservedExecutions(cmds: { status: string; payload: unknown; filled_count?: number | null }[]): number {
  return cmds.reduce((s, c) => {
    if (c.status === "partially_filled") return s + (c.filled_count ?? executionsOf(c.payload));
    return OPEN_STATUSES.includes(c.status as CommandStatus) ? s + executionsOf(c.payload) : s;
  }, 0);
}

const CRYPTO = /^(BTC|ETH|SOL|XRP|LTC|ADA|DOGE)/i;
/** Weekend close applies to FX/metals/indices/energy (Fri 21:00 → Sun 22:00 UTC); crypto trades every day. */
export function marketClosed(symbol: string, d: Date): boolean {
  if (CRYPTO.test(symbol)) return false;
  const day = d.getUTCDay(), h = d.getUTCHours();
  return (day === 5 && h >= 21) || day === 6 || (day === 0 && h < 22);
}

/** Realised P/L booked on a UTC accounting day, from individual exit deals (not from the close date of a position). */
export function dayPnlFromDeals(deals: { profit: number | string; closed_at: string }[], dayStartIso: string): number {
  const start = new Date(dayStartIso).getTime(), end = start + 86_400_000;
  return deals.reduce((s, d) => {
    const t = new Date(d.closed_at).getTime();
    return t >= start && t < end ? s + Number(d.profit) : s;
  }, 0);
}

/** May this positions snapshot be used to close missing positions? Partial or out-of-order snapshots may not. */
export function snapshotUsable(s: { positionsOk?: boolean; snapshotAt?: number | null; lastSnapshotAt?: number | null }): { use: boolean; closeMissing: boolean } {
  if (s.snapshotAt != null && s.lastSnapshotAt != null && s.snapshotAt < s.lastSnapshotAt) return { use: false, closeMissing: false };
  return { use: true, closeMissing: s.positionsOk !== false };
}

/** Lot policy: never rounds up to reach the broker minimum (that would raise risk). */
export function lotProblem(lot: number, spec: { min?: number | null; max?: number | null; step?: number | null }): string | null {
  if (!Number.isFinite(lot) || lot <= 0) return "Invalid lot size";
  if (spec.min != null && lot < spec.min - 1e-9) return `Lot ${lot} is below the broker minimum ${spec.min}`;
  if (spec.max != null && lot > spec.max + 1e-9) return `Lot ${lot} is above the broker maximum ${spec.max}`;
  if (spec.step != null && spec.step > 0) {
    const k = lot / spec.step;
    if (Math.abs(k - Math.round(k)) > 1e-6) return `Lot ${lot} is not a multiple of the broker step ${spec.step}`;
  }
  return null;
}

export const PROTOCOL_VERSION = 2;
export const MIN_PROTOCOL_FOR_AUTOPILOT = 2;
