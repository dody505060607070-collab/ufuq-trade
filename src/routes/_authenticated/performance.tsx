import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader, Panel, Empty } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { fmt, useAccounts } from "@/lib/trading";

export const Route = createFileRoute("/_authenticated/performance")({
  head: () => ({ meta: [{ title: "Performance | Arrissa AI" }] }),
  component: Performance,
});

const ranges = { "7d": 7, "30d": 30, "90d": 90, All: 3650 } as const;

function Performance() {
  const accounts = useAccounts();
  const [range, setRange] = useState<keyof typeof ranges>("30d");
  const trades = useQuery({
    queryKey: ["closed-trades", range],
    queryFn: async () => {
      const since = new Date(Date.now() - ranges[range] * 864e5).toISOString();
      const { data, error } = await supabase.from("trades").select("*").eq("status", "closed").gte("closed_at", since).order("closed_at");
      if (error) throw error;
      return data;
    },
  });

  if (accounts.data && accounts.data.length === 0)
    return (<><PageHeader title="Performance" subtitle="Closed trade history from your MT5 accounts" /><Empty title="No MT5 accounts connected.">Add an MT5 account and install the EA to start tracking performance.</Empty></>);

  const list = trades.data ?? [];
  const wins = list.filter((t) => Number(t.profit) > 0);
  const net = list.reduce((s, t) => s + Number(t.profit ?? 0), 0);
  const grossW = wins.reduce((s, t) => s + Number(t.profit), 0);
  const grossL = Math.abs(list.filter((t) => Number(t.profit) < 0).reduce((s, t) => s + Number(t.profit), 0));
  let cum = 0;
  const curve = list.map((t) => ({ d: new Date(t.closed_at!).toLocaleDateString(), v: Number((cum += Number(t.profit ?? 0)).toFixed(2)) }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance"
        subtitle="Closed trade history from your MT5 accounts"
        actions={<div className="flex rounded-lg border border-border p-0.5">{(Object.keys(ranges) as (keyof typeof ranges)[]).map((r) => <button key={r} onClick={() => setRange(r)} className={`rounded-md px-3 py-1 text-xs ${range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{r}</button>)}</div>}
      />
      {trades.isError && <Empty title="Failed to load performance data. Please try again." />}
      <div className="grid gap-4 sm:grid-cols-4">
        {[["Net profit", `${net >= 0 ? "+" : ""}${fmt(net)}`], ["Trades", String(list.length)], ["Win rate", list.length ? `${Math.round((wins.length / list.length) * 100)}%` : "—"], ["Profit factor", grossL ? fmt(grossW / grossL) : "—"]].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 text-2xl font-semibold">{v}</p></div>
        ))}
      </div>
      <Panel title="Equity curve">
        {curve.length === 0 ? <p className="text-sm text-muted-foreground">No closed trades in this period.</p> : (
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={curve}>
                <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="d" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }} />
                <Area dataKey="v" stroke="var(--primary)" fill="url(#g)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
      <Panel title="Closed trade history">
        {list.length === 0 ? <p className="text-sm text-muted-foreground">No closed trades in this period.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="pb-2">Closed</th><th>Symbol</th><th>Side</th><th>Lots</th><th>Open</th><th>Close</th><th className="text-right">Profit</th></tr></thead>
              <tbody>{[...list].reverse().map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="py-2 text-xs text-muted-foreground">{new Date(t.closed_at!).toLocaleString()}</td>
                  <td className="font-mono">{t.symbol}</td><td>{t.side.toUpperCase()}</td><td>{t.volume}</td>
                  <td>{fmt(t.open_price, 5)}</td><td>{fmt(t.close_price, 5)}</td>
                  <td className={`text-right ${Number(t.profit) >= 0 ? "text-success" : "text-destructive"}`}>{fmt(t.profit)}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
