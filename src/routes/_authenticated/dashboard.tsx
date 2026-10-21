import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Brain, ArrowUpRight, ArrowDownRight, XCircle, Scale, Eraser, Ban, Wifi, WifiOff, Loader2 } from "lucide-react";
import { PageHeader, Panel, Empty } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { analyzeMarket } from "@/lib/ai.functions";
import { fmt, isOnline, queueCommand, useAccounts, type Account } from "@/lib/trading";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | Arrissa AI" }] }),
  component: Dashboard,
});

const TF = ["M5", "M15", "H1", "H4", "D1"] as const;
const tvInterval: Record<(typeof TF)[number], string> = { M5: "5", M15: "15", H1: "60", H4: "240", D1: "D" };

function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const accounts = useAccounts();
  const instruments = useQuery({
    queryKey: ["instruments"],
    queryFn: async () => (await supabase.from("instruments").select("*").eq("is_active", true).order("sort_order")).data ?? [],
  });
  const profile = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle()).data,
  });

  const [symbol, setSymbol] = useState<string>("");
  const [tf, setTf] = useState<(typeof TF)[number]>("H1");
  useEffect(() => {
    if (!symbol && instruments.data?.length) setSymbol(profile.data?.default_instrument ?? instruments.data[0]!.symbol);
  }, [instruments.data, profile.data, symbol]);
  const inst = instruments.data?.find((i) => i.symbol === symbol);

  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (accounts.data && !selected.length) setSelected(accounts.data.map((a) => a.id));
  }, [accounts.data, selected.length]);
  const chosen = useMemo(() => (accounts.data ?? []).filter((a) => selected.includes(a.id)), [accounts.data, selected]);

  const trades = useQuery({
    queryKey: ["open-trades"],
    queryFn: async () => (await supabase.from("trades").select("*").eq("status", "open").order("opened_at", { ascending: false })).data ?? [],
    refetchInterval: 15_000,
  });
  const commands = useQuery({
    queryKey: ["commands"],
    queryFn: async () => (await supabase.from("trade_commands").select("*").order("created_at", { ascending: false }).limit(8)).data ?? [],
    refetchInterval: 10_000,
  });
  const signals = useQuery({
    queryKey: ["signals"],
    queryFn: async () => (await supabase.from("signals").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(5)).data ?? [],
  });

  // AI
  const analyze = useServerFn(analyzeMarket);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = useQuery({
    queryKey: ["analysis", symbol],
    enabled: !!symbol,
    queryFn: async () => (await supabase.from("analyses").select("*").eq("symbol", symbol).order("created_at", { ascending: false }).limit(1).maybeSingle()).data,
  });
  const runAnalysis = async () => {
    setBusy(true);
    try {
      await analyze({ data: { symbol, timeframe: tf, price: price ? Number(price) : null } });
      await qc.invalidateQueries({ queryKey: ["analysis", symbol] });
      toast.success("Analysis received.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setBusy(false);
    }
  };

  // Order
  const [order, setOrder] = useState({ type: "market", lot: "0.01", sl: "", tp: "", price: "", count: "1", delay: "0" });
  const place = async (side: "buy" | "sell") => {
    const ok = await queueCommand(chosen, "open_trade", {
      symbol, side, order_type: order.type,
      lot: Number(order.lot), sl: order.sl ? Number(order.sl) : null, tp: order.tp ? Number(order.tp) : null,
      price: order.type === "market" ? null : Number(order.price) || null,
      count: Math.max(1, Math.min(50, Number(order.count) || 1)), delay_seconds: Math.max(0, Number(order.delay) || 0),
    });
    if (ok) void qc.invalidateQueries({ queryKey: ["commands"] });
  };
  const manage = async (cmd: Parameters<typeof queueCommand>[1], payload = {}) => {
    if (await queueCommand(chosen, cmd, payload)) void qc.invalidateQueries({ queryKey: ["commands"] });
  };
  const [cap, setCap] = useState("");
  const [trail, setTrail] = useState("");

  const a = latest.data;
  const totalEquity = (accounts.data ?? []).reduce((s, x) => s + Number(x.equity ?? 0), 0);
  const totalBalance = (accounts.data ?? []).reduce((s, x) => s + Number(x.balance ?? 0), 0);
  const floating = (trades.data ?? []).reduce((s, x) => s + Number(x.profit ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="AI analysis, execution and trade management" />

      {accounts.data && accounts.data.length === 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="font-medium">No accounts yet</p>
          <p className="text-muted-foreground">Add an MT5 account first, then install the EA to start executing. <Link to="/accounts/add-mt5" className="text-primary-glow underline">Add MT5 Account</Link></p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Balance" value={`$${fmt(totalBalance)}`} />
        <Stat label="Equity" value={`$${fmt(totalEquity)}`} />
        <Stat label="Floating P/L" value={`${floating >= 0 ? "+" : ""}${fmt(floating)}`} tone={floating >= 0 ? "up" : "down"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Instrument" /></SelectTrigger>
                <SelectContent>{(instruments.data ?? []).map((i) => <SelectItem key={i.id} value={i.symbol}>{i.symbol}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex rounded-lg border border-border p-0.5">
                {TF.map((t) => (
                  <button key={t} onClick={() => setTf(t)} className={`rounded-md px-3 py-1 text-xs ${tf === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t}</button>
                ))}
              </div>
            </div>
            {inst ? (
              <iframe
                key={inst.tv_symbol + tf}
                title="Chart"
                className="h-[460px] w-full rounded-lg border border-border"
                src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(inst.tv_symbol)}&interval=${tvInterval[tf]}&theme=dark&style=1&hide_side_toolbar=0&withdateranges=1&timezone=Etc%2FUTC`}
              />
            ) : <div className="h-[460px] animate-pulse rounded-lg bg-muted" />}
            <p className="mt-2 text-xs text-muted-foreground">Charting by TradingView</p>
          </Panel>

          <Panel title="Open trades">
            {(trades.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No open trades. Positions reported by your EA appear here.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground"><tr><th className="pb-2">Symbol</th><th>Side</th><th>Lots</th><th>Open</th><th>SL</th><th>TP</th><th className="text-right">P/L</th></tr></thead>
                  <tbody>
                    {trades.data!.map((t) => (
                      <tr key={t.id} className="border-t border-border">
                        <td className="py-2 font-mono">{t.symbol}</td>
                        <td className={t.side === "buy" ? "text-success" : "text-destructive"}>{t.side.toUpperCase()}</td>
                        <td>{t.volume}</td><td>{fmt(t.open_price, 5)}</td><td>{fmt(t.stop_loss, 5)}</td><td>{fmt(t.take_profit, 5)}</td>
                        <td className={`text-right ${Number(t.profit) >= 0 ? "text-success" : "text-destructive"}`}>{fmt(t.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="AI analysis">
            <div className="flex gap-2">
              <Input placeholder="Current price (optional)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
              <Button variant="hero" onClick={runAnalysis} disabled={busy || !symbol}>{busy ? <Loader2 className="animate-spin" /> : <Brain />} Analyse</Button>
            </div>
            {a ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold ${a.direction === "buy" ? "bg-success/15 text-success" : a.direction === "sell" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>
                    {a.direction === "buy" ? <ArrowUpRight className="h-4 w-4" /> : a.direction === "sell" ? <ArrowDownRight className="h-4 w-4" /> : null}
                    {a.direction.toUpperCase()} {a.symbol}
                  </span>
                  <span className="text-xs text-muted-foreground">{a.timeframe} · {new Date(a.created_at).toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-gradient-primary" style={{ width: `${a.confidence ?? 0}%` }} /></div>
                <p className="text-xs text-muted-foreground">Confidence {a.confidence}%</p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <Level label="Entry" v={a.entry} /><Level label="SL" v={a.stop_loss} /><Level label="TP" v={a.take_profit} />
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{a.summary}</p>
                {a.direction !== "neutral" && (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setOrder((o) => ({ ...o, sl: a.stop_loss?.toString() ?? "", tp: a.take_profit?.toString() ?? "" }))}>Use SL/TP in order</Button>
                )}
              </div>
            ) : <p className="mt-4 text-sm text-muted-foreground">Request an analysis for {symbol || "an instrument"}.</p>}
            <p className="mt-3 text-[11px] text-muted-foreground">AI analysis is not financial advice.</p>
          </Panel>

          <Panel title="Accounts">
            {(accounts.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No accounts connected.</p> : (
              <div className="space-y-2">
                {accounts.data!.map((acc: Account) => (
                  <label key={acc.id} className="flex items-center gap-3 rounded-lg border border-border p-2 text-sm">
                    <Checkbox checked={selected.includes(acc.id)} onCheckedChange={(v) => setSelected((s) => (v ? [...s, acc.id] : s.filter((x) => x !== acc.id)))} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{acc.label || acc.login} <span className="text-xs uppercase text-muted-foreground">{acc.platform}</span></p>
                      <p className="text-xs text-muted-foreground">${fmt(acc.equity)} equity</p>
                    </div>
                    {isOnline(acc) ? <Wifi className="h-4 w-4 text-success" /> : <WifiOff className="h-4 w-4 text-muted-foreground" />}
                  </label>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="New order">
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-border p-0.5 text-xs">
              {["market", "limit", "stop"].map((t) => (
                <button key={t} onClick={() => setOrder({ ...order, type: t })} className={`rounded-md py-1 capitalize ${order.type === t ? "bg-secondary" : "text-muted-foreground"}`}>{t}</button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Lot size" v={order.lot} on={(v) => setOrder({ ...order, lot: v })} />
              {order.type !== "market" && <Field label="Price" v={order.price} on={(v) => setOrder({ ...order, price: v })} />}
              <Field label="Stop loss" v={order.sl} on={(v) => setOrder({ ...order, sl: v })} />
              <Field label="Take profit" v={order.tp} on={(v) => setOrder({ ...order, tp: v })} />
              <Field label="Number of trades" v={order.count} on={(v) => setOrder({ ...order, count: v })} />
              <Field label="Delay (sec)" v={order.delay} on={(v) => setOrder({ ...order, delay: v })} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="success" onClick={() => place("buy")}><ArrowUpRight /> Buy</Button>
              <Button variant="destructive" onClick={() => place("sell")}><ArrowDownRight /> Sell</Button>
            </div>
          </Panel>

          <Panel title="Trade management">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={() => manage("close_all")}><XCircle /> Close all</Button>
              <Button variant="outline" size="sm" onClick={() => manage("break_even")}><Scale /> Break even</Button>
              <Button variant="outline" size="sm" onClick={() => manage("delete_sl")}><Eraser /> Delete SL</Button>
              <Button variant="outline" size="sm" onClick={() => manage("clear_pending")}><Ban /> Cancel pending</Button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex gap-2"><Input placeholder="Cap loss at (e.g. -200)" value={cap} onChange={(e) => setCap(e.target.value)} /><Button size="sm" variant="secondary" onClick={() => cap && manage("cap_loss", { threshold: Number(cap) })}>Set</Button></div>
              <div className="flex gap-2"><Input placeholder="Trailing profit lock ($)" value={trail} onChange={(e) => setTrail(e.target.value)} /><Button size="sm" variant="secondary" onClick={() => trail && manage("trailing_profit", { threshold: Number(trail) })}>Activate</Button></div>
            </div>
          </Panel>

          <Panel title="Recent commands">
            {(commands.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : (
              <ul className="space-y-2 text-sm">
                {commands.data!.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span className="truncate">{c.command.replace(/_/g, " ")}</span>
                    <span className={`text-xs ${c.status === "done" ? "text-success" : c.status === "failed" ? "text-destructive" : "text-warning"}`}>{c.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {(signals.data ?? []).length > 0 && (
            <Panel title="Platform signals">
              <ul className="space-y-2 text-sm">
                {signals.data!.map((s) => (
                  <li key={s.id} className="rounded-lg border border-border p-2">
                    <span className={s.direction === "buy" ? "text-success" : "text-destructive"}>{s.direction.toUpperCase()}</span> <span className="font-mono">{s.symbol}</span>
                    <span className="ml-2 text-xs text-muted-foreground">E {fmt(s.entry, 5)} · SL {fmt(s.stop_loss, 5)} · TP {fmt(s.take_profit, 5)}</span>
                    {s.note && <p className="mt-1 text-xs text-muted-foreground">{s.note}</p>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
      {accounts.isError && <Empty title="Could not load accounts." />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === "up" ? "text-success" : tone === "down" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}
function Level({ label, v }: { label: string; v: number | null }) {
  return <div className="rounded-md bg-muted p-2"><p className="text-muted-foreground">{label}</p><p className="font-mono">{fmt(v, 5)}</p></div>;
}
function Field({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label><Input inputMode="decimal" value={v} onChange={(e) => on(e.target.value)} /></div>;
}
