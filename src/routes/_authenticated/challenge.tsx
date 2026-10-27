import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Page } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { useAccounts, isOnline } from "@/lib/trading";
import { challengeProgress, drawdownPct } from "@/lib/challenge";
import { cn } from "@/lib/utils";

const META = "Run a separate auto-trading challenge from $50 toward $1,000,000 with its own hard risk limits.";
export const Route = createFileRoute("/_authenticated/challenge")({
  head: () => ({ meta: [{ title: "$50 to $1M Challenge | Ufuq Trade" }, { name: "description", content: META }, { property: "og:title", content: "$50 to $1M Challenge | Ufuq Trade" }, { property: "og:description", content: META }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Challenge,
});

const money = (n: number | null | undefined) => n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function Challenge() {
  const t = useT();
  const qc = useQueryClient();
  const accounts = useAccounts();
  const [accountId, setAccountId] = useState<string>("");
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const accs = accounts.data ?? [];
  const accId = accountId || accs[0]?.id || "";
  const acc = accs.find((a) => a.id === accId);

  const ch = useQuery({ queryKey: ["challenge", accId], enabled: !!accId, refetchInterval: 15_000, queryFn: async () => (await supabase.from("challenges").select("*").eq("account_id", accId).order("started_at", { ascending: false }).limit(1).maybeSingle()).data });
  const c = ch.data;
  const since = c?.started_at;
  const trades = useQuery({ queryKey: ["challenge-trades", accId, since], enabled: !!since, refetchInterval: 15_000, queryFn: async () => (await supabase.from("trades").select("status,profit,closed_at").eq("account_id", accId).gte("opened_at", since!)).data ?? [] });
  const decisions = useQuery({ queryKey: ["challenge-dec", accId, since], enabled: !!since, refetchInterval: 30_000, queryFn: async () => (await supabase.from("decision_log").select("created_at,symbol,ai_direction,ai_confidence,risk_verdict,risk_reason").eq("account_id", accId).gte("created_at", since!).order("created_at", { ascending: false }).limit(30)).data ?? [] });

  const active = c && (c.status === "running" || c.status === "paused");
  const equity = acc?.equity ?? acc?.balance ?? null;
  const closed = (trades.data ?? []).filter((x) => x.status === "closed");
  const open = (trades.data ?? []).filter((x) => x.status === "open");
  const wins = closed.filter((x) => Number(x.profit) > 0), losses = closed.filter((x) => Number(x.profit) <= 0);
  const realized = closed.reduce((s, x) => s + Number(x.profit ?? 0), 0);
  const unrealized = open.reduce((s, x) => s + Number(x.profit ?? 0), 0);
  const avg = (a: typeof closed) => a.length ? a.reduce((s, x) => s + Number(x.profit ?? 0), 0) / a.length : 0;
  const online = acc ? isOnline(acc) : false;
  const looksDemo = /demo/i.test(`${acc?.server ?? ""} ${acc?.broker_name ?? ""}`);

  const act = async (fn: () => Promise<unknown>, note: string) => {
    setBusy(true); setMsg("");
    try { await fn(); setMsg(t(note)); } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); qc.invalidateQueries({ queryKey: ["challenge"] }); }
  };
  const check = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };
  const userId = async () => (await supabase.auth.getUser()).data.user!.id;

  const start = () => act(async () => {
    if (!acc) throw new Error(t("Pick an account first"));
    if (!online) throw new Error(t("The EA on this account is not connected right now"));
    if (equity == null || equity <= 0) throw new Error(t("Account balance is not known yet"));
    if (mode === "live" && !confirm(t("Live mode trades real money and you can lose all of it. Continue?"))) throw new Error(t("Cancelled"));
    if (mode === "demo" && !looksDemo && !confirm(t("This account does not look like a demo account. Continue anyway?"))) throw new Error(t("Cancelled"));
    check(await supabase.from("challenges").insert({ user_id: await userId(), account_id: acc.id, mode, start_balance: equity, peak_balance: equity, floor_balance: Math.max(1, Math.round(equity * 0.2)) }));
    check(await supabase.from("trading_accounts").update({ auto_trading: true }).eq("id", acc.id));
  }, "Challenge started. Auto-Pilot will look for trades every cycle.");
  const setStatus = (status: string, note: string, extra: Record<string, unknown> = {}) => act(async () => {
    check(await supabase.from("challenges").update({ status, updated_at: new Date().toISOString(), ...extra }).eq("id", c!.id));
  }, note);
  const closeAll = async () => check(await supabase.from("trade_commands").insert({ user_id: await userId(), account_id: accId, command: "close_all", payload: { challenge: true } }));
  const emergency = () => act(async () => {
    if (!confirm(t("Stop the challenge and close all open trades now?"))) throw new Error(t("Cancelled"));
    check(await supabase.from("challenges").update({ status: "stopped", stop_reason: "Emergency stop", ended_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", c!.id));
    check(await supabase.from("trading_accounts").update({ auto_trading: false }).eq("id", accId));
    await closeAll();
  }, "Emergency stop sent. Trades will close on the next EA sync.");

  return (
    <Page title={t("$50 to $1,000,000 Challenge")}>
      <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
        {t("High risk: each trade may risk up to 10% of the account and the challenge stops automatically at the floor (20% of the start). No profit is guaranteed.")}
      </div>

      <section className="mt-4 grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-4">
        <label className="text-sm md:col-span-2">{t("Account")}
          <select className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2" value={accId} onChange={(e) => setAccountId(e.target.value)}>
            {accs.map((a) => <option key={a.id} value={a.id}>{a.login} · {a.server ?? a.broker_name ?? ""}</option>)}
          </select>
        </label>
        <label className="text-sm">{t("Mode")}
          <select className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2" value={mode} disabled={!!active} onChange={(e) => setMode(e.target.value as "demo" | "live")}>
            <option value="demo">{t("Demo")}</option><option value="live">{t("Live (real money)")}</option>
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-2">
          {!active && <Button disabled={busy || !acc} onClick={start}>{t("Start challenge")}</Button>}
          {c?.status === "running" && <Button variant="outline" disabled={busy} onClick={() => setStatus("paused", "Paused. No new trades; open trades stay protected.")}>{t("Pause")}</Button>}
          {c?.status === "paused" && <Button disabled={busy} onClick={() => setStatus("running", "Resumed.")}>{t("Resume")}</Button>}
          {active && <Button variant="outline" disabled={busy} onClick={() => act(closeAll, "Close-all sent to the EA.")}>{t("Close open trades")}</Button>}
          {active && <Button variant="destructive" disabled={busy} onClick={emergency}>{t("Emergency stop")}</Button>}
        </div>
        {msg && <p className="text-sm text-muted-foreground md:col-span-4">{msg}</p>}
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("Status")} value={c ? t(c.status) : t("Not started")} />
        <Stat label={t("EA connection")} value={online ? t("Connected") : t("Not connected")} tone={online ? "up" : "down"} />
        <Stat label={t("Start balance")} value={money(c?.start_balance)} />
        <Stat label={t("Current equity")} value={money(equity)} />
        <Stat label={t("Realized P/L")} value={money(realized)} tone={realized >= 0 ? "up" : "down"} />
        <Stat label={t("Unrealized P/L")} value={money(unrealized)} tone={unrealized >= 0 ? "up" : "down"} />
        <Stat label={t("Progress to $1M")} value={c && equity ? `${challengeProgress(Number(c.start_balance), equity, Number(c.target_balance)).toFixed(1)}%` : "—"} />
        <Stat label={t("Peak / drawdown")} value={c && equity ? `${money(c.peak_balance)} · ${drawdownPct(Number(c.peak_balance), equity).toFixed(1)}%` : "—"} />
        <Stat label={t("Wins / losses")} value={`${wins.length} / ${losses.length}`} />
        <Stat label={t("Win rate")} value={closed.length ? `${Math.round((wins.length / closed.length) * 100)}%` : "—"} />
        <Stat label={t("Avg win / avg loss")} value={`${money(avg(wins))} / ${money(avg(losses))}`} />
        <Stat label={t("Floor (auto stop)")} value={c ? `${money(c.floor_balance)} · ${t("max risk")} ${c.max_risk_pct}%` : "—"} />
      </section>
      {c?.stop_reason && <p className="mt-3 text-sm text-muted-foreground">{t("Ended")}: {c.stop_reason}</p>}
      {c?.last_cycle_at && <p className="mt-1 text-xs text-muted-foreground">{t("Last engine cycle")}: {new Date(c.last_cycle_at).toLocaleString()}</p>}

      <section className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
        <h2 className="p-4 font-semibold">{t("AI decisions in this challenge")}</h2>
        <table className="w-full text-sm">
          <tbody>
            {(decisions.data ?? []).map((d, i) => (
              <tr key={i} className="border-t border-border">
                <td className="p-3 whitespace-nowrap">{new Date(d.created_at).toLocaleString()}</td>
                <td className="p-3">{d.symbol} {d.ai_direction?.toUpperCase()} {d.ai_confidence}%</td>
                <td className={cn("p-3", d.risk_verdict === "approved" ? "text-success" : "text-muted-foreground")}>{d.risk_reason}</td>
              </tr>
            ))}
            {!decisions.data?.length && <tr><td className="p-4 text-muted-foreground">{t("No decisions yet.")}</td></tr>}
          </tbody>
        </table>
      </section>
    </Page>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold", tone === "up" && "text-success", tone === "down" && "text-destructive")}>{value}</div>
    </div>
  );
}
