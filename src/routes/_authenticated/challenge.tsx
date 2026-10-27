import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Page } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { challengeProgress, drawdownPct } from "@/lib/challenge";
import { emergencyStopSim } from "@/lib/sim.functions";
import { cn } from "@/lib/utils";

const TITLE = "$100 to $1M Multi-Asset Demo Challenge | Ufuq Trade";
const META = "A free paper-trading challenge: three AI agents scan gold, silver, forex, crypto, indices and oil and trade a virtual $100 toward $1,000,000. No real orders.";
export const Route = createFileRoute("/_authenticated/challenge")({
  head: () => ({ meta: [{ title: TITLE }, { name: "description", content: META }, { property: "og:title", content: TITLE }, { property: "og:description", content: META }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Challenge,
});

const money = (n: number | null | undefined) => n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
type ScanRow = { symbol: string; status: string; price: number | null; src: string; score?: number; direction?: string | null; tradeTf?: string; trends?: Record<string, string | null>; reason: string };
type LastScan = { started_at: string; ended_at: string; assets: ScanRow[]; agents: Record<string, string> };

function Challenge() {
  const t = useT();
  const qc = useQueryClient();
  const stopFn = useServerFn(emergencyStopSim);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const ch = useQuery({ queryKey: ["sim"], refetchInterval: 15_000, queryFn: async () => (await supabase.from("sim_challenges").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle()).data });
  const c = ch.data;
  const trades = useQuery({ queryKey: ["sim-trades", c?.id], enabled: !!c, refetchInterval: 15_000, queryFn: async () => (await supabase.from("sim_trades").select("*").eq("challenge_id", c!.id).order("opened_at", { ascending: false }).limit(300)).data ?? [] });
  const events = useQuery({ queryKey: ["sim-events", c?.id], enabled: !!c, refetchInterval: 15_000, queryFn: async () => (await supabase.from("sim_events").select("*").eq("challenge_id", c!.id).order("created_at", { ascending: false }).limit(60)).data ?? [] });
  const decisions = useQuery({ queryKey: ["sim-dec", c?.id], enabled: !!c, refetchInterval: 30_000, queryFn: async () => (await supabase.from("sim_decisions").select("id,symbol,timeframe,direction,outcome,scanner_score,reviewer,supervisor,created_at").eq("challenge_id", c!.id).order("created_at", { ascending: false }).limit(500)).data ?? [] });

  const active = c && (c.status === "running" || c.status === "paused");
  const all = trades.data ?? [];
  const closed = all.filter((x) => x.status === "closed"), open = all.filter((x) => x.status === "open");
  const unreal = open.reduce((s, x) => s + Number(x.float_pnl ?? 0), 0);
  const balance = Number(c?.balance ?? 0), equity = balance + unreal;
  const used = open.reduce((s, x) => s + Number(x.margin), 0);
  const realized = closed.reduce((s, x) => s + Number(x.profit ?? 0), 0);
  const wins = closed.filter((x) => Number(x.profit) > 0), losses = closed.filter((x) => Number(x.profit) <= 0);
  const avg = (a: typeof closed) => a.length ? a.reduce((s, x) => s + Number(x.profit ?? 0), 0) / a.length : 0;
  const winRate = closed.length ? (wins.length / closed.length) * 100 : null;
  const avgConf = closed.length ? closed.reduce((s, x) => s + Number(x.confidence ?? 0), 0) / closed.length : null;
  const scan = (c?.last_scan ?? null) as unknown as LastScan | null;
  const dec = decisions.data ?? [];
  const count = (o: string) => dec.filter((d) => d.outcome === o).length;
  const lastCycle = c?.last_cycle_at ? new Date(c.last_cycle_at) : null;
  const late = lastCycle ? Date.now() - lastCycle.getTime() > 12 * 60_000 : false;

  const groups = (key: (x: (typeof closed)[number]) => string) => {
    const m = new Map<string, { n: number; w: number; p: number }>();
    for (const x of closed) { const k = key(x); const g = m.get(k) ?? { n: 0, w: 0, p: 0 }; g.n++; if (Number(x.profit) > 0) g.w++; g.p += Number(x.profit ?? 0); m.set(k, g); }
    return [...m.entries()];
  };

  const act = async (fn: () => Promise<{ error: { message: string } | null }>, note: string) => {
    setBusy(true); setMsg("");
    try { const r = await fn(); if (r.error) throw new Error(r.error.message); setMsg(t(note)); } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); qc.invalidateQueries(); }
  };
  const start = () => act(async () => supabase.from("sim_challenges").insert({ user_id: (await supabase.auth.getUser()).data.user!.id }), "Demo challenge started with $100 virtual. The bot scans all markets every 5 minutes in the background.");
  const setStatus = (status: "running" | "paused", note: string) => act(async () => supabase.from("sim_challenges").update({ status, updated_at: new Date().toISOString() }).eq("id", c!.id), note);
  const stop = () => act(async () => { try { const r = await stopFn({ data: { id: c!.id } }); setMsg(`${t("Emergency stop done. Demo trades closed")}: ${r.closed}`); return { error: null }; } catch (e) { return { error: { message: (e as Error).message } }; } }, "Emergency stop done.");

  return (
    <Page title={t("$100 to $1,000,000 — Free Demo Challenge")}>
      <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
        {t("Virtual money only: the $100 is not real, cannot be withdrawn, and no orders are sent to any real account. Results are simulated and do not guarantee real profit.")}
      </div>

      <section className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
        {!active && <Button disabled={busy} onClick={start}>{t("Start challenge")}</Button>}
        {c?.status === "running" && <Button variant="outline" disabled={busy} onClick={() => setStatus("paused", "Paused. No new trades; open trades keep their stop and target.")}>{t("Pause")}</Button>}
        {c?.status === "paused" && <Button disabled={busy} onClick={() => setStatus("running", "Resumed.")}>{t("Resume")}</Button>}
        {active && <Button variant="destructive" disabled={busy} onClick={() => confirm(t("Stop the challenge and close all demo trades now?")) && stop()}>{t("Emergency stop")}</Button>}
        {msg && <p className="w-full text-sm text-muted-foreground">{msg}</p>}
      </section>

      {c && (c.consecutive_failures > 0 || c.last_error) && <p className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">{t("Last engine error")}: {c.last_error} {c.last_error_at ? `(${new Date(c.last_error_at).toLocaleString()})` : ""} · {t("failed cycles in a row")}: {c.consecutive_failures}. {t("The next scheduled cycle retries automatically.")}</p>}
      {c?.last_success_at && <p className="mt-2 text-xs text-muted-foreground">{t("Last successful cycle")}: {new Date(c.last_success_at).toLocaleString()}</p>}
      {active && late && <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{t("The background engine has not run for more than 12 minutes. The bot is NOT trading right now.")}</p>}

      <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("Status")} value={c ? t(c.status) : t("Not started")} />
        <Stat label={t("Start balance / target")} value={c ? `${money(c.start_balance)} → ${money(c.target_balance)}` : "$100 → $1,000,000"} />
        <Stat label={t("Equity (virtual)")} value={c ? money(equity) : "—"} sub={c ? `${t("Progress")} ${challengeProgress(Number(c.start_balance), equity, Number(c.target_balance)).toFixed(1)}%` : undefined} />
        <Stat label={t("Peak / drawdown")} value={c ? `${money(c.peak_equity)} · ${drawdownPct(Number(c.peak_equity), equity).toFixed(1)}%` : "—"} sub={c ? `${t("limit")} ${c.max_drawdown_pct}%` : undefined} />
        <Stat label={t("Realized P/L")} value={money(realized)} tone={realized >= 0 ? "up" : "down"} />
        <Stat label={t("Unrealized P/L")} value={money(unreal)} tone={unreal >= 0 ? "up" : "down"} />
        <Stat label={t("Used / free margin")} value={`${money(used)} / ${money(equity - used)}`} sub={t("stop-out at 50%")} />
        <Stat label={t("Fees paid")} value={money(c?.fees_paid)} />
        <Stat label={t("Wins / losses")} value={`${wins.length} / ${losses.length}`} />
        <Stat label={t("Actual win rate vs AI confidence")} value={winRate == null ? "—" : `${winRate.toFixed(0)}% vs ${avgConf?.toFixed(0)}%`} sub={t("Confidence is the AI's estimate, not a result")} />
        <Stat label={t("Avg win / avg loss")} value={`${money(avg(wins))} / ${money(avg(losses))}`} />
        <Stat label={t("Opportunities scanned")} value={c ? String(c.scanned) : "—"} sub={c ? `${c.cycles} ${t("cycles")}` : undefined} />
      </section>
      {c && <p className="mt-2 text-xs text-muted-foreground">{t("Risk limits")}: {c.max_risk_pct}% {t("per trade")} · {c.max_total_risk_pct}% {t("total open")} · {c.max_daily_loss_pct}% {t("daily loss")} · {c.max_drawdown_pct}% {t("max drawdown")} · {c.max_open_trades} {t("max open trades")}</p>}
      {c?.stop_reason && <p className="mt-2 text-sm text-muted-foreground">{t("Note")}: {t(c.stop_reason)}</p>}
      {lastCycle && <p className="mt-1 text-xs text-muted-foreground">{t("Last engine cycle")}: {lastCycle.toLocaleString()} · {t("next in about")} {Math.max(0, Math.ceil((lastCycle.getTime() + 5 * 60_000 - Date.now()) / 60_000))} {t("min")}</p>}

      <section className="mt-6 grid gap-3 md:grid-cols-3">
        {([["Agent 1 — Opportunity Scanner", "scanner", "rejected_scanner", "Code scan of M5–D1 on every asset + Gemini proposal. Cannot execute."], ["Agent 2 — Independent Reviewer", "reviewer", "rejected_reviewer", "Separate Gemini call that tries to disprove the trade."], ["Agent 3 — Risk & Execution Supervisor", "supervisor", "rejected_supervisor", "Deterministic risk code: sizing, leverage, margin, exposure. Final veto."]] as const).map(([name, k, rej, desc]) => (
          <div key={k} className="rounded-xl border border-border bg-card p-4">
            <div className="font-semibold">{t(name)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t(desc)}</div>
            <div className="mt-2 text-sm">{t("Last state")}: {scan?.agents?.[k] ?? "—"}</div>
            <div className="text-sm">{t("Rejected")}: {count(rej)}</div>
          </div>
        ))}
      </section>
      <p className="mt-2 text-xs text-muted-foreground">{t("Agents 1 and 2 are two separate calls to the same Gemini model with different roles; Agent 3 is code, not AI.")} {t("Opened")}: {count("opened")}</p>

      <section className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
        <h2 className="p-4 font-semibold">{t("Markets scanned last cycle")}</h2>
        <table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="p-2 text-start">{t("Asset")}</th><th className="p-2 text-start">{t("Price / source")}</th><th className="p-2 text-start">M5 M15 M30 H1 H4 D1</th><th className="p-2 text-start">{t("Score")}</th><th className="p-2 text-start">{t("Reason")}</th></tr></thead><tbody>
          {(scan?.assets ?? []).map((a) => (
            <tr key={a.symbol} className={cn("border-t border-border", a.status === "excluded" && "text-muted-foreground")}>
              <td className="p-2 font-medium">{a.symbol}</td>
              <td className="p-2 whitespace-nowrap">{a.price ?? "—"} <span className="text-xs text-muted-foreground">{a.src}</span></td>
              <td className="p-2 whitespace-nowrap font-mono text-xs">{a.trends ? ["M5", "M15", "M30", "H1", "H4", "D1"].map((k) => (a.trends![k] === "up" ? "▲" : a.trends![k] === "down" ? "▼" : a.trends![k] === "range" ? "■" : "·")).join("   ") : "—"}</td>
              <td className="p-2">{a.score != null ? `${a.score}${a.direction ? ` ${a.direction.toUpperCase()} ${a.tradeTf}` : ""}` : "—"}</td>
              <td className="p-2 text-xs">{a.reason}</td>
            </tr>
          ))}
          {!scan && <tr><td className="p-4 text-muted-foreground">{t("No scan yet.")}</td></tr>}
        </tbody></table>
      </section>

      <section className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
        <h2 className="p-4 font-semibold">{t("Demo trades")}</h2>
        <table className="w-full text-sm"><tbody>
          {all.map((x) => (
            <tr key={x.id} className="border-t border-border">
              <td className="p-3 whitespace-nowrap">{new Date(x.opened_at).toLocaleString()}</td>
              <td className="p-3 whitespace-nowrap">{x.symbol} {x.timeframe ?? ""} {x.side.toUpperCase()} {x.lot} @ {Number(x.entry)}</td>
              <td className="p-3 whitespace-nowrap">SL {Number(x.stop_loss).toPrecision(6)} · TP {Number(x.take_profit).toPrecision(6)}</td>
              <td className="p-3 whitespace-nowrap">1:{x.leverage ?? "—"} · {t("margin")} {money(x.margin)} · {t("risk")} {money(x.risk_usd)}</td>
              <td className={cn("p-3 whitespace-nowrap", Number(x.profit ?? x.float_pnl) > 0 ? "text-success" : Number(x.profit ?? x.float_pnl) < 0 ? "text-destructive" : "")}>{x.status === "open" ? `${t("open")} ${money(x.float_pnl)}` : `${money(x.profit)} · ${x.close_reason}`}</td>
            </tr>
          ))}
          {!all.length && <tr><td className="p-4 text-muted-foreground">{t("No demo trades yet.")}</td></tr>}
        </tbody></table>
      </section>

      {closed.length > 0 && (
        <section className="mt-6 grid gap-3 md:grid-cols-3">
          {([["By asset", (x: (typeof closed)[number]) => x.symbol], ["By timeframe", (x: (typeof closed)[number]) => x.timeframe ?? "—"], ["By leverage", (x: (typeof closed)[number]) => `1:${x.leverage ?? "—"}`]] as const).map(([label, fn]) => (
            <div key={label} className="rounded-xl border border-border bg-card p-4 text-sm">
              <div className="mb-2 font-semibold">{t(label)}</div>
              {groups(fn).map(([k, g]) => <div key={k} className="flex justify-between"><span>{k}</span><span>{g.w}/{g.n} · {money(g.p)}</span></div>)}
            </div>
          ))}
        </section>
      )}

      <section className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
        <h2 className="p-4 font-semibold">{t("Bot decisions")}</h2>
        <table className="w-full text-sm"><tbody>
          {(events.data ?? []).map((e) => (
            <tr key={e.id} className="border-t border-border">
              <td className="p-3 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
              <td className="p-3">{t(e.action)}</td>
              <td className="p-3 text-muted-foreground">{e.detail}</td>
            </tr>
          ))}
          {!events.data?.length && <tr><td className="p-4 text-muted-foreground">{t("No decisions yet.")}</td></tr>}
        </tbody></table>
      </section>
    </Page>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: "up" | "down" | undefined; sub?: string | undefined }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold", tone === "up" && "text-success", tone === "down" && "text-destructive")}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
