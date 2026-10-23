import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Brain, Trash2 } from "lucide-react";
import { Page } from "@/components/app/AppShell";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { hourStats } from "@/lib/brain";
import { fmt } from "@/lib/trading";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/brain")({
  head: () => ({ meta: [{ title: "AI Brain | Arrissa AI" }, { name: "description", content: "Lessons and rules the AI learned from your closed trades." }, { property: "og:title", content: "AI Brain | Arrissa AI" }, { property: "og:description", content: "Lessons and rules the AI learned from your closed trades." }] }),
  component: BrainPage,
});

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", tone === "up" && "text-success", tone === "down" && "text-destructive")}>{value}</p>
    </div>
  );
}

function BrainPage() {
  const t = useT();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [f, setF] = useState<"all" | "win" | "loss">("all");
  const lessons = useQuery({ queryKey: ["lessons"], queryFn: async () => (await supabase.from("trade_lessons").select("*").order("created_at", { ascending: false }).limit(300)).data ?? [] });
  const rules = useQuery({ queryKey: ["rules"], queryFn: async () => (await supabase.from("learned_rules").select("*").order("hits", { ascending: false })).data ?? [] });
  const review = useQuery({ queryKey: ["weekly-review"], queryFn: async () => (await supabase.from("weekly_reviews").select("*").order("week_start", { ascending: false }).limit(1).maybeSingle()).data });
  const trades = useQuery({ queryKey: ["closed-trades-hours"], queryFn: async () => (await supabase.from("trades").select("profit,closed_at").eq("status", "closed").limit(1000)).data ?? [] });

  const L = lessons.data ?? [];
  const wins = L.filter((l) => l.outcome === "win").length;
  const hours = useMemo(() => hourStats((trades.data ?? []).map((x) => ({ profit: x.profit == null ? null : Number(x.profit), closed_at: x.closed_at }))).filter((h) => h.trades >= 2), [trades.data]);
  const best = [...hours].sort((a, b) => b.net - a.net)[0];
  const worst = [...hours].sort((a, b) => a.net - b.net)[0];
  const shown = L.filter((l) => (f === "all" || l.outcome === f) && (!q || `${l.symbol} ${l.lesson ?? ""} ${l.reason ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const hh = (h?: { hour: number }) => (h ? `${String(h.hour).padStart(2, "0")}:00 UTC` : "—");

  const toggle = async (id: string, is_active: boolean) => { await supabase.from("learned_rules").update({ is_active }).eq("id", id); void qc.invalidateQueries({ queryKey: ["rules"] }); };
  const remove = async (id: string) => { await supabase.from("learned_rules").delete().eq("id", id); void qc.invalidateQueries({ queryKey: ["rules"] }); };

  return (
    <Page title={t("AI Brain")} subtitle={t("Every closed trade becomes a lesson. Repeated lessons become rules the AI follows.")}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("Lessons learned")} value={String(L.length)} />
        <Stat label={t("Win rate")} value={L.length ? `${((wins / L.length) * 100).toFixed(0)}%` : "—"} tone={wins / (L.length || 1) >= 0.5 ? "up" : "down"} />
        <Stat label={t("Best hour")} value={hh(best)} tone="up" />
        <Stat label={t("Worst hour")} value={hh(worst)} tone="down" />
      </div>

      {review.data && (
        <div className="rounded-2xl border border-primary/40 bg-accent/40 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t("This week's review")} · {review.data.week_start}</p>
          <p className="mt-2 text-sm leading-relaxed">{review.data.summary}</p>
          <p className="mt-2 text-xs text-muted-foreground">{review.data.trades} {t("trades")} · <span className={Number(review.data.net) >= 0 ? "text-success" : "text-destructive"}>{fmt(Number(review.data.net))}</span></p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <section className="rounded-2xl bg-card p-5">
          <h2 className="mb-3 font-semibold">{t("Learned rules")}</h2>
          {!(rules.data ?? []).length && <p className="text-sm text-muted-foreground">{t("No rules yet. They appear after the first closed trades.")}</p>}
          <ul className="space-y-2">
            {(rules.data ?? []).map((r) => (
              <li key={r.id} className={cn("flex items-start gap-3 rounded-xl border border-border/60 p-3", !r.is_active && "opacity-50")}>
                <Brain className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="flex-1 text-sm">
                  <p>{r.rule}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{r.symbol ?? t("All")} · {t("seen")} {r.hits}×</p>
                </div>
                <Switch checked={r.is_active} onCheckedChange={(v) => void toggle(r.id, v)} aria-label={t("Active")} />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void remove(r.id)} aria-label={t("Delete")}><Trash2 className="h-3.5 w-3.5" /></Button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-card p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="flex-1 font-semibold">{t("Trade lessons")}</h2>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search...")} className="h-8 w-40" />
            {(["all", "win", "loss"] as const).map((k) => (
              <Button key={k} size="sm" variant={f === k ? "hero" : "secondary"} className="h-8 rounded-full" onClick={() => setF(k)}>{t(k === "all" ? "All" : k === "win" ? "Wins" : "Losses")}</Button>
            ))}
          </div>
          {!shown.length && <p className="text-sm text-muted-foreground">{t("No lessons yet. The AI reviews each trade a few minutes after it closes.")}</p>}
          <ol className="relative space-y-3 border-s border-border/60 ps-5">
            {shown.map((l) => (
              <li key={l.id} className="relative">
                <span className={cn("absolute -start-[1.6rem] top-1.5 h-3 w-3 rounded-full", l.outcome === "win" ? "bg-success" : l.outcome === "loss" ? "bg-destructive" : "bg-muted-foreground")} />
                <div className="rounded-xl border border-border/60 p-3 text-sm">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold">{l.side.toUpperCase()} {l.symbol}</span>
                    <span className={Number(l.profit) >= 0 ? "text-success" : "text-destructive"}>{fmt(Number(l.profit))}</span>
                    <span className="ms-auto text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                  </div>
                  {l.reason && <p className="mt-2 text-muted-foreground">{l.reason}</p>}
                  {l.lesson && <p className="mt-1 font-medium">{l.lesson}</p>}
                  {!!l.tags.length && <div className="mt-2 flex flex-wrap gap-1">{l.tags.map((g) => <span key={g} className="rounded-full bg-accent px-2 py-0.5 text-[10px]">{g}</span>)}</div>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Page>
  );
}
