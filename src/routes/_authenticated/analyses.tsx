import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Page } from "@/components/app/AppShell";
import { AiAnalysisCard, type AnalysisRow } from "@/components/app/AiAnalysisCard";
import { supabase } from "@/integrations/supabase/client";
import { HelpNote, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/analyses")({
  head: () => ({
    meta: [
      { title: "AI Analyses — Gemini vs ChatGPT | Ufuq Trade" },
      { name: "description", content: "Read every Gemini and ChatGPT market analysis side by side: decision, confidence, levels and the full reasoning." },
      { property: "og:title", content: "AI Analyses — Gemini vs ChatGPT | Ufuq Trade" },
      { property: "og:description", content: "Read every Gemini and ChatGPT market analysis side by side: decision, confidence, levels and the full reasoning." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Analyses,
});

const PROVIDERS = [
  { id: "gemini", label: "Gemini" },
  { id: "openai", label: "ChatGPT" },
] as const;

function Analyses() {
  const t = useT();
  const [symbol, setSymbol] = useState<string>("all");
  const [hist, setHist] = useState<"all" | "gemini" | "openai">("all");
  const q = useQuery({
    queryKey: ["analyses-compare"],
    refetchInterval: 60_000,
    queryFn: async () => (await supabase.from("analyses").select("id,symbol,timeframe,provider,direction,confidence,entry,stop_loss,take_profit,summary,summary_ar,created_at").gte("created_at", new Date(Date.now() - 3 * 86400_000).toISOString()).order("created_at", { ascending: false }).limit(300)).data ?? [],
  });
  const rows = (q.data ?? []) as AnalysisRow[];
  const symbols = useMemo(() => [...new Set(rows.map((r) => r.symbol))].sort(), [rows]);
  const pick = (r: AnalysisRow) => symbol === "all" || r.symbol === symbol;
  const latest = (prov: string) => {
    const seen = new Set<string>();
    return rows.filter((r) => (r.provider ?? "gemini") === prov && pick(r) && !seen.has(r.symbol) && seen.add(r.symbol));
  };
  const stats = (prov: string) => {
    const mine = rows.filter((r) => (r.provider ?? "gemini") === prov && pick(r));
    const dir = mine.filter((r) => r.direction !== "neutral");
    const avg = dir.length ? Math.round(dir.reduce((a, r) => a + Number(r.confidence ?? 0), 0) / dir.length) : null;
    return { total: mine.length, dir: dir.length, avg };
  };
  const history = rows.filter((r) => pick(r) && (hist === "all" || (r.provider ?? "gemini") === hist)).slice(0, 40);

  return (
    <Page title={t("AI Analyses")} subtitle={t("What Gemini and ChatGPT said about each market, side by side.")}>
      <HelpNote>{"Each card is one analysis written by the AI. The safety checks in our code can still block a trade — when that happens the card shows why and what the AI wanted. Open a card to read the full reasoning."}</HelpNote>

      <div className="mt-4 flex flex-wrap gap-2">
        {["all", ...symbols].map((s) => (
          <button key={s} onClick={() => setSymbol(s)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", symbol === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{s === "all" ? t("All") : s}</button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {PROVIDERS.map((p) => {
          const st = stats(p.id);
          const list = latest(p.id);
          return (
            <section key={p.id} className="rounded-2xl border border-border bg-card/40 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-bold">{p.label}</h2>
                <p className="text-xs text-muted-foreground">{t("Last 3 days")}: {st.total} {t("analyses")} · {st.dir} {t("buy/sell calls")} · {t("avg confidence")} {st.avg != null ? `${st.avg}%` : "—"}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("Latest analysis per market")}</p>
              <div className="mt-3 space-y-3">
                {list.map((a) => <AiAnalysisCard key={a.id} a={a} />)}
                {!list.length && <p className="py-8 text-center text-sm text-muted-foreground">{q.isLoading ? t("Loading…") : t("No analyses from this AI yet.")}</p>}
              </div>
            </section>
          );
        })}
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{t("History")}</h2>
          <div className="flex gap-1">
            {(["all", "gemini", "openai"] as const).map((h) => (
              <button key={h} onClick={() => setHist(h)} className={cn("rounded-full border px-3 py-1 text-xs", hist === h ? "border-primary text-primary-glow" : "border-border text-muted-foreground")}>{h === "all" ? t("All") : h === "openai" ? "ChatGPT" : "Gemini"}</button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {history.map((a) => <AiAnalysisCard key={a.id} a={a} />)}
        </div>
        {!history.length && <p className="py-6 text-center text-sm text-muted-foreground">{t("No analyses yet.")}</p>}
      </section>
    </Page>
  );
}
