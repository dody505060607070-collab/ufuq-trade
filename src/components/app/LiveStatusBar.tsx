import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Bot, Brain, Clock, Wifi, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { isOnline, timeAgo, useAccounts } from "@/lib/trading";
import { cn } from "@/lib/utils";

/** Forex/gold weekend close: Fri 21:00 → Sun 22:00 UTC (same rule as the Auto-Pilot engine). */
function marketClosed(n: Date) {
  const d = n.getUTCDay(), h = n.getUTCHours();
  return (d === 5 && h >= 21) || d === 6 || (d === 0 && h < 22);
}

/** Top-of-dashboard strip: is MT5 connected, is Auto-Pilot on, what did it last decide, when is the next scan. */
export function LiveStatusBar() {
  const t = useT();
  const { user } = useAuth();
  const accounts = useAccounts();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);

  const settings = useQuery({
    queryKey: ["autopilot", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("autopilot_settings").select("*").eq("user_id", user!.id).maybeSingle()).data,
  });
  const last = useQuery({
    queryKey: ["autopilot-last-event"],
    enabled: !!user,
    refetchInterval: 15_000,
    queryFn: async () => (await supabase.from("autopilot_events").select("*").order("created_at", { ascending: false }).limit(1)).data?.[0] ?? null,
  });

  const accs = accounts.data ?? [];
  const online = accs.filter((a) => isOnline(a));
  const autoAccs = accs.filter((a) => a.auto_trading);
  const lastSeen = accs.map((a) => a.last_seen_at).filter(Boolean).sort().pop();
  const enabled = !!settings.data?.enabled;
  const closed = marketClosed(new Date(now));
  const next = Math.ceil((now + 1) / 600_000) * 600_000;
  const left = Math.max(0, Math.floor((next - now) / 1000));
  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");
  const ev = last.data;

  const working = online.length > 0 && enabled && autoAccs.length > 0 && !closed;
  const headline = closed ? t("Market is closed for the weekend — scanning resumes Sunday 22:00 UTC")
    : !accs.length ? t("No MT5 account connected yet")
    : !online.length ? t("MetaTrader is closed or disconnected — no trades can be placed")
    : !enabled ? t("Auto-Pilot is off — it will not trade")
    : !autoAccs.length ? t("Auto trading is off on your accounts")
    : t("Everything is running — the AI scans the market on its own");

  return (
    <div className={cn("rounded-3xl border p-4", working ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5")}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className={cn("h-2.5 w-2.5 rounded-full", working ? "animate-pulse bg-success" : "bg-destructive")} />
        {headline}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cell icon={online.length ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />} ok={online.length > 0} label={t("MetaTrader 5")}
          value={online.length ? `${t("Connected")} (${online.length}/${accs.length})` : t("Disconnected")}
          sub={lastSeen ? `${t("Last signal")} ${timeAgo(lastSeen)}` : t("Never connected")} />
        <Cell icon={<Bot className="h-4 w-4" />} ok={enabled && autoAccs.length > 0} label={t("Auto-Pilot")}
          value={enabled ? t("On") : t("Off")}
          sub={`${t("Auto trading on")} ${autoAccs.length}/${accs.length}`} />
        <Cell icon={<Clock className="h-4 w-4" />} ok={!closed && enabled} label={t("Next analysis")}
          value={closed ? t("Market closed") : enabled ? `${mm}:${ss}` : "—"}
          sub={closed ? t("Weekend") : t("Every 10 minutes")} />
        <Cell icon={ev?.action === "opened" ? <Activity className="h-4 w-4" /> : <Brain className="h-4 w-4" />} ok={ev?.action === "opened"} neutral={ev?.action === "skipped"} label={t("Last AI decision")}
          value={ev ? `${ev.symbol !== "-" ? ev.symbol + " · " : ""}${ev.action === "opened" ? t("Opened a trade") : ev.action === "skipped" ? t("Skipped") : t("Error")}` : t("No decisions yet")}
          sub={ev ? `${t(ev.detail ?? "")} · ${timeAgo(ev.created_at)}` : ""} />
      </div>
    </div>
  );
}

function Cell({ icon, ok, neutral, label, value, sub }: { icon: React.ReactNode; ok: boolean; neutral?: boolean; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-card p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</p>
      <p className={cn("mt-1 font-bold", ok ? "text-success" : neutral ? "text-foreground" : "text-destructive")}>{value}</p>
      {sub && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
