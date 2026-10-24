import { useT, HelpNote, LanguageToggle } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Trash2 } from "lucide-react";
import { Page, Card } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getQuotes } from "@/lib/market.functions";
import { fmt, isOnline, priceDigits, useAccounts, useInstruments } from "@/lib/trading";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/hedge")({
  head: () => ({ meta: [{ title: "Hedge | Ufuq Trade" }, { name: "description", content: "Open opposite trades on two groups of your accounts at the same moment." }] }),
  component: Hedge,
});

const UNIT = { seconds: 1, minutes: 60, hours: 3600 } as const;

function Seg<T extends string>({ value, options, on }: { value: T; options: [T, string][]; on: (v: T) => void }) {
  const t = useT();
  return (
    <div className="grid grid-cols-2 gap-1 rounded-full bg-secondary p-1 text-sm">
      {options.map(([k, l]) => <button key={k} onClick={() => on(k)} className={cn("rounded-full py-2 font-semibold", value === k ? "bg-background" : "text-muted-foreground")}>{t(l)}</button>)}
    </div>
  );
}

function Hedge() {
  const t = useT();
  const qc = useQueryClient();
  const accounts = useAccounts();
  const instruments = useInstruments();
  const plans = useQuery({ queryKey: ["hedges"], queryFn: async () => (await supabase.from("hedge_plans").select("*").order("created_at", { ascending: false }).limit(20)).data ?? [], refetchInterval: 10_000 });

  const [symbol, setSymbol] = useState("");
  useEffect(() => { if (!symbol && instruments.data?.length) setSymbol(instruments.data[0]!.symbol); }, [instruments.data, symbol]);
  const inst = instruments.data?.find((i) => i.symbol === symbol);
  const quotesFn = useServerFn(getQuotes);
  const quote = useQuery({
    queryKey: ["quote", inst?.symbol], enabled: !!inst?.yahoo_symbol, refetchInterval: 10_000,
    queryFn: async () => (await quotesFn({ data: { items: [{ symbol: inst!.symbol, yahoo: inst!.yahoo_symbol! }] } }))[0] ?? null,
  });

  const [left, setLeft] = useState<string[]>([]);
  const [right, setRight] = useState<string[]>([]);
  const [sideA, setSideA] = useState<"buy" | "sell">("buy");
  const [mode, setMode] = useState<"count" | "margin">("count");
  const [count, setCount] = useState("1");
  const [lot, setLot] = useState("0.01");
  const [when, setWhen] = useState<"time" | "price">("time");
  const [timeMode, setTimeMode] = useState<"in" | "at">("in");
  const [amount, setAmount] = useState("10");
  const [unit, setUnit] = useState<keyof typeof UNIT>("seconds");
  const [at, setAt] = useState("");
  const [level, setLevel] = useState("");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);

  const accs = accounts.data ?? [];
  const add = (g: "l" | "r", id: string) => {
    (g === "l" ? setLeft : setRight)((s) => [...s, id]);
    (g === "l" ? setRight : setLeft)((s) => s.filter((x) => x !== id));
  };

  const triggerAt = when === "price" ? null : timeMode === "in" ? (Number(amount) > 0 ? new Date(Date.now() + Number(amount) * UNIT[unit] * 1000) : null) : at ? new Date(at + ":00Z") : null;
  const valid = left.length > 0 && right.length > 0 && Number(lot) >= 0.01 && (mode === "margin" || Number(count) >= 1) && (when === "price" ? Number(level) > 0 : !!triggerAt && !Number.isNaN(triggerAt.getTime()));

  const arm = async () => {
    if (!valid) return toast.error(t("Add accounts on both sides and set when to open."));
    if (triggerAt && triggerAt.getTime() < Date.now() - 1000) return toast.error(t("That time is in the past."));
    const offline = [...left, ...right].map((id) => accs.find((a) => a.id === id)!).filter((a) => !isOnline(a));
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("hedge_plans").insert({
      user_id: u.user!.id, symbol, lot_size: Number(lot), group_a: left, group_b: right, side_a: sideA,
      until_no_margin: mode === "margin", trades_per_account: mode === "margin" ? null : Math.min(50, Math.max(1, Math.floor(Number(count)))),
      trigger_type: when, trigger_at: triggerAt?.toISOString() ?? null, trigger_price: when === "price" ? Number(level) : null,
    });
    if (error) return toast.error(t("Could not arm the hedge."));
    toast.success(t("Hedge armed."), { description: offline.length ? t("{n} account(s) EA offline — they open when the EA reconnects.", { n: offline.length }) : t("Your EAs will open it at the trigger.") });
    void qc.invalidateQueries({ queryKey: ["hedges"] });
  };

  const group = (g: "l" | "r") => {
    const ids = g === "l" ? left : right;
    const side = g === "l" ? sideA : sideA === "buy" ? "sell" : "buy";
    const free = accs.filter((a) => !left.includes(a.id) && !right.includes(a.id));
    return (
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-bold">{g === "l" ? t("Left") : t("Right")}</p>
          {g === "l" ? (
            <div className="flex rounded-full bg-secondary p-1 text-xs font-bold">
              <button onClick={() => setSideA("buy")} className={cn("rounded-full px-3 py-1", sideA === "buy" ? "bg-success text-success-foreground" : "text-muted-foreground")}>{t("BUY")}</button>
              <button onClick={() => setSideA("sell")} className={cn("rounded-full px-3 py-1", sideA === "sell" ? "bg-destructive text-destructive-foreground" : "text-muted-foreground")}>{t("SELL")}</button>
            </div>
          ) : <span className={cn("rounded-full px-3 py-1 text-xs font-bold", side === "buy" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>{t(side.toUpperCase())}</span>}
        </div>
        {ids.length === 0 ? <p className="mb-3 text-sm text-muted-foreground">{t("No accounts yet")}</p> : (
          <div className="mb-3 space-y-1">
            {ids.map((id) => { const a = accs.find((x) => x.id === id); return a && (
              <div key={id} className="flex items-center justify-between rounded-full bg-background px-3 py-1.5 text-sm">
                <span className="truncate">{a.label || a.login} <span className="text-xs text-muted-foreground">#{a.login}</span></span>
                <button aria-label={t("Remove")} onClick={() => (g === "l" ? setLeft : setRight)((s) => s.filter((x) => x !== id))}><X className="h-3.5 w-3.5" /></button>
              </div>
            ); })}
          </div>
        )}
        <Select value="" onValueChange={(v) => add(g, v)}>
          <SelectTrigger className="h-10 rounded-full"><SelectValue placeholder={t("+ Add account")} /></SelectTrigger>
          <SelectContent>{free.length === 0 ? <div className="p-2 text-xs text-muted-foreground">{t("No more accounts")}</div> : free.map((a) => <SelectItem key={a.id} value={a.id}>{a.label || a.login} #{a.login}</SelectItem>)}</SelectContent>
        </Select>
      </Card>
    );
  };

  const d = priceDigits(quote.data?.price);
  return (
    <Page wide title={t("Hedge")} subtitle={t("Open opposite trades on two groups of your accounts at the same moment — at a time or when price reaches a level.")}>
      <HelpNote>{"Create a hedge by choosing an instrument and adding accounts to two opposite trading groups. Set the lot size and a time or price trigger, then arm the hedge."}</HelpNote>
      <Card className="p-5">
        <p className="mb-2 text-xs font-semibold tracking-widest text-muted-foreground">{t("INSTRUMENT")}</p>
        <div className="flex items-center gap-3">
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger className="h-10 flex-1 rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>{(instruments.data ?? []).map((i) => <SelectItem key={i.id} value={i.symbol}>{i.symbol} — {i.name}</SelectItem>)}</SelectContent>
          </Select>
          <span className="font-mono text-sm font-semibold text-success">{quote.data?.price != null ? fmt(quote.data.price, d) : "—"}</span>
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">{group("l")}{group("r")}</div>
      <Card className="p-5">
        <p className="mb-2 text-xs font-semibold tracking-widest text-muted-foreground">{t("TRADES PER ACCOUNT")}</p>
        <Seg value={mode} on={setMode} options={[["count", "Number of trades"], ["margin", "Until no free margin"]]} />
        <div className="mt-3 grid grid-cols-2 gap-3">
          {mode === "count" ? <Input value={count} onChange={(e) => setCount(e.target.value)} inputMode="numeric" className="h-10 rounded-full" aria-label={t("Number of trades")} /> : <p className="self-center text-xs text-muted-foreground">{t("Each account keeps opening until its free margin runs out.")}</p>}
          <div className="relative"><Input value={lot} onChange={(e) => setLot(e.target.value)} inputMode="decimal" className="h-10 rounded-full pe-12" aria-label={t("Lot size")} /><span className="absolute end-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{t("lots")}</span></div>
        </div>
      </Card>
      <Card className="p-5">
        <p className="mb-2 text-xs font-semibold tracking-widest text-muted-foreground">{t("OPEN WHEN")}</p>
        <Seg value={when} on={setWhen} options={[["time", "Time"], ["price", "Price level"]]} />
        {when === "time" ? (
          <div className="mt-2 space-y-3">
            <Seg value={timeMode} on={setTimeMode} options={[["in", "In the next…"], ["at", "Exact time (UTC)"]]} />
            {timeMode === "in" ? (
              <div className="grid grid-cols-2 gap-3">
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="h-10 rounded-full" aria-label={t("Amount")} />
                <Select value={unit} onValueChange={(v) => setUnit(v as keyof typeof UNIT)}><SelectTrigger className="h-10 rounded-full"><SelectValue /></SelectTrigger><SelectContent>{Object.keys(UNIT).map((u) => <SelectItem key={u} value={u}>{t(u)}</SelectItem>)}</SelectContent></Select>
              </div>
            ) : <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="h-10 rounded-full" />}
            <p className="text-xs text-muted-foreground">{t("Now:")} {now.toISOString().replace("T", " ").slice(0, 19)}  {t("UTC")}</p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <Input value={level} onChange={(e) => setLevel(e.target.value)} placeholder={quote.data?.price ? fmt(quote.data.price, d) : t("Price level")} inputMode="decimal" className="h-10 rounded-full" />
            <p className="text-xs text-muted-foreground">{t("Opens the moment price reaches this level (from either direction).")}</p>
          </div>
        )}
      </Card>
      <Button variant="hero" className="h-12 w-full rounded-full text-base" disabled={!valid} onClick={arm}>{t("Arm hedge")}</Button>

      {(plans.data ?? []).length > 0 && (
        <Card title={t("Your hedge plans")} className="p-5">
          <ul className="space-y-2">
            {plans.data!.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-2xl bg-background/60 p-3 text-sm">
                <div>
                  <p className="font-semibold">{p.symbol} · {p.lot_size}  {t("lots · Left")} {p.side_a.toUpperCase()} ({p.group_a.length}{t(") / Right")} {p.side_a === "buy" ? t("SELL") : t("BUY")} ({p.group_b.length})</p>
                  <p className="text-xs text-muted-foreground">{p.trigger_type === "price" ? `At price ${p.trigger_price}` : `At ${p.trigger_at ? new Date(p.trigger_at).toISOString().replace("T", " ").slice(0, 19) : "—"} UTC`} · {p.until_no_margin ? t("Until no free margin") : `${p.trades_per_account} trade(s)/account`}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs", p.status === "armed" ? "text-warning" : p.status === "executed" ? "text-success" : "text-muted-foreground")}>{p.status}</span>
                  {p.status === "armed" && <Button size="icon" variant="ghost" aria-label={t("Cancel")} onClick={async () => { await supabase.from("hedge_plans").update({ status: "cancelled" }).eq("id", p.id); void qc.invalidateQueries({ queryKey: ["hedges"] }); }}><Trash2 /></Button>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}
