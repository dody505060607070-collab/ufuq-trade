import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Page } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { cotBias } from "@/lib/brain";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/whales")({
  head: () => ({ meta: [{ title: "Whale Radar | Arrissa AI" }, { name: "description", content: "How big-money speculators are positioned on gold, oil and the euro." }, { property: "og:title", content: "Whale Radar | Arrissa AI" }, { property: "og:description", content: "How big-money speculators are positioned on gold, oil and the euro." }] }),
  component: Whales,
});

const NAMES: Record<string, string> = { XAUUSD: "Gold", USOIL: "US Oil", EURUSD: "Euro / Dollar" };

function Whales() {
  const t = useT();
  const q = useQuery({ queryKey: ["whales"], queryFn: async () => (await supabase.from("whale_signals").select("*").order("report_date", { ascending: false }).limit(60)).data ?? [] });
  const symbols = Object.keys(NAMES);
  return (
    <Page title={t("Whale Radar")} subtitle={t("Where the big money is positioned, from the weekly CFTC report. The AI uses this as one more opinion.")}>
      {!(q.data ?? []).length && <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground">{t("First data arrives with the next Auto-Pilot cycle.")}</p>}
      <div className="grid gap-4 md:grid-cols-3">
        {symbols.map((s) => {
          const rows = (q.data ?? []).filter((r) => r.symbol === s);
          const w = rows[0];
          if (!w) return null;
          const b = cotBias(Number(w.long_pos), Number(w.short_pos), Number(w.change_long), Number(w.change_short));
          const Icon = b.bias === "bullish" ? TrendingUp : b.bias === "bearish" ? TrendingDown : Minus;
          const longPct = (Number(w.long_pos) / (Number(w.long_pos) + Number(w.short_pos))) * 100;
          return (
            <div key={s} className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur">
              <div className="flex items-center gap-2">
                <div className="flex-1"><p className="font-semibold">{t(NAMES[s]!)}</p><p className="text-xs text-muted-foreground">{s} · {w.report_date}</p></div>
                <span className={cn("flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold", b.bias === "bullish" ? "bg-success/15 text-success" : b.bias === "bearish" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground")}>
                  <Icon className="h-3.5 w-3.5" />{t(b.bias === "bullish" ? "Bullish" : b.bias === "bearish" ? "Bearish" : "Neutral")}
                </span>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-destructive/40"><div className="h-full bg-success" style={{ width: `${longPct}%` }} /></div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{t("Buyers")} {longPct.toFixed(0)}%</span><span>{t("Sellers")} {(100 - longPct).toFixed(0)}%</span></div>
              <p className="mt-3 text-xs text-muted-foreground">{t("Weekly change")}: <span className={b.weekly >= 0 ? "text-success" : "text-destructive"}>{b.weekly >= 0 ? "+" : ""}{b.weekly.toLocaleString()}</span> {t("contracts")}</p>
              <div className="mt-3 flex h-10 items-end gap-1">
                {rows.slice(0, 8).reverse().map((r) => {
                  const n = cotBias(Number(r.long_pos), Number(r.short_pos), 0, 0).netPct;
                  return <div key={r.id} title={`${r.report_date}: ${n.toFixed(0)}%`} className={cn("flex-1 rounded-sm", n >= 0 ? "bg-success/70" : "bg-destructive/70")} style={{ height: `${Math.max(8, Math.abs(n))}%` }} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{t("Congress and insider trades (Quiver Quant) need a paid data key and can be added later.")}</p>
    </Page>
  );
}
