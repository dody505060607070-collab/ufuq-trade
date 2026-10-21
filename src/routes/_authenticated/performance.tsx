import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Page } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { fmt, priceDigits, useAccounts } from "@/lib/trading";
import { periodStats, PERIODS } from "@/lib/performance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/performance")({
  head: () => ({ meta: [{ title: "Performance | Arrissa AI" }, { name: "description", content: "Closed trade history from your MT5 accounts." }] }),
  component: Performance,
});

function Performance() {
  const accounts = useAccounts();
  const [acc, setAcc] = useState("all");
  const closed = useQuery({
    queryKey: ["closed-trades"],
    queryFn: async () => (await supabase.from("trades").select("*").eq("status", "closed").order("closed_at", { ascending: false }).limit(2000)).data ?? [],
  });
  const rows = useMemo(() => (closed.data ?? []).filter((t) => acc === "all" || t.account_id === acc), [closed.data, acc]);

  return (
    <Page
      title="Performance"
      subtitle="Closed trade history from your MT5 accounts"
      actions={
        <div className="flex gap-2">
          <Select value={acc} onValueChange={setAcc}>
            <SelectTrigger className="h-9 w-40 rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Accounts</SelectItem>{(accounts.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.label || a.login} #{a.login}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="secondary" size="sm" className="h-9 rounded-full" onClick={() => void closed.refetch()} disabled={closed.isFetching}>{closed.isFetching && <Loader2 className="animate-spin" />} Refresh</Button>
        </div>
      }
    >
      <div className="flex items-center gap-4 rounded-2xl border border-primary/40 bg-accent/40 p-4 text-sm text-muted-foreground">
        <p className="flex-1">Performance data is sent to Arrissa directly from your MT5 terminal via the Expert Advisor (EA). Make sure your EA is installed and running to see accurate figures here.</p>
        <Button asChild variant="hero" size="sm" className="rounded-full"><Link to="/settings">Set up EA</Link></Button>
      </div>
      <div className="space-y-2">
        {PERIODS.map((p) => {
          const s = periodStats(rows, p.key);
          return (
            <Collapsible key={p.key} className="rounded-2xl bg-card">
              <CollapsibleTrigger className="group flex w-full items-center gap-3 px-4 py-4 text-left">
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                <span className="flex-1 font-semibold">{p.label}</span>
                {s.count === 0 ? <span className="text-xs italic text-muted-foreground">No data</span> : (
                  <span className="flex gap-4 text-xs">
                    <span className="text-muted-foreground">{s.count} {s.count === 1 ? "trade" : "trades"} · {s.winRate.toFixed(0)}% win</span>
                    <span className={cn("font-semibold", s.net >= 0 ? "text-success" : "text-destructive")}>{s.net >= 0 ? "+" : ""}{fmt(s.net)}</span>
                  </span>
                )}
              </CollapsibleTrigger>
              <CollapsibleContent>
                {s.count > 0 && (
                  <div className="space-y-3 px-4 pb-4">
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      <Stat l="Won" v={String(s.wins)} /><Stat l="Lost" v={String(s.losses)} /><Stat l="Best" v={fmt(s.best)} /><Stat l="Worst" v={fmt(s.worst)} />
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="text-left text-muted-foreground"><tr><th className="py-1">Symbol</th><th>Side</th><th>Lots</th><th>Open</th><th>Close</th><th>Closed</th><th className="text-right">P/L</th></tr></thead>
                        <tbody>
                          {s.trades.map((t) => (
                            <tr key={t.id} className="border-t border-border">
                              <td className="py-1.5 font-semibold">{t.symbol}</td>
                              <td className={t.side === "buy" ? "text-success" : "text-destructive"}>{t.side.toUpperCase()}</td>
                              <td>{t.volume}</td><td>{fmt(t.open_price, priceDigits(t.open_price))}</td><td>{fmt(t.close_price, priceDigits(t.open_price))}</td>
                              <td className="text-muted-foreground">{t.closed_at ? new Date(t.closed_at).toLocaleString() : "—"}</td>
                              <td className={cn("text-right font-semibold", Number(t.profit) >= 0 ? "text-success" : "text-destructive")}>{fmt(t.profit)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </Page>
  );
}

function Stat({ l, v }: { l: string; v: string }) {
  return <div className="rounded-lg bg-muted p-2"><p className="text-muted-foreground">{l}</p><p className="font-semibold">{v}</p></div>;
}
