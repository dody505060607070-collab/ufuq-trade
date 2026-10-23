import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, Brain, Clock, Orbit, Signal, Trash2, TrendingUp } from "lucide-react";
import type { Callout } from "@/components/app/NeuralGalaxy";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { hourStats } from "@/lib/brain";
import { fmt } from "@/lib/trading";
import { cn } from "@/lib/utils";

const NeuralGalaxy = lazy(() => import("@/components/app/NeuralGalaxy"));

export const Route = createFileRoute("/_authenticated/brain")({
  head: () => ({ meta: [{ title: "AI Brain — Neural Intelligence | Arrissa AI" }, { name: "description", content: "A live 3D neural globe of every rule, instrument and trade lesson your Arrissa AI has learned." }, { property: "og:title", content: "AI Brain — Neural Intelligence | Arrissa AI" }, { property: "og:description", content: "A live 3D neural globe of every rule, instrument and trade lesson your Arrissa AI has learned." }] }),
  component: BrainPage,
});

const RANGES = { "1H": 1, "4H": 4, "1D": 24, "1W": 168, "1M": 720 } as const;
type Range = keyof typeof RANGES;
const money = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
const short = (s: string, n = 24) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function Stat({ icon, label, value, sub, tone }: { icon: ReactNode; label: string; value: string; sub: string; tone?: "up" | "down" | undefined }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 px-5 py-4 backdrop-blur">
      <p className="flex items-center gap-2.5 text-sm text-muted-foreground"><span className="text-primary-glow">{icon}</span>{label}</p>
      <p className={cn("mt-2 text-3xl font-semibold tracking-tight", tone === "up" && "text-success", tone === "down" && "text-destructive")}>{value}</p>
      <p className={cn("mt-1 text-xs", tone === "up" ? "text-success" : "text-muted-foreground")}>{sub}</p>
    </div>
  );
}

