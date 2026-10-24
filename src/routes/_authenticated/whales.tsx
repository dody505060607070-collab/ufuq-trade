import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { TrendingDown, TrendingUp, Minus, Info } from "lucide-react";
import { Page } from "@/components/app/AppShell";
import { InstrumentIcon } from "@/components/app/InstrumentIcon";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { cotBias } from "@/lib/brain";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/whales")({
  head: () => ({ meta: [{ title: "Whale Radar | Ufuq Trade" }, { name: "description", content: "How big-money speculators are positioned on gold, oil and the euro." }, { property: "og:title", content: "Whale Radar | Ufuq Trade" }, { property: "og:description", content: "How big-money speculators are positioned on gold, oil and the euro." }] }),
  component: Whales,
});

const META: Record<string, { name: string; flag: string }> = { XAUUSD: { name: "Gold", flag: "xau" }, USOIL: { name: "US Oil", flag: "us" }, EURUSD: { name: "Euro / Dollar", flag: "eu" } };
type Row = { id: string; symbol: string; report_date: string; long_pos: number; short_pos: number; change_long: number; change_short: number };
const TABS = ["Overview", "Markets", "History"] as const;

function Whales() {
  const t = useT();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const q = useQuery({ queryKey: ["whales"], queryFn: async () => ((await supabase.from("whale_signals").select("*").order("report_date", { ascending: false }).limit(60)).data ?? []) as Row[] });
  const all = q.data ?? [];
  const symbols = Object.keys(META).filter((s) => all.some((r) => r.symbol === s));
  const stat = (r: Row) => {
    const b = cotBias(Number(r.long_pos), Number(r.short_pos), Number(r.change_long), Number(r.change_short));
    return { ...b, longPct: (Number(r.long_pos) / (Number(r.long_pos) + Number(r.short_pos))) * 100 };
  };
  const Badge = ({ bias }: { bias: string }) => {
    const Icon = bias === "bullish" ? TrendingUp : bias === "bearish" ? TrendingDown : Minus;
    return <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold", bias === "bullish" ? "bg-success/15 text-success" : bias === "bearish" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground")}><Icon className="h-3.5 w-3.5" />{t(bias === "bullish" ? "Bullish" : bias === "bearish" ? "Bearish" : "Neutral")}</span>;
  };
  return (
    <Page title={t("Whale Radar")} subtitle={t("Where the big money is positioned, from the weekly CFTC report. The AI uses this as one more opinion.")}>
      <div className="mb-5 flex gap-1 border-b border-border">
        {TABS.map((x) => <button key={x} onClick={() => setTab(x)} className={cn("-mb-px border-b-2 px-4 py-2 text-sm", tab === x ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{t(x)}</button>)}
      </div>
      {!all.length && <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground">{t("First data arrives with the next Auto-Pilot cycle.")}</p>}

      {(tab === "Overview" || tab === "Markets") && (
        <div className="grid gap-4 lg:grid-cols-3">
          {symbols.map((s) => {
            const rows = all.filter((r) => r.symbol === s);
            const w = rows[0]!;
            const b = stat(w);
            return (
              <div key={s} className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur">
                <div className="flex items-center gap-3">
                  <InstrumentIcon flag={META[s]!.flag} className="h-10 w-10 text-xs" />
                  <div className="flex-1"><p className="font-semibold uppercase tracking-wide">{t(META[s]!.name)}</p><p className="text-xs text-muted-foreground">{s}</p></div>
                  <Badge bias={b.bias} />
                </div>
                <div className="mt-5 flex items-end justify-between">
                  <div><p className="text-3xl font-bold text-success">{b.longPct.toFixed(0)}%</p><p className="text-xs text-muted-foreground">{t("Buyers")}</p></div>
                  <div className="text-end"><p className="text-3xl font-bold text-destructive">{(100 - b.longPct).toFixed(0)}%</p><p className="text-xs text-muted-foreground">{t("Sellers")}</p></div>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-destructive/50"><div className="h-full bg-success" style={{ width: `${b.longPct}%` }} /></div>
                <div className="mt-4 flex justify-between rounded-xl bg-muted/40 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">{t("Weekly change")}</span>
                  <span className={b.weekly >= 0 ? "text-success" : "text-destructive"}>{b.weekly >= 0 ? "+" : ""}{b.weekly.toLocaleString()} {t("contracts")}</span>
                </div>
                {tab === "Overview" && <>
                  <p className="mt-4 text-[11px] text-muted-foreground">{t("8-week positioning trend")}</p>
                  <div className="mt-2 flex h-14 items-end gap-1.5">
                    {rows.slice(0, 8).reverse().map((r) => {
                      const n = stat(r).netPct;
                      return <div key={r.id} title={`${r.report_date}: ${n.toFixed(0)}%`} className={cn("flex-1 rounded-sm", n >= 0 ? "bg-success/80" : "bg-destructive/80")} style={{ height: `${Math.max(8, Math.min(100, Math.abs(n)))}%` }} />;
                    })}
                  </div>
                </>}
                <p className="mt-3 text-[11px] text-muted-foreground">{t("Report date")}: {w.report_date}</p>
              </div>
            );
          })}
        </div>
      )}

      {(tab === "Overview" || tab === "History") && !!all.length && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/60">
            <p className="border-b border-border/60 px-5 py-3 font-semibold">{t("Institutional Positioning")}</p>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr className="text-start">{["Market", "Date", "Buyers", "Sellers", "Weekly change", "Bias"].map((h) => <th key={h} className="px-5 py-2 text-start font-normal">{t(h)}</th>)}</tr></thead>
              <tbody>
                {(tab === "History" ? all : symbols.map((s) => all.find((r) => r.symbol === s)!)).map((r) => {
                  const b = stat(r);
                  return (
                    <tr key={r.id} className="border-t border-border/40">
                      <td className="px-5 py-3"><span className="flex items-center gap-2"><InstrumentIcon flag={META[r.symbol]?.flag} />{r.symbol}</span></td>
                      <td className="px-5 py-3 text-muted-foreground">{r.report_date}</td>
                      <td className="px-5 py-3 text-success">{b.longPct.toFixed(0)}%</td>
                      <td className="px-5 py-3 text-destructive">{(100 - b.longPct).toFixed(0)}%</td>
                      <td className={cn("px-5 py-3", b.weekly >= 0 ? "text-success" : "text-destructive")}>{b.weekly >= 0 ? "+" : ""}{b.weekly.toLocaleString()}</td>
                      <td className="px-5 py-3"><Badge bias={b.bias} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="rounded-2xl border border-primary/30 bg-card/60 p-5">
            <p className="flex items-center gap-2 font-semibold"><Info className="h-4 w-4 text-primary-glow" />{t("How to read this")}</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>{t("Buyers % = share of big speculators betting on a rise.")}</li>
              <li>{t("Weekly change shows whether they added or cut positions this week.")}</li>
              <li>{t("Green bars = net buying, red bars = net selling over the last 8 weeks.")}</li>
              <li>{t("The report comes out every Friday for the previous Tuesday.")}</li>
            </ul>
          </div>
        </div>
      )}
    </Page>
  );
}
