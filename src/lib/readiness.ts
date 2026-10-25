// Pure "why is it not trading?" checks and MT5 reconciliation. Tested in readiness.test.ts.
import { marketClosed, MIN_PROTOCOL_FOR_AUTOPILOT } from "./execution";

export type Check = { key: string; ok: boolean; label: string; fix?: string };
type Acc = { id: string; auto_trading: boolean; last_seen_at: string | null; protocol_version: number | null; margin_mode: string | null; last_snapshot_at?: string | null };
type Quote = { account_id: string; symbol: string; trade_allowed: boolean | null; updated_at: string };

/** Every condition Auto-Pilot needs, in the order it is checked. The first failing one is the reason nothing trades. */
export function readiness(i: { enabled: boolean; shadow: boolean; symbols: string[]; accounts: Acc[]; quotes: Quote[]; brokerCandles: number; now: Date }): Check[] {
  const nowMs = i.now.getTime();
  const online = i.accounts.filter((a) => a.last_seen_at && nowMs - new Date(a.last_seen_at).getTime() < 5 * 60_000);
  const auto = online.filter((a) => a.auto_trading);
  const modern = auto.filter((a) => (a.protocol_version ?? 0) >= MIN_PROTOCOL_FOR_AUTOPILOT);
  const openSyms = i.symbols.filter((s) => !marketClosed(s, i.now));
  const freshQ = i.quotes.filter((q) => nowMs - new Date(q.updated_at).getTime() < 10 * 60_000);
  const sessionClosed = freshQ.length > 0 && freshQ.every((q) => q.trade_allowed === false);
  return [
    { key: "enabled", ok: i.enabled, label: "Auto-Pilot is switched on", fix: "Turn on Auto-Pilot in Status, or press Restart Auto-Pilot." },
    { key: "online", ok: online.length > 0, label: "MetaTrader is connected (seen in the last 5 minutes)", fix: "Open MT5 on the VPS with the EA attached and Algo Trading on." },
    { key: "auto", ok: auto.length > 0, label: "Auto trading is on for a connected account", fix: "Switch on the account under Accounts." },
    { key: "ea", ok: modern.length > 0, label: `EA version 1.40 or newer is installed`, fix: "Download the new EA, compile it in MetaEditor and attach it again." },
    { key: "hedging", ok: modern.some((a) => a.margin_mode !== "netting"), label: "Account is a hedging account", fix: "Use a hedging MT5 account; netting is not supported." },
    { key: "market", ok: openSyms.length > 0, label: "Market is open for a selected instrument", fix: "Gold and FX reopen Sunday 22:00 UTC." },
    { key: "session", ok: !sessionClosed, label: "Broker trading session is open", fix: "Wait for the broker session; the EA reports it." },
    { key: "data", ok: i.brokerCandles > 0, label: "Broker candles are arriving from the EA", fix: "Install EA 1.40+; until then analysis uses Yahoo prices." },
    { key: "live", ok: !i.shadow, label: "Live mode (not shadow)", fix: "Shadow mode records decisions without sending orders." },
  ];
}

export function firstBlocker(checks: Check[]): Check | null {
  return checks.find((c) => !c.ok && c.key !== "data") ?? null;
}

type Cmd = { id: string; status: string; command: string; filled_count: number | null; created_at: string; result: string | null };
type Trade = { ticket: string; status: string; volume: number; closed_volume: number | null };

/** Differences between what the site recorded and what MT5 should have. Each item needs a human look in MT5. */
export function reconcile(i: { commands: Cmd[]; trades: Trade[]; account: Acc; now: Date }): string[] {
  const out: string[] = [];
  const nowMs = i.now.getTime();
  for (const c of i.commands) {
    if (c.status === "unknown") out.push(`Order ${c.id.slice(0, 8)} has no broker confirmation - check MT5 history`);
    if (c.status === "sent" && nowMs - new Date(c.created_at).getTime() > 15 * 60_000) out.push(`Order ${c.id.slice(0, 8)} was sent but never answered`);
    if (c.command === "open_trade" && c.status === "done" && c.filled_count === 0) out.push(`Order ${c.id.slice(0, 8)} is marked done but no fill was reported`);
  }
  const open = i.trades.filter((t) => t.status === "open");
  const snap = i.account.last_snapshot_at ?? i.account.last_seen_at;
  if (open.length && (!snap || nowMs - new Date(snap).getTime() > 10 * 60_000)) out.push(`${open.length} open position(s) not confirmed by MT5 for over 10 minutes`);
  for (const t of i.trades) if (t.status === "closed" && t.closed_volume != null && t.closed_volume > 0 && t.closed_volume + 1e-6 < Number(t.volume)) out.push(`Position #${t.ticket} closed with less volume recorded than opened - deals may be missing`);
  return out;
}
