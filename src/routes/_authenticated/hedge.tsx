import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { PageHeader, Panel, Empty } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAccounts } from "@/lib/trading";

export const Route = createFileRoute("/_authenticated/hedge")({
  head: () => ({ meta: [{ title: "Hedge | Arrissa AI" }] }),
  component: Hedge,
});

function Hedge() {
  const qc = useQueryClient();
  const accounts = useAccounts();
  const instruments = useQuery({ queryKey: ["instruments"], queryFn: async () => (await supabase.from("instruments").select("*").eq("is_active", true).order("sort_order")).data ?? [] });
  const plans = useQuery({ queryKey: ["hedges"], queryFn: async () => (await supabase.from("hedge_plans").select("*").order("created_at", { ascending: false })).data ?? [] });

  const [groupA, setA] = useState<string[]>([]);
  const [groupB, setB] = useState<string[]>([]);
  const [symbol, setSymbol] = useState("XAUUSD");
  const [sideA, setSideA] = useState<"buy" | "sell">("buy");
  const [lot, setLot] = useState("0.01");
  const [untilMargin, setUntil] = useState(false);
  const [count, setCount] = useState("1");
  const [trigger, setTrigger] = useState<"in" | "time" | "price">("in");
  const [minutes, setMinutes] = useState("5");
  const [at, setAt] = useState("");
  const [price, setPrice] = useState("");

  const toggle = (id: string, g: "a" | "b") => {
    const [set, other] = g === "a" ? [setA, setB] : [setB, setA];
    set((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    other((s) => s.filter((x) => x !== id));
  };

  const arm = async () => {
    if (!groupA.length || !groupB.length) return toast.error("Pick at least one account in each group.");
    const triggerAt = trigger === "in" ? new Date(Date.now() + Number(minutes) * 60_000).toISOString() : trigger === "time" && at ? new Date(at + "Z").toISOString() : null;
    if (trigger !== "price" && !triggerAt) return toast.error("Choose a time.");
    if (trigger === "price" && !Number(price)) return toast.error("Enter a price level.");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("hedge_plans").insert({
      user_id: u.user!.id, symbol, lot_size: Number(lot), group_a: groupA, group_b: groupB, side_a: sideA,
      until_no_margin: untilMargin, trades_per_account: untilMargin ? null : Math.max(1, Number(count) || 1),
      trigger_type: trigger === "price" ? "price" : "time", trigger_at: triggerAt, trigger_price: trigger === "price" ? Number(price) : null,
    });
    if (error) return toast.error("Could not arm the hedge.");
    toast.success("Hedge armed. Your EAs will execute it at the trigger.");
    void qc.invalidateQueries({ queryKey: ["hedges"] });
  };

  const cancel = async (id: string) => {
    await supabase.from("hedge_plans").update({ status: "cancelled" }).eq("id", id);
    void qc.invalidateQueries({ queryKey: ["hedges"] });
  };

  const accs = accounts.data ?? [];
  return (
    <div className="space-y-6">
      <PageHeader title="Hedge" subtitle="Open opposite trades on two groups of your accounts at the same moment — at a time or when price reaches a level." />
      {accs.length === 0 ? (
        <Empty title="No accounts yet">Add an MT5 account first (<Link to="/accounts/add-mt5" className="text-primary-glow underline">Accounts → Add MT5 Account</Link>).</Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Opposite trades on two account groups">
            <div className="grid grid-cols-2 gap-4">
              {(["a", "b"] as const).map((g) => (
                <div key={g}>
                  <p className="mb-2 text-sm font-medium">Group {g.toUpperCase()} · <span className={(g === "a" ? sideA : sideA === "buy" ? "sell" : "buy") === "buy" ? "text-success" : "text-destructive"}>{(g === "a" ? sideA : sideA === "buy" ? "sell" : "buy").toUpperCase()}</span></p>
                  <div className="space-y-2">
                    {accs.map((a) => (
                      <label key={a.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                        <Checkbox checked={(g === "a" ? groupA : groupB).includes(a.id)} onCheckedChange={() => toggle(a.id, g)} />
                        <span className="truncate">{a.label || a.login}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Instrument</Label>
                <Select value={symbol} onValueChange={setSymbol}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(instruments.data ?? []).map((i) => <SelectItem key={i.id} value={i.symbol}>{i.symbol}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Group A side</Label>
                <Select value={sideA} onValueChange={(v) => setSideA(v as "buy" | "sell")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="buy">Buy</SelectItem><SelectItem value="sell">Sell</SelectItem></SelectContent></Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Lot size</Label><Input value={lot} onChange={(e) => setLot(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Trades per account</Label><Input value={count} disabled={untilMargin} onChange={(e) => setCount(e.target.value)} /></div>
            </div>
            <label className="mt-4 flex items-start gap-3 text-sm">
              <Switch checked={untilMargin} onCheckedChange={setUntil} />
              <span><span className="font-medium">Until no free margin</span><br /><span className="text-xs text-muted-foreground">Each account keeps opening its lot size until its free margin runs out.</span></span>
            </label>
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-border p-0.5 text-xs">
                {([["in", "In the next…"], ["time", "Exact time (UTC)"], ["price", "At price"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setTrigger(k)} className={`rounded-md py-1 ${trigger === k ? "bg-secondary" : "text-muted-foreground"}`}>{l}</button>
                ))}
              </div>
              {trigger === "in" && <div className="flex items-center gap-2"><Input value={minutes} onChange={(e) => setMinutes(e.target.value)} className="w-24" /><span className="text-sm text-muted-foreground">minutes</span></div>}
              {trigger === "time" && <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />}
              {trigger === "price" && <><Input placeholder="Price level" value={price} onChange={(e) => setPrice(e.target.value)} /><p className="text-xs text-muted-foreground">Opens the moment price reaches this level (either direction from now).</p></>}
            </div>
            <Button variant="hero" className="mt-5 w-full" onClick={arm}>Arm hedge</Button>
          </Panel>
          <Panel title="Your hedge plans">
            {(plans.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No hedge plans yet.</p> : (
              <ul className="space-y-2">
                {plans.data!.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                    <div>
                      <p className="font-medium">{p.symbol} · {p.lot_size} lots · A {p.side_a.toUpperCase()}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.trigger_type === "price" ? `At price ${p.trigger_price}` : `At ${new Date(p.trigger_at!).toUTCString()}`} · {p.until_no_margin ? "Until no free margin" : `${p.trades_per_account} trade(s)/account`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${p.status === "armed" ? "text-warning" : p.status === "executed" ? "text-success" : "text-muted-foreground"}`}>{p.status}</span>
                      {p.status === "armed" && <Button size="icon" variant="ghost" onClick={() => cancel(p.id)} aria-label="Cancel"><Trash2 /></Button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
