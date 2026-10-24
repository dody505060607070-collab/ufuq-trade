/** Pure helpers for broker deals (executions) vs positions. */
export type Deal = { deal_ticket: string; position_ticket: string; volume: number; price: number | null; profit: number; closed_at: string };

/** Summary of all exit deals recorded for one position. Duplicates (same deal ticket) are counted once. */
export function summarizeDeals(deals: Deal[]) {
  const seen = new Map<string, Deal>();
  for (const d of deals) seen.set(d.deal_ticket, d);
  const list = [...seen.values()].sort((a, b) => a.closed_at.localeCompare(b.closed_at));
  const last = list[list.length - 1];
  return {
    realized: Math.round(list.reduce((s, d) => s + d.profit, 0) * 100) / 100,
    closedVolume: Math.round(list.reduce((s, d) => s + d.volume, 0) * 1e6) / 1e6,
    lastPrice: last?.price ?? null,
    lastAt: last?.closed_at ?? null,
  };
}

/** A position is closed only when the terminal no longer reports it as open. */
export function positionStatus(stillOpen: boolean): "open" | "closed" {
  return stillOpen ? "open" : "closed";
}

/** Fallback deal id for old EAs that do not send the broker deal ticket. */
export function fallbackDealId(position: string, closedAt: string | null | undefined, volume: number, price: number | null | undefined) {
  return `${position}:${closedAt ?? ""}:${volume}:${price ?? ""}`;
}
