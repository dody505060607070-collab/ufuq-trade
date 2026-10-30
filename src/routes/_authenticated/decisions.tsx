import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Page } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useT, useAiText, useI18n } from "@/lib/i18n";
import { backtest, trendPullback, type BtResult } from "@/lib/backtest";
import { getCandlesPublic } from "@/lib/market.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/decisions")({
  head: () => ({ meta: [{ title: "Decisions & Backtest | Ufuq Trade" }, { name: "description", content: "Every AI proposal, the risk engine verdict, and a historical test of the base rules." }, { property: "og:title", content: "Decisions & Backtest | Ufuq Trade" }, { property: "og:description", content: "Every AI proposal, the risk engine verdict, and a historical test of the base rules." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Decisions,
});

const TFS = ["M15", "H1", "H4"] as const;

function Decisions() {
  const t = useT();
  const ai = useAiText();
  const { lang } = useI18n();
  const log = useQuery({ queryKey: ["decision_log"], refetchInterval: 30_000, queryFn: async () => (await supabase.from("decision_log").select("*").order("created_at", { ascending: false }).limit(100)).data ?? [] });
  const rows = log.data ?? [];
  const approved = rows.filter((r) => r.risk_verdict === "approved").length;
  const fromBroker = rows.filter((r) => r.data_source === "broker").length;

  const fetchPublic = useServerFn(getCandlesPublic);
  const [tf, setTf] = useState<(typeof TFS)[number]>("H1");
  const [bt, setBt] = useState<(BtResult & { source: string; bars: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { data } = await supabase.from("broker_candles").select("t,o,h,l,c,spread").eq("symbol", "XAUUSD").eq("timeframe", tf).order("t").limit(2000);
      let candles = (data ?? []).map((r) => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c }));
      let source = "MT5 broker";
      let spread = 0.3;
      if (candles.length >= 100) { const sp = (data ?? []).reduce((a, r) => a + r.spread, 0) / (data ?? []).length; spread = sp * 0.01; }
      else { candles = await fetchPublic({ data: { yahoo: "GC=F", tf } }); source = "Yahoo (public)"; }
      setBt({ ...backtest(candles, trendPullback, { spread, units: 2 }), source, bars: candles.length });
    } finally { setBusy(false); }
  };

  return (
    <Page title={t("Decisions & Backtest")}>
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label={t("Decisions logged")} value={String(rows.length)} />
        <Stat label={t("Approved by risk engine")} value={`${approved} / ${rows.length}`} />
        <Stat label={t("Using broker data")} value={`${fromBroker} / ${rows.length}`} />
      </div>

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">{t("Backtest: base rules without AI (XAUUSD, 0.02 lot)")}</h2>
            <p className="text-sm text-muted-foreground">{t("Trend + pullback, 1.5 ATR stop, 1.5R target, spread charged. A benchmark the AI must beat.")}</p>
          </div>
          <div className="flex gap-2">
            {TFS.map((x) => <Button key={x} size="sm" variant={x === tf ? "default" : "outline"} onClick={() => setTf(x)}>{x}</Button>)}
            <Button size="sm" onClick={run} disabled={busy}>{busy ? t("Running…") : t("Run backtest")}</Button>
          </div>
        </div>
        {bt && (
          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            <Stat label={t("Net result")} value={`$${bt.net.toFixed(2)}`} tone={bt.net >= 0 ? "up" : "down"} />
            <Stat label={t("Max drawdown")} value={`$${bt.maxDrawdown.toFixed(2)}`} />
            <Stat label={t("Trades")} value={String(bt.trades.length)} />
            <Stat label={t("Win rate")} value={`${(bt.winRate * 100).toFixed(0)}%`} />
            <Stat label={t("Avg per trade")} value={`$${bt.avg.toFixed(2)}`} />
            <p className="text-xs text-muted-foreground sm:col-span-5">{t("Data")}: {bt.source} · {bt.bars} {t("candles")}. {t("Past results do not guarantee future profit.")}</p>
          </div>
        )}
      </section>

      <section className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground"><tr>{["Time", "Symbol", "AI", "Entry / SL / TP", "Data", "Risk engine"].map((h) => <th key={h} className="p-3 font-medium">{t(h)}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString(lang === "ar" ? "ar-EG" : undefined)}</td>
                <td className="p-3">{r.symbol} {r.timeframe}</td>
                <td className="p-3 uppercase">{r.ai_provider === "openai" ? "ChatGPT" : "Gemini"} · {t(String(r.ai_direction ?? "").toUpperCase())} {r.ai_confidence}%</td>
                <td className="p-3 whitespace-nowrap">{r.entry ?? "-"} / {r.stop_loss ?? "-"} / {r.take_profit ?? "-"}</td>
                <td className="p-3">{r.data_source === "broker" ? "MT5" : "Yahoo"}</td>
                <td className={cn("p-3", r.risk_verdict === "approved" ? "text-primary" : "text-muted-foreground")}>{ai(r.risk_reason)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{t("No decisions yet — they appear after the next Auto-Pilot cycle.")}</td></tr>}
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
      <div className={cn("mt-1 text-xl font-semibold", tone === "down" && "text-destructive", tone === "up" && "text-primary")}>{value}</div>
    </div>
  );
}
