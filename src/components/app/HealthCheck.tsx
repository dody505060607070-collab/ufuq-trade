import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/app/AppShell";
import { useT } from "@/lib/i18n";
import { readiness, firstBlocker, reconcile } from "@/lib/readiness";
import { cn } from "@/lib/utils";

type Acc = { id: string; auto_trading: boolean; last_seen_at: string | null; protocol_version: number | null; margin_mode: string | null; last_snapshot_at?: string | null };

/** "Why isn't it trading?" checklist plus a comparison of site records against what MT5 reported. */
export function HealthCheck({ enabled, shadow, symbols, accounts }: { enabled: boolean; shadow: boolean; symbols: string[]; accounts: Acc[] }) {
  const t = useT();
  const ids = accounts.map((a) => a.id);
  const data = useQuery({
    queryKey: ["health", ids.join(",")], enabled: ids.length > 0, refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 2 * 86400_000).toISOString();
      const [qs, bc, cmds, trades] = await Promise.all([
        supabase.from("broker_quotes").select("account_id,symbol,trade_allowed,updated_at").in("account_id", ids),
        supabase.from("broker_candles").select("t", { count: "exact", head: true }).in("account_id", ids),
        supabase.from("trade_commands").select("id,account_id,status,command,filled_count,created_at,result").in("account_id", ids).gte("created_at", since),
        supabase.from("trades").select("ticket,account_id,status,volume,closed_volume").in("account_id", ids).gte("opened_at", since),
      ]);
      return { quotes: qs.data ?? [], candles: bc.count ?? 0, cmds: cmds.data ?? [], trades: trades.data ?? [] };
    },
  });
  const now = new Date();
  const checks = readiness({ enabled, shadow, symbols, accounts, quotes: data.data?.quotes ?? [], brokerCandles: data.data?.candles ?? 0, now });
  const blocker = firstBlocker(checks);
  const issues = accounts.flatMap((a) => reconcile({
    account: a, now,
    commands: (data.data?.cmds ?? []).filter((c) => c.account_id === a.id),
    trades: (data.data?.trades ?? []).filter((x) => x.account_id === a.id).map((x) => ({ ...x, volume: Number(x.volume), closed_volume: x.closed_volume == null ? null : Number(x.closed_volume) })),
  }));

  return (
    <Card title={t("Health check: why is it (not) trading?")}>
      <div className={cn("mb-4 rounded-2xl border px-4 py-3 text-sm", blocker ? "border-warning/50 bg-warning/10" : "border-success/50 bg-success/10")}>
        {blocker ? <><b>{t("Main reason:")}</b> {t(blocker.label)} — {t("not yet")}. <span className="text-muted-foreground">{blocker.fix ? t(blocker.fix) : ""}</span></>
          : <b>{t("Everything is ready. A trade opens only when the AI signal and every safety rule pass.")}</b>}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2 rounded-xl border border-border bg-background/40 px-3 py-2 text-sm">
            {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
            <span><span className={c.ok ? "" : "font-semibold"}>{t(c.label)}</span>{!c.ok && c.fix && <span className="block text-xs text-muted-foreground">{t(c.fix)}</span>}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold text-muted-foreground">{t("Comparison with MT5 (last 48 hours)")}</div>
        {issues.length === 0 ? <p className="text-sm text-success">{t("Site records match what MT5 reported.")}</p> : (
          <ul className="space-y-1 text-sm">{issues.map((m, i) => <li key={i} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />{m}</li>)}</ul>
        )}
      </div>
    </Card>
  );
}
