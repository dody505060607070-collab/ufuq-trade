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
import { RestartAutopilotButton } from "@/components/app/RestartAutopilotButton";
import { Slider } from "@/components/ui/slider";
import { lotForRisk, riskForLot, riskLevel, dollarsPerMove, RISK_MIN, RISK_MAX, RISK_RECOMMENDED, TYPICAL_GOLD_STOP } from "@/lib/risk";
import { DEFAULT_TRADE_LOT, validAutopilotLot } from "@/lib/lot-settings";
import { seo } from "@/lib/seo";
import { useWebMCP } from "use-webmcp-tool";
import { runWebMCPTool } from "@/lib/webmcp-telemetry";

export const Route = createFileRoute("/_authenticated/autopilot")({
  head: () => seo("Auto-Pilot", "Automatic AI trading with configurable risk limits."),
  component: AutoPilot,
});

type Settings = { enabled: boolean; symbols: string[]; timeframe: string; min_confidence: number; lot_size: number; max_open: number; max_daily: number; avoid_news: boolean; profit_target_usd: number; lock_start_usd: number; giveback_pct: number; cooldown_minutes: number; daily_target_usd: number };
const DEFAULTS: Settings = { enabled: false, symbols: ["XAUUSD", "EURUSD"], timeframe: "H1", min_confidence: 75, lot_size: DEFAULT_TRADE_LOT, max_open: 2, max_daily: 4, avoid_news: true, profit_target_usd: 20, lock_start_usd: 10, giveback_pct: 40, cooldown_minutes: 30, daily_target_usd: 0 };

