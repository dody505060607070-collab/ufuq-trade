import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Page } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { HelpNote, useT } from "@/lib/i18n";
import { applyLab, resetScalpParams, runLab } from "@/lib/lab.functions";
import { pctl, type LabResult, type ScalpParams, type SimStats } from "@/lib/scalp";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/lab")({
  head: () => ({
    meta: [
      { title: "Fast Scalping & Evolution Lab | Ufuq Trade" },
      { name: "description", content: "Live results of the robot's fast scalping, real execution timings, and evolution tests against random strategies." },
      { property: "og:title", content: "Fast Scalping & Evolution Lab | Ufuq Trade" },
      { property: "og:description", content: "Live results of the robot's fast scalping, real execution timings, and evolution tests against random strategies." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Lab,
});

const DAYS = 4;
const SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD"] as const;
const card = "rounded-2xl border border-border bg-card/60 p-4";

function Lab() {
  const t = useT();
  return (
    <Page wide title={t("Fast Scalping & Evolution Lab")} subtitle={t("Real results only: live scalps, execution timings and lab tests.")}>
      <HelpNote>{"Fast scalping runs inside robot 1.60 on each account you switch it on for (Settings > MT5 EA Configuration). The Lab tests the same rule on the last 7 days of 1-minute prices and compares it with 1,000 random strategies. A lab result is research, not a promise of profit."}</HelpNote>
      <LiveScalps />
      <ExecTimings />
      <EvolutionLab />
    </Page>
  );
}

function LiveScalps() {
  const t = useT();
  const q = useQuery({
    queryKey: ["lab-scalps"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
      const [{ data: trades }, { data: accs }] = await Promise.all([
        supabase.from("trades").select("account_id,symbol,side,profit,opened_at,closed_at,status,exit_reason").eq("strategy", "scalp").gte("opened_at", since).order("opened_at", { ascending: false }).limit(500),
        supabase.from("trading_accounts").select("id,login,fast_scalp,ai_provider,ea_version"),
      ]);
      return { trades: trades ?? [], accs: accs ?? [] };
    },
  });
  const accs = q.data?.accs ?? [];
  return (
    <section className={cn(card, "mt-4")}>
      <h2 className="font-semibold">{t("Live fast scalps (last {n} days)", { n: DAYS })}</h2>
      {!accs.length && <p className="mt-2 text-sm text-muted-foreground">{t("No connected account yet.")}</p>}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {accs.map((a) => {
          const mine = (q.data?.trades ?? []).filter((x) => x.account_id === a.id);
          const closed = mine.filter((x) => x.status === "closed");
          const net = closed.reduce((s, x) => s + Number(x.profit ?? 0), 0);
          const wins = closed.filter((x) => Number(x.profit ?? 0) > 0).length;
          const durs = closed.filter((x) => x.opened_at && x.closed_at).map((x) => (new Date(x.closed_at!).getTime() - new Date(x.opened_at!).getTime()) / 1000);
          const reasons = closed.reduce<Record<string, number>>((m, x) => ((m[x.exit_reason ?? "?"] = (m[x.exit_reason ?? "?"] ?? 0) + 1), m), {});
          return (
            <div key={a.id} className="rounded-xl bg-background/60 p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold">#{a.login} <span className="text-xs text-muted-foreground">{a.ai_provider === "openai" ? "ChatGPT" : "Gemini"}</span></p>
                <span className={cn("rounded-full px-2 py-0.5 text-xs", a.fast_scalp ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{a.fast_scalp ? t("Scalping ON") : t("Scalping OFF")}</span>
              </div>
              {a.fast_scalp && a.ea_version && Number(a.ea_version) < 1.6 && <p className="mt-1 text-xs text-warning">{t("Robot {v} is installed — install 1.60 to scalp.", { v: a.ea_version })}</p>}
              {!closed.length && !mine.length ? <p className="mt-2 text-xs text-muted-foreground">{t("No scalp yet.")}</p> : (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">{t("Closed scalps")}</dt><dd>{closed.length} ({mine.length - closed.length} {t("open")})</dd>
                  <dt className="text-muted-foreground">{t("Net result")}</dt><dd className={net >= 0 ? "text-success" : "text-destructive"}>{net >= 0 ? "+" : ""}{net.toFixed(2)}$</dd>
                  <dt className="text-muted-foreground">{t("Winning")}</dt><dd>{closed.length ? Math.round((wins / closed.length) * 100) : 0}%</dd>
                  <dt className="text-muted-foreground">{t("Median duration")}</dt><dd>{durs.length ? `${Math.round(pctl(durs, 50)!)}s` : "—"}</dd>
                  <dt className="text-muted-foreground">{t("How they closed")}</dt><dd>{Object.entries(reasons).map(([k, v]) => `${t(EXIT[k] ?? k)} ${v}`).join(" · ") || "—"}</dd>
                </dl>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const EXIT: Record<string, string> = { tp: "target", sl: "stop", ea: "robot", manual: "manual", stop_out: "stop-out" };
const KIND: Record<string, string> = { open: "Open (platform)", open_fail: "Open failed", close: "Close confirmed", close_fail: "Close failed", closed: "Closed at broker", scalp_open: "Scalp open", scalp_open_fail: "Scalp open failed", scalp_closed: "Scalp closed", sync: "Website sync", protect_1r: "1R protection" };

function ExecTimings() {
  const t = useT();
  const q = useQuery({
    queryKey: ["lab-exec"],
    refetchInterval: 60_000,
    queryFn: async () => (await supabase.from("ea_exec_events").select("kind,ms,ok").gte("created_at", new Date(Date.now() - DAYS * 86400_000).toISOString()).order("created_at", { ascending: false }).limit(2000)).data ?? [],
  });
  const rows = q.data ?? [];
  const kinds = [...new Set(rows.map((r) => r.kind))];
  return (
    <section className={cn(card, "mt-4")}>
      <h2 className="font-semibold">{t("Execution timings (robot 1.60)")}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("Measured inside MT5: from sending the order to the broker's answer. Sync = one round trip to the website.")}</p>
      {!rows.length ? <p className="mt-3 text-sm text-muted-foreground">{t("No timings yet — they appear after robot 1.60 is installed.")}</p> : (
        <table className="mt-3 w-full text-xs">
          <thead className="text-muted-foreground"><tr><th className="text-start font-medium">{t("Step")}</th><th className="text-end font-medium">{t("Count")}</th><th className="text-end font-medium">p50</th><th className="text-end font-medium">p95</th><th className="text-end font-medium">{t("Failed")}</th></tr></thead>
          <tbody>
            {kinds.map((k) => {
              const ms = rows.filter((r) => r.kind === k && r.ms != null && r.ms >= 0).map((r) => Number(r.ms));
              const n = rows.filter((r) => r.kind === k).length, bad = rows.filter((r) => r.kind === k && !r.ok).length;
              return (
                <tr key={k} className="border-t border-border/50">
                  <td className="py-1">{t(KIND[k] ?? k)}</td><td className="text-end">{n}</td>
                  <td className="text-end">{ms.length ? `${pctl(ms, 50)} ms` : "—"}</td><td className="text-end">{ms.length ? `${pctl(ms, 95)} ms` : "—"}</td>
                  <td className={cn("text-end", bad ? "text-destructive" : "")}>{bad}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

type Run = { id: string; symbol: string; status: string; error: string | null; applied: boolean; created_at: string; result: (LabResult & { spread_source?: string }) | null };

function EvolutionLab() {
  const t = useT();
  const qc = useQueryClient();
  const run = useServerFn(runLab), apply = useServerFn(applyLab), reset = useServerFn(resetScalpParams);
  const [busy, setBusy] = useState<string | null>(null);
  const runs = useQuery({
    queryKey: ["lab-runs"],
    refetchInterval: busy ? 5000 : 60_000,
    queryFn: async () => ((await supabase.from("lab_runs").select("id,symbol,status,error,applied,created_at,result").order("created_at", { ascending: false }).limit(10)).data ?? []) as unknown as Run[],
  });
  const admin = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => { const { data: u } = await supabase.auth.getUser(); if (!u.user) return false; return !!(await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" })).data; },
  });
  const go = async (symbol: (typeof SYMBOLS)[number]) => {
    setBusy(symbol);
    try { await run({ data: { symbol } }); toast.success(t("Lab run finished.")); }
    catch (e) { toast.error(e instanceof Error ? e.message : t("Lab run failed.")); }
    finally { setBusy(null); void qc.invalidateQueries({ queryKey: ["lab-runs"] }); }
  };
  return (
    <section className={cn(card, "mt-4")}>
      <h2 className="font-semibold">{t("Evolution Lab")}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("40 versions of the scalping rule evolve for 15 generations on the first 60% of the week, the best is chosen on the next 20%, then tested once on the last 20% against 1,000 random strategies with the same stop, target and costs.")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SYMBOLS.map((s) => <Button key={s} size="sm" className="rounded-full" disabled={!!busy} onClick={() => go(s)}>{busy === s ? t("Running…") : t("Run lab on {s}", { s })}</Button>)}
        {admin.data && <Button size="sm" variant="ghost" className="rounded-full" onClick={async () => { await reset(); toast.success(t("Scalping back to default settings.")); }}>{t("Reset scalping to defaults")}</Button>}
      </div>
      {!runs.data?.length && <p className="mt-3 text-sm text-muted-foreground">{t("No lab run yet.")}</p>}
      <div className="mt-3 space-y-3">
        {(runs.data ?? []).map((r) => <RunCard key={r.id} r={r} admin={!!admin.data} onApply={async () => { try { await apply({ data: { id: r.id } }); toast.success(t("Settings sent to the robots.")); void qc.invalidateQueries({ queryKey: ["lab-runs"] }); } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); } }} />)}
      </div>
    </section>
  );
}

function StatLine({ label, s }: { label: string; s: SimStats }) {
  const t = useT();
  return <tr className="border-t border-border/50"><td className="py-1">{t(label)}</td><td className="text-end">{s.trades}</td><td className="text-end">{Math.round(s.win_rate * 100)}%</td><td className={cn("text-end", s.net_r >= 0 ? "text-success" : "text-destructive")}>{s.net_r >= 0 ? "+" : ""}{s.net_r}R</td><td className="text-end">{s.max_dd_r}R</td><td className="text-end">{s.avg_bars}</td></tr>;
}

const paramText = (p: ScalpParams) => `N=${p.lookback} · ATR${p.atrLen} · stop ${p.slAtr}×ATR · R ${p.rr} · ${p.holdBars} min · EMA${p.emaLen}`;

function RunCard({ r, admin, onApply }: { r: Run; admin: boolean; onApply: () => void }) {
  const t = useT();
  const x = r.result;
  return (
    <div className="rounded-xl bg-background/60 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{r.symbol} <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span></p>
        <span className={cn("rounded-full px-2 py-0.5 text-xs", r.status === "completed" ? (x?.verdict === "passed" ? "bg-success/15 text-success" : "bg-warning/15 text-warning") : r.status === "failed" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground")}>
          {r.status === "completed" ? (x?.verdict === "passed" ? t("Passed first test") : t("Not proven")) : t(r.status === "failed" ? "Failed" : "Running")}
        </span>
      </div>
      {r.error && <p className="mt-1 text-xs text-destructive">{r.error}</p>}
      {x && (
        <>
          <p className="mt-1 text-xs text-muted-foreground">{t("{n} one-minute bars, {e} versions tested, spread {s} ({src}).", { n: x.bars, e: x.evaluations, s: x.spread, src: t(x.spread_source === "broker" ? "broker" : "estimate") })}</p>
          <table className="mt-2 w-full text-xs">
            <thead className="text-muted-foreground"><tr><th className="text-start font-medium">{t("Part")}</th><th className="text-end font-medium">{t("Trades")}</th><th className="text-end font-medium">{t("Winning")}</th><th className="text-end font-medium">{t("Net")}</th><th className="text-end font-medium">{t("Drawdown")}</th><th className="text-end font-medium">{t("Avg min")}</th></tr></thead>
            <tbody>
              <StatLine label="Best version — learning part" s={x.chosen_train} />
              <StatLine label="Best version — choosing part" s={x.chosen_val} />
              <StatLine label="Best version — final test" s={x.chosen_test} />
              <StatLine label="Current robot settings — final test" s={x.current_test} />
            </tbody>
          </table>
          <p className="mt-2 text-xs">{t("Random strategies on the final test: median {a}R, top 5% from {b}R. The best version beat {c}% of them.", { a: x.random.p50, b: x.random.p95, c: x.random.beaten_pct })}</p>
          {x.verdict_reasons.length > 0 && <p className="mt-1 text-xs text-warning">{t("Why not proven:")} {x.verdict_reasons.map((w) => t(w.replace(/\d+(\.\d+)?/g, "#"), {})).join(" · ")} <span className="text-muted-foreground">({x.verdict_reasons.join("; ")})</span></p>}
          <p className="mt-1 text-xs text-muted-foreground">{t("Best version")}: {paramText(x.chosen)}</p>
          <p className="text-xs text-muted-foreground">{t("Current robot")}: {paramText(x.current)}</p>
          {admin && r.status === "completed" && (r.applied ? <p className="mt-2 text-xs text-success">{t("These settings were sent to the robots.")}</p> : <Button size="sm" variant="secondary" className="mt-2 rounded-full" onClick={onApply}>{t("Use these settings for fast scalping")}</Button>)}
        </>
      )}
    </div>
  );
}