function BrainPage() {
  const t = useT();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [f, setF] = useState<"all" | "win" | "loss">("all");
  const [range, setRange] = useState<Range>("1W");
  const [picked, setPicked] = useState<Callout | null>(null);
  const lessons = useQuery({ queryKey: ["lessons"], queryFn: async () => (await supabase.from("trade_lessons").select("*").order("created_at", { ascending: false }).limit(300)).data ?? [] });
  const rules = useQuery({ queryKey: ["rules"], queryFn: async () => (await supabase.from("learned_rules").select("*").order("hits", { ascending: false })).data ?? [] });
  const review = useQuery({ queryKey: ["weekly-review"], queryFn: async () => (await supabase.from("weekly_reviews").select("*").order("week_start", { ascending: false }).limit(1).maybeSingle()).data });
  const trades = useQuery({ queryKey: ["closed-trades-hours"], queryFn: async () => (await supabase.from("trades").select("profit,closed_at").eq("status", "closed").limit(1000)).data ?? [] });
  const last = useQuery({ queryKey: ["last-analysis"], refetchInterval: 60_000, queryFn: async () => (await supabase.from("analyses").select("symbol,direction,confidence,created_at").order("created_at", { ascending: false }).limit(1).maybeSingle()).data });

  const L = lessons.data ?? [];
  const R = rules.data ?? [];
  const wins = L.filter((l) => l.outcome === "win").length;
  const losses = L.filter((l) => l.outcome === "loss").length;
  const today = L.filter((l) => Date.now() - new Date(l.created_at).getTime() < 864e5).length;
  const hours = useMemo(() => hourStats((trades.data ?? []).map((x) => ({ profit: x.profit == null ? null : Number(x.profit), closed_at: x.closed_at }))).filter((h) => h.trades >= 2), [trades.data]);
  const best = [...hours].sort((a, b) => b.net - a.net)[0];
  const worst = [...hours].sort((a, b) => a.net - b.net)[0];
  const hh = (h?: { hour: number }) => (h ? `${String(h.hour).padStart(2, "0")}:00` : "—");
  const shown = L.filter((l) => (f === "all" || l.outcome === f) && (!q || `${l.symbol} ${l.lesson ?? ""} ${l.reason ?? ""}`.toLowerCase().includes(q.toLowerCase())));

  const items = useMemo<Callout[]>(() => {
    const since = Date.now() - RANGES[range] * 36e5;
    const inRange = L.filter((l) => new Date(l.created_at).getTime() >= since);
    const syms = [...new Set(["XAUUSD", "USOIL", ...inRange.map((l) => l.symbol)])].slice(0, 5);
    const out: Callout[] = syms.map((s) => {
      const mine = inRange.filter((l) => l.symbol === s), net = mine.reduce((a, l) => a + Number(l.profit), 0);
      return { id: `s:${s}`, kind: "symbol", title: s, sub: `${mine.length} ${t("trades")}`, value: mine.length ? money(net) : undefined, tone: net < 0 ? "down" : "up" };
    });
    R.filter((r) => r.is_active).slice(0, 3).forEach((r) => out.push({ id: `r:${r.id}`, kind: "rule", title: short(r.rule), sub: `R-${r.id.slice(0, 4).toUpperCase()} · ${t("seen")} ${r.hits}×` }));
    inRange.filter((l) => l.outcome === "win").slice(0, 2).forEach((l) => out.push({ id: `l:${l.id}`, kind: "win", title: "WIN TRADE", sub: `${l.side.toUpperCase()} ${l.symbol}`, value: money(Number(l.profit)), tone: "up" }));
    inRange.filter((l) => l.outcome === "loss").slice(0, 2).forEach((l) => out.push({ id: `l:${l.id}`, kind: "loss", title: "LOSS TRADE", sub: `${l.side.toUpperCase()} ${l.symbol}`, value: money(Number(l.profit)), tone: "down" }));
    out.push({ id: "x:ict", kind: "layer", title: "Pattern Recognition", sub: "ICT · FVG · OB · BOS" });
    out.push({ id: "x:ind", kind: "layer", title: "Market Analysis", sub: "RSI · EMA · ADX · ATR" });
    const a = last.data;
    out.push({ id: "x:ai", kind: "layer", title: "Prediction Layer", sub: a ? `${a.direction.toUpperCase()} ${a.symbol} · ${a.confidence ?? "—"}%` : t("Waiting for analysis") });
    return out;
  }, [L, R, range, last.data, t]);

  const toggle = async (id: string, is_active: boolean) => { await supabase.from("learned_rules").update({ is_active }).eq("id", id); void qc.invalidateQueries({ queryKey: ["rules"] }); };
  const remove = async (id: string) => { await supabase.from("learned_rules").delete().eq("id", id); void qc.invalidateQueries({ queryKey: ["rules"] }); };
  const sheetCls = "w-full overflow-y-auto sm:max-w-lg";

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4 overflow-hidden bg-background px-4 py-4 md:h-dvh md:px-8 md:py-5">
      <header className="flex shrink-0 items-center justify-between border-b border-border/60 pb-3">
        <p className="flex items-center gap-3 text-sm font-medium tracking-[0.4em] text-foreground"><Brain className="h-7 w-7 text-primary-glow" />AI BRAIN</p>
        <p className="flex items-center gap-4 text-xs tracking-[0.2em] text-muted-foreground"><span className="flex items-center gap-2"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />LIVE</span><Signal className="h-4 w-4" /></p>
      </header>

      <div className="shrink-0">
        <h1 className="text-3xl font-light tracking-tight md:text-4xl">{t("Neural Intelligence")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("Analyzing markets. Learning patterns. Executing smarter.")}</p>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Brain className="h-5 w-5" />} label={t("Lessons learned")} value={String(L.length)} sub={`▲ +${today} ${t("today")}`} tone={undefined} />
        <Stat icon={<TrendingUp className="h-5 w-5" />} label={t("Win rate")} value={L.length ? `${((wins / L.length) * 100).toFixed(0)}%` : "—"} sub={`${wins}W / ${losses}L`} tone={L.length ? (wins / L.length >= 0.5 ? "up" : "down") : undefined} />
        <Stat icon={<Clock className="h-5 w-5" />} label={t("Best hour")} value={hh(best)} sub={best ? `${money(best.net)} · UTC` : t("No data yet")} />
        <Stat icon={<AlertTriangle className="h-5 w-5" />} label={t("Worst hour")} value={hh(worst)} sub={worst ? `${money(worst.net)} · UTC` : t("No data yet")} />
      </div>

      <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/20">
        <div className="z-10 flex shrink-0 flex-wrap items-center gap-4 border-b border-border/60 px-5 py-3">
          <Orbit className="h-8 w-8 shrink-0 text-primary-glow" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-medium">{t("Neural Galaxy")}</h2>
            <p className="text-xs text-muted-foreground">{t("Live neural network of your trading intelligence. Each node represents a pattern, rule or trade.")}</p>
          </div>
          <div className="flex flex-wrap gap-4 border-border/60 text-xs md:border-s md:ps-5">
            {([["bg-primary", "Rules"], ["bg-success", "Winning trades"], ["bg-destructive", "Losing trades"], ["bg-warning", "Instruments"]] as const).map(([c, l]) => (
              <span key={l} className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-full", c)} />{t(l)}</span>
            ))}
          </div>
        </div>

        <div className="space-bg relative min-h-0 flex-1">
          <ClientOnly fallback={<div className="h-full animate-pulse bg-muted/10" />}>
            <Suspense fallback={<div className="h-full animate-pulse bg-muted/10" />}>
              <NeuralGalaxy items={items} onPick={setPicked} spin={!picked} />
            </Suspense>
          </ClientOnly>

          {picked && (
            <div className="absolute start-4 top-4 z-10 max-w-xs rounded-xl border border-border bg-popover/90 p-4 text-sm shadow-xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-glow">{picked.title}</p>
              {picked.sub && <p className="mt-1 text-muted-foreground">{picked.sub}</p>}
              {picked.value && <p className={cn("mt-1 font-medium", picked.tone === "down" ? "text-destructive" : "text-success")}>{picked.value}</p>}
              {picked.kind === "rule" && <p className="mt-2 text-xs">{R.find((r) => `r:${r.id}` === picked.id)?.rule}</p>}
              {(picked.kind === "win" || picked.kind === "loss") && <p className="mt-2 text-xs">{L.find((l) => `l:${l.id}` === picked.id)?.lesson}</p>}
              <button className="mt-3 text-xs text-muted-foreground underline" onClick={() => setPicked(null)}>{t("Close")}</button>
            </div>
          )}

          <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-border/60 bg-card/50 p-1.5 backdrop-blur">
              <div className="flex rounded-full border border-border/60 p-0.5">
                {(Object.keys(RANGES) as Range[]).map((k) => (
                  <button key={k} onClick={() => setRange(k)} className={cn("rounded-full px-4 py-1.5 text-xs transition-colors", range === k ? "bg-primary/20 font-semibold text-foreground shadow-[inset_0_-2px_0_var(--primary)]" : "text-muted-foreground hover:text-foreground")}>{k}</button>
                ))}
              </div>
              <span className="flex items-center gap-2 rounded-full border border-border/60 px-4 py-1.5 text-xs"><Activity className="h-3.5 w-3.5 text-success" />{t("Live Analysis")}<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /></span>
              <Sheet>
                <SheetTrigger asChild><Button size="sm" variant="ghost" className="rounded-full text-xs">{t("Learned rules")} ({R.length})</Button></SheetTrigger>
                <SheetContent className={sheetCls}>
                  <SheetHeader><SheetTitle>{t("Learned rules")}</SheetTitle></SheetHeader>
                  {!R.length && <p className="mt-4 text-sm text-muted-foreground">{t("No rules yet. They appear after the first closed trades.")}</p>}
                  <ul className="mt-4 space-y-2">
                    {R.map((r) => (
                      <li key={r.id} className={cn("flex items-start gap-3 rounded-xl border border-border/60 p-3", !r.is_active && "opacity-50")}>
                        <Brain className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <div className="flex-1 text-sm"><p>{r.rule}</p><p className="mt-1 text-xs text-muted-foreground">{r.symbol ?? t("All")} · {t("seen")} {r.hits}×</p></div>
                        <Switch checked={r.is_active} onCheckedChange={(v) => void toggle(r.id, v)} aria-label={t("Active")} />
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void remove(r.id)} aria-label={t("Delete")}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </li>
                    ))}
                  </ul>
                </SheetContent>
              </Sheet>
              <Sheet>
                <SheetTrigger asChild><Button size="sm" variant="ghost" className="rounded-full text-xs">{t("Trade lessons")} ({L.length})</Button></SheetTrigger>
                <SheetContent className={sheetCls}>
                  <SheetHeader><SheetTitle>{t("Trade lessons")}</SheetTitle></SheetHeader>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search...")} className="h-8 flex-1" />
                    {(["all", "win", "loss"] as const).map((k) => (
                      <Button key={k} size="sm" variant={f === k ? "hero" : "secondary"} className="h-8 rounded-full" onClick={() => setF(k)}>{t(k === "all" ? "All" : k === "win" ? "Wins" : "Losses")}</Button>
                    ))}
                  </div>
                  {!shown.length && <p className="mt-4 text-sm text-muted-foreground">{t("No lessons yet. The AI reviews each trade a few minutes after it closes.")}</p>}
                  <ol className="relative mt-4 space-y-3 border-s border-border/60 ps-5">
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
                        </div>
                      </li>
                    ))}
                  </ol>
                </SheetContent>
              </Sheet>
              {review.data && (
                <Sheet>
                  <SheetTrigger asChild><Button size="sm" variant="ghost" className="rounded-full text-xs">{t("This week's review")}</Button></SheetTrigger>
                  <SheetContent className={sheetCls}>
                    <SheetHeader><SheetTitle>{t("This week's review")} · {review.data.week_start}</SheetTitle></SheetHeader>
                    <p className="mt-4 text-sm leading-relaxed">{review.data.summary}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{review.data.trades} {t("trades")} · <span className={Number(review.data.net) >= 0 ? "text-success" : "text-destructive"}>{fmt(Number(review.data.net))}</span></p>
                  </SheetContent>
                </Sheet>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
