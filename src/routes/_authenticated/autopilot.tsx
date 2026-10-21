import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Page, Card } from "@/components/app/AppShell";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useT, HelpNote } from "@/lib/i18n";
import { useAccounts, useInstruments, isOnline, timeAgo } from "@/lib/trading";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/autopilot")({
  head: () => ({ meta: [{ title: "Auto-Pilot | Arrissa AI" }, { name: "description", content: "Fully automatic AI trading with strict risk limits." }] }),
  component: AutoPilot,
});

type Settings = { enabled: boolean; symbols: string[]; timeframe: string; min_confidence: number; lot_size: number; max_open: number; max_daily: number; avoid_news: boolean };
const DEFAULTS: Settings = { enabled: false, symbols: ["XAUUSD", "EURUSD"], timeframe: "H1", min_confidence: 75, lot_size: 0.01, max_open: 2, max_daily: 4, avoid_news: true };

function AutoPilot() {
  const t = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const accounts = useAccounts();
  const instruments = useInstruments();
  const q = useQuery({
    queryKey: ["autopilot", user?.id], enabled: !!user,
    queryFn: async () => (await supabase.from("autopilot_settings").select("*").eq("user_id", user!.id).maybeSingle()).data,
  });
  const events = useQuery({
    queryKey: ["autopilot-events"], refetchInterval: 30_000,
    queryFn: async () => (await supabase.from("autopilot_events").select("*").order("created_at", { ascending: false }).limit(40)).data ?? [],
  });
  const [s, setS] = useState<Settings>(DEFAULTS);
  useEffect(() => { if (q.data) setS({ ...q.data, lot_size: Number(q.data.lot_size) }); }, [q.data]);

  const save = async (patch: Partial<Settings> = {}) => {
    const next = { ...s, ...patch };
    if (!(next.lot_size >= 0.01 && next.lot_size <= 10)) return toast.error(t("Lot size must be between 0.01 and 10."));
    if (!next.symbols.length) return toast.error(t("Pick at least one instrument."));
    setS(next);
    const { error } = await supabase.from("autopilot_settings").upsert({ user_id: user!.id, ...next, updated_at: new Date().toISOString() });
    if (error) return toast.error(t("Could not save."));
    toast.success(next.enabled ? t("Auto-Pilot is ON") : t("Auto-Pilot settings saved"));
    void qc.invalidateQueries({ queryKey: ["autopilot"] });
  };

  const toggleAccount = async (id: string, v: boolean) => {
    await supabase.from("trading_accounts").update({ auto_trading: v }).eq("id", id);
    void qc.invalidateQueries({ queryKey: ["accounts"] });
  };

  const num = (k: keyof Settings, v: string) => setS({ ...s, [k]: Number(v) });
  const autoAccounts = (accounts.data ?? []).filter((a) => a.auto_trading);

  return (
    <Page title={t("Auto-Pilot")} subtitle={t("Fully automatic AI trading with strict risk limits.")}>
      <HelpNote>{"Every 15 minutes the AI analyses your chosen instruments. When a signal is strong enough and every safety rule passes, a trade with Stop Loss and Take Profit is sent to your MT5 accounts automatically — no need to keep this page open. MT5 with the EA must stay running (for example on your Windows server). Test on a demo account first."}</HelpNote>

      <Card title={t("Status")}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={cn("flex h-12 w-12 items-center justify-center rounded-full", s.enabled ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground")}><Bot className="h-6 w-6" /></span>
            <div>
              <div className="text-lg font-semibold">{s.enabled ? t("Auto-Pilot is ON") : t("Auto-Pilot is OFF")}</div>
              <div className="text-xs text-muted-foreground">{autoAccounts.length} {t("account(s) enabled")} · {autoAccounts.filter(isOnline).length} {t("connected")}</div>
            </div>
          </div>
          <Switch checked={s.enabled} onCheckedChange={(v) => void save({ enabled: v })} aria-label={t("Auto-Pilot")} />
        </div>
      </Card>

      <Card title={t("Accounts")}>
        {(accounts.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{t("No MT5 account connected yet.")}</p> : (
          <div className="space-y-2">
            {(accounts.data ?? []).map((a) => (
              <label key={a.id} className="flex items-center justify-between rounded-2xl border border-border bg-background/40 px-4 py-3">
                <span className="text-sm"><b>{a.label ?? "MT5"}</b> · {a.login} <span className={cn("ms-2 text-xs", isOnline(a) ? "text-success" : "text-muted-foreground")}>{isOnline(a) ? t("connected") : t("offline")}</span></span>
                <Switch checked={a.auto_trading} onCheckedChange={(v) => void toggleAccount(a.id, v)} />
              </label>
            ))}
          </div>
        )}
      </Card>

      <Card title={t("Instruments")}>
        <div className="flex flex-wrap gap-2">
          {(instruments.data ?? []).map((i) => {
            const on = s.symbols.includes(i.symbol);
            return <button key={i.id} onClick={() => setS({ ...s, symbols: on ? s.symbols.filter((x) => x !== i.symbol) : [...s.symbols, i.symbol].slice(0, 6) })}
              className={cn("rounded-full border px-3 py-1 text-xs font-semibold", on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{i.symbol}</button>;
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("Up to 6 instruments.")}</p>
      </Card>

      <Card title={t("Safety rules")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Timeframe")}>
            <div className="flex gap-1">{["M15", "H1", "H4"].map((tf) => <button key={tf} onClick={() => setS({ ...s, timeframe: tf })} className={cn("flex-1 rounded-full border px-3 py-1.5 text-xs", s.timeframe === tf ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{tf}</button>)}</div>
          </Field>
          <Field label={t("Minimum AI confidence (%)")}><Input type="number" min={50} max={95} value={s.min_confidence} onChange={(e) => num("min_confidence", e.target.value)} /></Field>
          <Field label={t("Lot size per trade")}><Input type="number" step={0.01} min={0.01} value={s.lot_size} onChange={(e) => num("lot_size", e.target.value)} /></Field>
          <Field label={t("Max open trades per account")}><Input type="number" min={1} max={10} value={s.max_open} onChange={(e) => num("max_open", e.target.value)} /></Field>
          <Field label={t("Max auto trades per day")}><Input type="number" min={1} max={20} value={s.max_daily} onChange={(e) => num("max_daily", e.target.value)} /></Field>
          <label className="flex items-center justify-between rounded-2xl border border-border bg-background/40 px-4 py-3">
            <span className="text-sm">{t("Don't trade 30 min around high-impact news")}</span>
            <Switch checked={s.avoid_news} onCheckedChange={(v) => setS({ ...s, avoid_news: v })} />
          </label>
        </div>
        <Button variant="hero" className="mt-4 rounded-full" onClick={() => void save()}>{t("Save settings")}</Button>
      </Card>

      <Card title={t("Activity")}>
        {(events.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{t("No activity yet. The first check runs within 15 minutes after you turn Auto-Pilot on.")}</p> : (
          <ul className="space-y-1 text-sm">
            {(events.data ?? []).map((e) => (
              <li key={e.id} className="flex gap-3 border-t border-border/40 py-1.5">
                <span className={cn("w-16 shrink-0 text-xs font-semibold", e.action === "opened" ? "text-success" : e.action === "error" ? "text-destructive" : "text-muted-foreground")}>{t(e.action)}</span>
                <span className="w-16 shrink-0 font-semibold">{e.symbol}</span>
                <span className="flex-1 text-muted-foreground">{e.detail}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="mb-1 text-xs font-semibold text-muted-foreground">{label}</div>{children}</div>;
}