function AutoPilot() {
  const t = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const accounts = useAccounts();
  const instruments = useInstruments();
  const q = useQuery({
    queryKey: ["autopilot", user?.id], enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from("autopilot_settings").select("*").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const events = useQuery({
    queryKey: ["autopilot-events"], refetchInterval: 30_000,
    queryFn: async () => (await supabase.from("autopilot_events").select("*").order("created_at", { ascending: false }).limit(40)).data ?? [],
  });
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  useWebMCP({
    name: "read_visible_autopilot", description: "Read the Auto-Pilot settings currently visible on this page.",
    annotations: { readOnlyHint: true }, enabled: !!user && !q.isPending && !q.isError,
    execute: () => runWebMCPTool("read_visible_autopilot", () => `Auto-Pilot ${s.enabled ? "ON" : "OFF"}; lot ${s.lot_size}; confidence ${s.min_confidence}%; max open ${s.max_open}; daily limit ${s.max_daily}.`),
  });
  useEffect(() => { if (q.data) { const d = q.data as unknown as Settings; setS({ ...DEFAULTS, ...d, lot_size: Number(d.lot_size), profit_target_usd: Number(d.profit_target_usd ?? 20), lock_start_usd: Number(d.lock_start_usd ?? 10), daily_target_usd: Number(d.daily_target_usd ?? 0) }); }; }, [q.data]);

  const save = async (patch: Partial<Settings> = {}) => {
    if (!user || saving || q.isPending || q.isError) return;
    const next = { ...s, ...patch };
    if (!validAutopilotLot(next.lot_size)) return toast.error(t("Lot size must be between 0.01 and 10."));
    if (!next.symbols.length) return toast.error(t("Pick at least one instrument."));
    setSaving(true);
    const { error } = await supabase.from("autopilot_settings").upsert({ user_id: user.id, ...next, updated_at: new Date().toISOString() } as never);
    setSaving(false);
    if (error) { void qc.invalidateQueries({ queryKey: ["autopilot"] }); return toast.error(t("Could not save.")); }
    setS(next);
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
      <HelpNote>{"Every 10 minutes the AI analyses your chosen instruments. When a signal is strong enough and every safety rule passes, a trade with Stop Loss and Take Profit is sent to your MT5 accounts automatically — no need to keep this page open. MT5 with the EA must stay running (for example on your Windows server). Test on a demo account first."}</HelpNote>

      <Card title={t("Status")}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={cn("flex h-12 w-12 items-center justify-center rounded-full", s.enabled ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground")}><Bot className="h-6 w-6" /></span>
            <div>
              <div className="text-lg font-semibold">{s.enabled ? t("Auto-Pilot is ON") : t("Auto-Pilot is OFF")}</div>
              <div className="text-xs text-muted-foreground">{autoAccounts.length} {t("account(s) enabled")} · {autoAccounts.filter((a) => isOnline(a)).length} {t("connected")}</div>
            </div>
          </div>
          <div className="flex items-center gap-3"><RestartAutopilotButton /><Switch checked={s.enabled} onCheckedChange={(v) => void save({ enabled: v })} aria-label={t("Auto-Pilot")} /></div>
        </div>
      </Card>

      <LiveMonitor enabled={s.enabled && autoAccounts.length > 0} events={events.data ?? []} accountIds={autoAccounts.map((a) => a.id)} />

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
            return <button key={i.id} onClick={() => void save({ symbols: on ? s.symbols.filter((x) => x !== i.symbol) : [...s.symbols, i.symbol].slice(0, 6) })}
              className={cn("rounded-full border px-3 py-1 text-xs font-semibold", on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{i.symbol}</button>;
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("Up to 6 instruments.")}</p>
      </Card>

      <RiskCard balance={Number(autoAccounts[0]?.balance ?? accounts.data?.[0]?.balance ?? 0)} lot={s.lot_size} onApply={(lot) => void save({ lot_size: lot })} />

      <Card title={t("Safety rules")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Timeframe")}>
            <div className="flex gap-1">{["M15", "H1", "H4"].map((tf) => <button key={tf} onClick={() => setS({ ...s, timeframe: tf })} className={cn("flex-1 rounded-full border px-3 py-1.5 text-xs", s.timeframe === tf ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{tf}</button>)}</div>
          </Field>
          <Field label={t("Minimum AI confidence (%)")}><Input type="number" min={65} max={95} value={s.min_confidence} onChange={(e) => num("min_confidence", e.target.value)} /></Field>
          <Field label={t("Lot size per trade")}><Input aria-label={t("Lot size per trade")} type="number" step={0.01} min={0.01} max={10} disabled={saving || q.isPending || q.isError} value={s.lot_size} onChange={(e) => num("lot_size", e.target.value)} onBlur={(e) => { const lot = Number(e.currentTarget.value); if (validAutopilotLot(lot) && lot !== Number(q.data?.lot_size)) void save({ lot_size: lot }); }} /></Field>
          <Field label={t("Max open trades per account")}><Input type="number" min={1} max={10} value={s.max_open} onChange={(e) => num("max_open", e.target.value)} /></Field>
          <Field label={t("Max auto trades per day (0 = unlimited)")}><Input type="number" min={0} max={100} value={s.max_daily} onChange={(e) => num("max_daily", e.target.value)} /></Field>
          <label className="flex items-center justify-between rounded-2xl border border-border bg-background/40 px-4 py-3">
            <span className="text-sm">{t("Don't trade 30 min around high-impact news")}</span>
            <Switch checked={s.avoid_news} onCheckedChange={(v) => setS({ ...s, avoid_news: v })} />
          </label>
        </div>
        <Button variant="hero" className="mt-4 rounded-full" onClick={() => void save()}>{t("Save settings")}</Button>
      </Card>

      <Card title={t("Profit lock & rest")}>
        <p className="mb-4 text-sm text-muted-foreground">{t("Banks floating profit automatically: closes the trade at your dollar target, or when profit falls back after a peak. Then rests before the next trade.")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Close trade at profit ($, 0 = off)")}><Input type="number" min={0} value={s.profit_target_usd} onChange={(e) => num("profit_target_usd", e.target.value)} /></Field>
          <Field label={t("Start protecting profit from ($)")}><Input type="number" min={0} value={s.lock_start_usd} onChange={(e) => num("lock_start_usd", e.target.value)} /></Field>
          <Field label={t("Close if profit falls back from peak (%)")}><Input type="number" min={10} max={90} value={s.giveback_pct} onChange={(e) => num("giveback_pct", e.target.value)} /></Field>
          <Field label={t("Rest after a close (minutes)")}><Input type="number" min={0} max={240} value={s.cooldown_minutes} onChange={(e) => num("cooldown_minutes", e.target.value)} /></Field>
          <Field label={t("Stop for the day after earning ($, 0 = off)")}><Input type="number" min={0} value={s.daily_target_usd} onChange={(e) => num("daily_target_usd", e.target.value)} /></Field>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t("The AI also remembers its last 10 closed gold trades and learns from wins and losses before deciding.")}</p>
        <Button variant="hero" className="mt-4 rounded-full" onClick={() => void save()}>{t("Save settings")}</Button>
      </Card>

      <Card title={t("Activity")}>
        {(events.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{t("No activity yet. The first check runs within 10 minutes after you turn Auto-Pilot on.")}</p> : (
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

const CYCLE = 10 * 60_000;

function LiveMonitor({ enabled, events, accountIds }: { enabled: boolean; events: { action: string; created_at: string }[]; accountIds: string[] }) {
  const t = useT();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const open = useQuery({
    queryKey: ["autopilot-open", accountIds.join(",")], enabled: accountIds.length > 0, refetchInterval: 30_000,
    queryFn: async () => (await supabase.from("trades").select("id", { count: "exact", head: true }).in("account_id", accountIds).eq("status", "open")).count ?? 0,
  });
  const n = now ?? 0;
  const next = Math.ceil((n + 1) / CYCLE) * CYCLE;
  const left = Math.max(0, next - n);
  const mm = String(Math.floor(left / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, "0");
  const pct = now ? 100 - (left / CYCLE) * 100 : 0;
  const scanning = enabled && left > CYCLE - 20_000;
  const dayStart = new Date(n); dayStart.setHours(0, 0, 0, 0);
  const today = events.filter((e) => e.action === "opened" && new Date(e.created_at).getTime() >= dayStart.getTime()).length;
  const last = events[0]?.created_at;
  const r = 54, c = 2 * Math.PI * r;

  return (
    <Card title={t("Live monitor")}>
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <div className="relative h-36 w-36 shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r={r} className="fill-none stroke-muted" strokeWidth="8" />
            <circle cx="60" cy="60" r={r} className={cn("fill-none transition-all duration-1000", enabled ? "stroke-primary" : "stroke-muted-foreground")} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-3xl font-bold tabular-nums" dir="ltr">{now ? `${mm}:${ss}` : "--:--"}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("Scans every 10 minutes")}</span>
          </div>
        </div>
        <div className="w-full flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <span className={cn("relative flex h-3 w-3")}>
              {enabled && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />}
              <span className={cn("relative inline-flex h-3 w-3 rounded-full", enabled ? "bg-success" : "bg-muted-foreground")} />
            </span>
            <span className="text-lg font-semibold">{!enabled ? t("Paused — turn Auto-Pilot on") : scanning ? t("Scanning market now…") : `${t("Next AI scan in")} ${mm}:${ss}`}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={t("Next scan at")} value={now ? new Date(next).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"} />
            <Stat label={t("Last check")} value={last ? timeAgo(last) : t("never")} />
            <Stat label={t("Open trades")} value={String(open.data ?? 0)} />
            <Stat label={t("Auto trades today")} value={String(today)} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-border bg-background/40 px-3 py-2"><div className="text-[11px] text-muted-foreground">{label}</div><div className="font-semibold tabular-nums">{value}</div></div>;
}

function RiskCard({ balance, lot, onApply }: { balance: number; lot: number; onApply: (lot: number) => void }) {
  const t = useT();
  const [pct, setPct] = useState(RISK_RECOMMENDED);
  useEffect(() => { if (balance > 0 && lot > 0) setPct(riskForLot(balance, lot)); }, [balance, lot]);
  const level = riskLevel(pct);
  const newLot = lotForRisk(balance, pct);
  const loss = Math.round(dollarsPerMove(newLot) * TYPICAL_GOLD_STOP);
  const tone = level === "low" ? "text-success" : level === "balanced" ? "text-primary" : "text-destructive";
  return (
    <Card title={t("Risk level")}>
      <div className="flex items-center justify-between text-sm">
        <span className={cn("text-2xl font-bold", tone)}>{pct.toFixed(1)}%</span>
        <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", tone)}>
          {level === "low" ? t("Low") : level === "balanced" ? `${t("Balanced")} ⭐ ${t("Recommended")}` : t("High")}
        </span>
      </div>
      <Slider className="my-5" min={RISK_MIN} max={RISK_MAX} step={0.25} value={[pct]} onValueChange={(v) => setPct(v[0] ?? RISK_RECOMMENDED)} aria-label={t("Risk level")} />
      <div className="flex justify-between text-xs text-muted-foreground"><span>{t("Low")}</span><span className="text-primary">{t("Recommended")} 1–2%</span><span>{t("High")}</span></div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-background/40 p-3"><div className="text-xs text-muted-foreground">{t("Lot size per trade")}</div><b>{newLot.toFixed(2)}</b> <span className="text-xs text-muted-foreground">({t("now")} {lot.toFixed(2)})</span></div>
        <div className="rounded-2xl border border-border bg-background/40 p-3"><div className="text-xs text-muted-foreground">{t("Per $1 gold move")}</div><b>${dollarsPerMove(newLot)}</b></div>
        <div className="rounded-2xl border border-border bg-background/40 p-3"><div className="text-xs text-muted-foreground">{t("Max loss if Stop Loss hits (~$20 move)")}</div><b className="text-destructive">-${loss}</b></div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("Based on balance")} ${balance.toLocaleString()}</p>
      <Button variant="hero" className="mt-4 rounded-full" onClick={() => onApply(newLot)}>{t("Apply risk level")}</Button>
    </Card>
  );
}
