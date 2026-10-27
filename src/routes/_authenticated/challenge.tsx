import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Page } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { challengeProgress, drawdownPct, costsFor, fillPrice, pnl, type SimTrade } from "@/lib/challenge";
import { cn } from "@/lib/utils";

const TITLE = "$100 to $1M Free Demo Challenge | Ufuq Trade";
const META = "A free paper-trading challenge: the AI trades a virtual $100 toward $1,000,000 on live prices. No real money, no real orders.";
export const Route = createFileRoute("/_authenticated/challenge")({
  head: () => ({ meta: [{ title: TITLE }, { name: "description", content: META }, { property: "og:title", content: TITLE }, { property: "og:description", content: META }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Challenge,
});

const money = (n: number | null | undefined) => n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function Challenge() {
  const t = useT();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const ch = useQuery({ queryKey: ["sim"], refetchInterval: 15_000, queryFn: async () => (await supabase.from("sim_challenges").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle()).data });
  const c = ch.data;
  const trades = useQuery({ queryKey: ["sim-trades", c?.id], enabled: !!c, refetchInterval: 15_000, queryFn: async () => (await supabase.from("sim_trades").select("*").eq("challenge_id", c!.id).order("opened_at", { ascending: false }).limit(200)).data ?? [] });
  const events = useQuery({ queryKey: ["sim-events", c?.id], enabled: !!c, refetchInterval: 15_000, queryFn: async () => (await supabase.from("sim_events").select("*").eq("challenge_id", c!.id).order("created_at", { ascending: false }).limit(40)).data ?? [] });

  const active = c && (c.status === "running" || c.status === "paused");
  const all = trades.data ?? [];
  const closed = all.filter((x) => x.status === "closed"), open = all.filter((x) => x.status === "open");
  const costs = costsFor(c?.symbol ?? "XAUUSD");
  const unreal = c?.last_price ? open.reduce((s, x) => s + pnl(x as unknown as SimTrade, fillPrice(x.side as "buy" | "sell", Number(c.last_price), costs, true), costs), 0) : 0;
  const balance = Number(c?.balance ?? 0), equity = balance + unreal;
  const used = open.reduce((s, x) => s + Number(x.margin), 0);
  const realized = closed.reduce((s, x) => s + Number(x.profit ?? 0), 0);
  const wins = closed.filter((x) => Number(x.profit) > 0), losses = closed.filter((x) => Number(x.profit) <= 0);
  const avg = (a: typeof closed) => a.length ? a.reduce((s, x) => s + Number(x.profit ?? 0), 0) / a.length : 0;
  const priceAge = c?.last_price_at ? (Date.now() - new Date(c.last_price_at).getTime()) / 60_000 : null;

  const act = async (fn: () => Promise<{ error: { message: string } | null }>, note: string) => {
    setBusy(true); setMsg("");
    try { const r = await fn(); if (r.error) throw new Error(r.error.message); setMsg(t(note)); } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); qc.invalidateQueries({ queryKey: ["sim"] }); }
  };
  const start = () => act(async () => supabase.from("sim_challenges").insert({ user_id: (await supabase.auth.getUser()).data.user!.id }), "Demo challenge started with $100 virtual. The bot checks the market every 5 minutes in the background.");
  const setStatus = (status: "running" | "paused" | "stopped", note: string) => act(async () => supabase.from("sim_challenges").update({ status, updated_at: new Date().toISOString(), ...(status === "stopped" ? { stop_reason: "Emergency stop" } : {}) }).eq("id", c!.id), note);

  return (
    <Page title={t("$100 to $1,000,000 — Free Demo Challenge")}>
      <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
        {t("Virtual money only: the $100 is not real, cannot be withdrawn, and no orders are sent to any real account. Results are simulated and do not guarantee real profit.")}
      </div>

      <section className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
        {!active && <Button disabled={busy} onClick={start}>{t("Start challenge")}</Button>}
        {c?.status === "running" && <Button variant="outline" disabled={busy} onClick={() => setStatus("paused", "Paused. No new trades; open trades keep their stop and target.")}>{t("Pause")}</Button>}
        {c?.status === "paused" && <Button disabled={busy} onClick={() => setStatus("running", "Resumed.")}>{t("Resume")}</Button>}
        {active && <Button variant="destructive" disabled={busy} onClick={() => confirm(t("Stop the challenge and close all demo trades?")) && setStatus("stopped", "Emergency stop saved. Demo trades close at the next cycle (within 5 minutes).")}>{t("Emergency stop")}</Button>}
        {msg && <p className="w-full text-sm text-muted-foreground">{msg}</p>}
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("Status")} value={c ? t(c.status) : t("Not started")} />
        <Stat label={t("Live price")} value={c?.last_price ? `${c.symbol} ${Number(c.last_price).toFixed(2)}` : "—"} sub={priceAge == null ? t("No live data yet") : priceAge > 10 ? t("Stale — market closed or source down") : t("Updated within 10 minutes")} />
        <Stat label={t("Start balance (virtual)")} value={money(c?.start_balance)} />
        <Stat label={t("Equity (virtual)")} value={c ? money(equity) : "—"} />
        <Stat label={t("Realized P/L")} value={money(realized)} tone={realized >= 0 ? "up" : "down"} />
        <Stat label={t("Unrealized P/L")} value={money(unreal)} tone={unreal >= 0 ? "up" : "down"} />
        <Stat label={t("Used / free margin")} value={`${money(used)} / ${money(equity - used)}`} sub={`1:${c?.leverage ?? 100} · ${t("stop-out at 50%")}`} />
        <Stat label={t("Fees paid")} value={money(c?.fees_paid)} />
        <Stat label={t("Progress to $1M")} value={c ? `${challengeProgress(Number(c.start_balance), equity, Number(c.target_balance)).toFixed(1)}%` : "—"} />
        <Stat label={t("Peak / drawdown")} value={c ? `${money(c.peak_equity)} · ${drawdownPct(Number(c.peak_equity), equity).toFixed(1)}%` : "—"} />
        <Stat label={t("Wins / losses")} value={`${wins.length} / ${losses.length}`} sub={closed.length ? `${t("Win rate")} ${Math.round((wins.length / closed.length) * 100)}%` : undefined} />
        <Stat label={t("Avg win / avg loss")} value={`${money(avg(wins))} / ${money(avg(losses))}`} />
      </section>
      {c?.stop_reason && <p className="mt-3 text-sm text-muted-foreground">{t("Ended")}: {t(c.stop_reason)}</p>}
      {c?.last_cycle_at && <p className="mt-1 text-xs text-muted-foreground">{t("Last engine cycle")}: {new Date(c.last_cycle_at).toLocaleString()}</p>}

      <section className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
        <h2 className="p-4 font-semibold">{t("Demo trades")}</h2>
        <table className="w-full text-sm"><tbody>
          {all.map((x) => (
            <tr key={x.id} className="border-t border-border">
              <td className="p-3 whitespace-nowrap">{new Date(x.opened_at).toLocaleString()}</td>
              <td className="p-3">{x.side.toUpperCase()} {x.lot} @ {Number(x.entry).toFixed(2)}</td>
              <td className="p-3">SL {Number(x.stop_loss).toFixed(2)} · TP {Number(x.take_profit).toFixed(2)}</td>
              <td className={cn("p-3", Number(x.profit) > 0 ? "text-success" : Number(x.profit) < 0 ? "text-destructive" : "")}>{x.status === "open" ? t("open") : `${money(x.profit)} · ${x.close_reason}`}</td>
            </tr>
          ))}
          {!all.length && <tr><td className="p-4 text-muted-foreground">{t("No demo trades yet.")}</td></tr>}
        </tbody></table>
      </section>

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

function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: "up" | "down"; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold", tone === "up" && "text-success", tone === "down" && "text-destructive")}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
