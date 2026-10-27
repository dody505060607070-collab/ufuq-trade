import { useT, HelpNote, LanguageToggle } from "@/lib/i18n";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown, Star, Settings2, CandlestickChart, Eye, EyeOff, Target, ListFilter, Clock, Loader2, ArrowUpRight, ArrowDownRight,
  Wifi, WifiOff, Brain,
} from "lucide-react";
import { Tip } from "@/components/app/AppShell";
import { InstrumentPicker } from "@/components/app/InstrumentPicker";
import { InstrumentIcon, BrokerLogo } from "@/components/app/InstrumentIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { analyzeMarket } from "@/lib/ai.functions";
import { getCalendar, getNews, getQuotes } from "@/lib/market.functions";
import { fmt, isOnline, priceDigits, queueCommand, timeAgo, useAccounts, useBrokers, useInstruments, useProfile, validateOrder, type Account } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { RestartAutopilotButton } from "@/components/app/RestartAutopilotButton";
import { LiveStatusBar } from "@/components/app/LiveStatusBar";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | Ufuq Trade" }, { name: "description", content: "AI analysis, execution and trade management for your MT5 accounts." }] }),
  component: Dashboard,
});

const TF = ["M5", "M15", "H1", "H4", "D1"] as const;
type Tf = (typeof TF)[number];
const tvInterval: Record<Tf, string> = { M5: "5", M15: "15", H1: "60", H4: "240", D1: "D" };
const AUTO_KEY = "arrissa.autoAnalysis";
const inputCls = "h-11 rounded-full border-border bg-transparent text-center";

function Dashboard() {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const accounts = useAccounts();
  const instruments = useInstruments();
  const brokers = useBrokers();
  const profile = useProfile();
  const prefs = profile.data;

  // ----- account
  const [accountId, setAccountId] = useState<string>("");
  useEffect(() => {
    const list = accounts.data ?? [];
    if (!list.length) return;
    if (!accountId || !list.some((a) => a.id === accountId)) {
      const def = list.find((a) => a.id === prefs?.default_account_id);
      setAccountId((def ?? list[0]!).id);
    }
  }, [accounts.data, prefs?.default_account_id, accountId]);
  const account = accounts.data?.find((a) => a.id === accountId);
  const online = account ? isOnline(account) : false;

  // ----- instrument
  const [symbol, setSymbol] = useState("");
  useEffect(() => {
    if (!symbol && instruments.data?.length) {
      const want = prefs?.default_instrument;
      setSymbol(instruments.data.some((i) => i.symbol === want) ? want! : instruments.data[0]!.symbol);
    }
  }, [instruments.data, prefs?.default_instrument, symbol]);
  const inst = instruments.data?.find((i) => i.symbol === symbol);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [tf, setTf] = useState<Tf>("H1");

  const quotesFn = useServerFn(getQuotes);
  const quote = useQuery({
    queryKey: ["quote", inst?.symbol],
    enabled: !!inst?.yahoo_symbol,
    refetchInterval: 15_000,
    queryFn: async () => (await quotesFn({ data: { items: [{ symbol: inst!.symbol, yahoo: inst!.yahoo_symbol! }] } }))[0] ?? null,
  });
  const price = quote.data?.price ?? null;

  // ----- trades
  const trades = useQuery({
    queryKey: ["open-trades"],
    queryFn: async () => (await supabase.from("trades").select("*").eq("status", "open").order("opened_at", { ascending: false })).data ?? [],
    refetchInterval: 5_000,
  });
  const accTrades = (trades.data ?? []).filter((t) => t.account_id === accountId);
  const profit = accTrades.reduce((s, t) => s + Number(t.profit ?? 0), 0);

  // ----- order form
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState("market");
  const [lot, setLot] = useState("");
  const [count, setCount] = useState("1");
  const [interval, setIntervalS] = useState("1");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [orderPrice, setOrderPrice] = useState("");
  const [eaModal, setEaModal] = useState(false);
  const [sending, setSending] = useState(false);
  useEffect(() => { if (account) setLot(String(account.lot_size)); }, [account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show EA warning once per session when the selected account is offline.
  useEffect(() => {
    if (!account || online) return;
    const k = `arrissa.eaWarn.${account.id}`;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, "1");
    setEaModal(true);
  }, [account?.id, online]); // eslint-disable-line react-hooks/exhaustive-deps

  const execute = async () => {
    if (!account) return toast.error(t("Add an MT5 account first."));
    if (!online) return setEaModal(true);
    const o = {
      side, orderType, lot: Number(lot), count: Number(count), interval: Number(interval),
      sl: sl ? Number(sl) : null, tp: tp ? Number(tp) : null, price: orderPrice ? Number(orderPrice) : null, ref: price,
    };
    const err = validateOrder(o);
    if (err) return toast.error(t(err));
    setSending(true);
    const ok = await queueCommand([account], "open_trade", {
      symbol, side, order_type: orderType, lot: o.lot, sl: o.sl, tp: o.tp, price: orderType === "market" ? null : o.price, count: o.count, delay_seconds: o.interval,
    });
    setSending(false);
    if (ok) void qc.invalidateQueries({ queryKey: ["commands"] });
  };

  // ----- analysis
  const analyze = useServerFn(analyzeMarket);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [onlyCurrent, setOnlyCurrent] = useState(false);
  const [auto, setAuto] = useState(false);
  useEffect(() => setAuto(localStorage.getItem(AUTO_KEY) === "on"), []);
  const analyses = useQuery({
    queryKey: ["analyses"],
    queryFn: async () => (await supabase.from("analyses").select("*").order("created_at", { ascending: false }).limit(40)).data ?? [],
  });
  const signals = useQuery({
    queryKey: ["signals"],
    queryFn: async () => (await supabase.from("signals").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(10)).data ?? [],
  });
  const runAnalysis = useCallback(async (sym: string, timeframe: Tf, silent = false) => {
    if (!sym) return;
    setBusy(true);
    try {
      await analyze({ data: { symbol: sym, timeframe, price: null } });
      await qc.invalidateQueries({ queryKey: ["analyses"] });
      if (!silent) toast.success(t("Analysis for {symbol} ready.", { symbol: sym }));
      setAnalysisOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Analysis failed."));
    } finally {
      setBusy(false);
    }
  }, [analyze, qc]);
  const autoRef = useRef({ symbol, tf });
  autoRef.current = { symbol, tf };
  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => void runAnalysis(autoRef.current.symbol, autoRef.current.tf, true), 15 * 60_000);
    return () => window.clearInterval(id);
  }, [auto, runAnalysis]);
  const toggleAuto = () => {
    const v = !auto;
    setAuto(v);
    localStorage.setItem(AUTO_KEY, v ? "on" : "off");
    toast.success(v ? t("Auto analysis on — every {n} minutes for the selected instrument.", { n: 15 }) : t("Auto analysis off."));
    if (v) void runAnalysis(symbol, tf, true);
  };
  const useSignal = (s: { symbol: string; direction: string; stop_loss: number | null; take_profit: number | null }) => {
    if (s.direction !== "buy" && s.direction !== "sell") return toast.info(t("This analysis is neutral — no trade suggested."));
    setSymbol(s.symbol);
    setSide(s.direction);
    if (prefs?.copy_sl !== false) setSl(s.stop_loss?.toString() ?? "");
    if (prefs?.copy_tp !== false) setTp(s.take_profit?.toString() ?? "");
    toast.success(t("Signal loaded into the trading form."));
  };
  const shownAnalyses = (analyses.data ?? []).filter((a) => !onlyCurrent || a.symbol === symbol);
  const [showAll, setShowAll] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(true);

  const broker = (acc?: Account) => brokers.data?.find((b) => acc?.broker_name && b.name.toLowerCase() === acc.broker_name.toLowerCase());
  const [hide, setHide] = useState(false);
  const money = (n: number | null | undefined) => (hide ? "••••••" : `${account?.currency ?? "USD"} ${fmt(n)}`);

  return (
    <>
      <header className="space-y-3 p-5 pb-4"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-bold">{t("Dashboard")}</h1><RestartAutopilotButton /></div><LiveStatusBar /><HelpNote>{"Use the three columns to review AI analysis, place orders in the trade form, and monitor or manage open trades. Select an account and instrument before trading."}</HelpNote></header>
    <div className="grid gap-4 px-5 pb-5 xl:grid-cols-[360px_minmax(0,1fr)_370px]">
      {/* LEFT: analysis */}
      <aside className="order-2 space-y-4 self-start rounded-2xl border border-border bg-card/40 p-4 xl:order-none">
        <h2 className="text-xl font-bold">{t("Analysis")}</h2>
        <div className="grid grid-cols-[1.2fr_1fr_1.4fr] gap-2">
          <Button variant="hero" className="h-10 rounded-lg" onClick={() => setSettingsOpen((v) => !v)}>{t("Analysis")}</Button>
          <Tip label={onlyCurrent ? t("Showing current instrument only") : t("Show current instrument only")} side="bottom">
            <button onClick={() => setOnlyCurrent((v) => !v)} className={cn("flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border text-sm", onlyCurrent && "border-primary text-primary-glow")}><ListFilter className="h-4 w-4" />{t("Filter")}</button>
          </Tip>
          <Tip label={auto ? t("Auto analysis every 10 min: ON") : t("Auto analysis every 10 min: OFF")} side="bottom">
            <button onClick={toggleAuto} className={cn("flex h-10 items-center justify-center gap-1.5 rounded-lg border text-sm", auto ? "border-success bg-success/15 text-success" : "border-border")}><Clock className="h-4 w-4" />{t("Auto analysis")}</button>
          </Tip>
        </div>
        <div className="rounded-xl border border-border bg-background/40 p-3">
          <button onClick={() => setSettingsOpen((v) => !v)} className="flex w-full items-center gap-2 text-sm font-medium"><Settings2 className="h-4 w-4" />{t("Analysis settings")}<ChevronDown className={cn("ms-auto h-4 w-4 transition", settingsOpen && "rotate-180")} /></button>
          {settingsOpen && (
            <div className="mt-3 grid grid-cols-[auto_1fr] items-end gap-2">
              <div><p className="mb-1 text-xs text-muted-foreground">{t("Instrument")}</p>
                <button onClick={() => setPickerOpen(true)} className="flex h-9 items-center gap-2 rounded-lg border border-border px-2 text-sm font-semibold">{symbol || "…"}<ChevronDown className="h-3.5 w-3.5" /></button></div>
              <div><p className="mb-1 text-xs text-muted-foreground">{t("Timeframes")}</p>
                <div className="flex gap-1">
                  {TF.map((x) => <button key={x} onClick={() => setTf(x)} className={cn("h-9 flex-1 rounded-md border text-xs", tf === x ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{x}</button>)}
                </div></div>
              <Button variant="hero" className="col-span-2 h-9 rounded-lg" disabled={busy || !symbol} onClick={() => void runAnalysis(symbol, tf)}>{busy ? <Loader2 className="animate-spin" /> : <Brain />} {t("Analyse")}</Button>
            </div>
          )}
        </div>
        <h3 className="text-lg font-bold">{t("Recent Analysis")}</h3>
        {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />  {t("Analysing")} {symbol}…</p>}
        {(signals.data ?? []).map((s) => (
          <AnalysisCard key={s.id} tag={t("Platform signal")} symbol={s.symbol} direction={s.direction} entry={s.entry} sl={s.stop_loss} tp={s.take_profit} text={s.note} at={s.created_at} onUse={() => useSignal(s)} />
        ))}
        {shownAnalyses.length === 0 && !busy ? (
          <p className="pt-10 text-center text-sm text-muted-foreground">{t("No analysis yet. Open Analysis and request a symbol.")}</p>
        ) : (showAll ? shownAnalyses : shownAnalyses.slice(0, 3)).map((a) => (
          <AnalysisCard key={a.id} symbol={a.symbol} tag={a.timeframe ?? undefined} direction={a.direction} confidence={a.confidence} entry={a.entry} sl={a.stop_loss} tp={a.take_profit} text={a.summary} at={a.created_at} onUse={() => useSignal(a)} />
        ))}
        {shownAnalyses.length > 3 && (
          <Button variant="secondary" className="w-full rounded-lg" onClick={() => setShowAll((v) => !v)}>
            {showAll ? t("Show less") : `${t("Show all")} (${shownAnalyses.length})`}
          </Button>
        )}
        <p className="text-center text-[11px] text-muted-foreground">{t("AI analysis is not financial advice. Always manage your risk.")}</p>
      </aside>

      {/* CENTER: trading form */}
      <section className="order-1 min-w-0 space-y-4 xl:order-none">
       <div className="space-y-4 rounded-2xl border border-border bg-card/40 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">{t("Account & Trade")}</h2>
          <Link to="/challenge" className="flex h-9 items-center rounded-full border border-primary px-3 text-xs font-semibold text-primary">{t("$100 to $1M Demo Challenge")}</Link>
          <div className="flex gap-2">
            <button onClick={() => setHide((v) => !v)} className="flex h-9 items-center gap-2 rounded-full border border-border px-3 text-xs">{hide ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{hide ? t("Show values") : t("Hide values")}</button>
            <Tip label={online ? t("EA connected") : t("EA not connected")} side="bottom"><button onClick={() => !online && setEaModal(true)} aria-label={t("EA status")} className={cn("flex h-9 w-9 items-center justify-center rounded-full border", online ? "border-success text-success" : "border-border")}><Target className="h-4 w-4" /></button></Tip>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-xl border border-border bg-background/40 rtl:divide-x-reverse">
          <Metric label={t("Balance")} value={account ? money(account.balance) : null} />
          <Metric label={t("Equity")} value={account ? money(account.equity) : null} />
          <Metric label={t("Profit")} badge={String(accTrades.length)} value={account ? (hide ? "••••••" : `${profit >= 0 ? "+" : ""}${fmt(profit)}`) : null} tone={profit > 0 ? "up" : profit < 0 ? "down" : undefined} />
        </div>

        {/* account row */}
        <div className="flex gap-2">
          {(accounts.data ?? []).length === 0 ? (
            <Link to="/accounts/add-mt5" className="flex h-12 flex-1 items-center rounded-xl border border-dashed border-border px-4 text-sm text-muted-foreground hover:text-foreground">{t("+ Add an MT5 account to start trading")}</Link>
          ) : (
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-12 flex-1 rounded-xl px-3">
                {account && (
                  <div className="flex items-center gap-3 text-start">
                    <BrokerLogo name={account.broker_name} color={broker(account)?.brand_color} className="h-7 w-7 text-xs" />
                    <div className="leading-tight"><p className="font-semibold">{account.label || account.login}</p><p className="text-xs text-muted-foreground">#{account.login}</p></div>
                    {online ? <Wifi className="h-3.5 w-3.5 text-success" /> : <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                )}
              </SelectTrigger>
              <SelectContent>
                {accounts.data!.map((a) => <SelectItem key={a.id} value={a.id}>{a.label || a.login} · #{a.login} {isOnline(a) ? t("· online") : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" className="h-12 rounded-xl" disabled={!account} onClick={() => void profile.update({ default_account_id: accountId }, t("Default account saved."))}>
            <Star className={cn("h-4 w-4", prefs?.default_account_id === accountId && accountId && "fill-warning text-warning")} />  {t("Set Default")} </Button>
          <Link to="/settings" className="flex h-12 items-center gap-2 rounded-xl border border-border px-3 text-sm"><Settings2 className="h-4 w-4" />{t("EA Configuration")}</Link>
        </div>

        {/* instrument */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">{t("Select Instrument")}</p>
          <div className="flex gap-2">
            <button onClick={() => setPickerOpen(true)} className="flex h-12 flex-1 items-center gap-3 rounded-xl border border-border bg-background/40 px-3 text-start">
              <InstrumentIcon flag={inst?.flag} />
              <span className="font-semibold">{symbol || "…"}</span>
              {price != null && <span className="font-mono text-sm text-muted-foreground">{fmt(price, priceDigits(price))}</span>}
              {quote.data?.change_pct != null && <span className={cn("text-xs", quote.data.change_pct >= 0 ? "text-success" : "text-destructive")}>{quote.data.change_pct >= 0 ? "+" : ""}{quote.data.change_pct.toFixed(2)}%</span>}
              <ChevronDown className="ms-auto h-4 w-4 text-muted-foreground" />
            </button>
            <Tip label={showChart ? t("Hide chart") : t("Show chart")} side="bottom"><button onClick={() => setShowChart((v) => !v)} aria-label={t("Chart")} className={cn("flex h-12 items-center gap-2 rounded-xl border border-border px-4 text-sm", showChart && "border-primary text-primary-glow")}><CandlestickChart className="h-4 w-4" />{t("Chart")}</button></Tip>
          </div>
          {showChart && inst && (
            <div className="space-y-2">
              <div className="flex gap-1">{TF.map((t) => <button key={t} onClick={() => setTf(t)} className={cn("rounded-full px-3 py-1 text-xs", tf === t ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{t}</button>)}</div>
              <iframe key={inst.tv_symbol + tf} title={t("Chart")} className="h-[420px] w-full rounded-2xl border border-border"
                src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(inst.tv_symbol)}&interval=${tvInterval[tf]}&theme=dark&style=1&withdateranges=1&timezone=Etc%2FUTC`} />
            </div>
          )}
        </div>

        {/* direction */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">{t("Trade Direction")}</p>
          <div className="grid grid-cols-2 overflow-hidden rounded-xl">
            <button onClick={() => setSide("buy")} className={cn("h-12 font-bold tracking-wide", side === "buy" ? "bg-buy text-primary-foreground" : "bg-secondary text-buy")}>{t("BUY")}</button>
            <button onClick={() => setSide("sell")} className={cn("h-12 font-bold tracking-wide", side === "sell" ? "bg-destructive text-destructive-foreground" : "bg-sell-muted text-destructive")}>{t("SELL")}</button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="space-y-2">
            <p className="text-sm font-semibold">{t("Order Type")}</p>
            <Select value={orderType} onValueChange={setOrderType}>
              <SelectTrigger className="h-11 rounded-xl px-4"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="market">{t("Market")}</SelectItem><SelectItem value="limit">{t("Limit")}</SelectItem><SelectItem value="stop">{t("Stop")}</SelectItem></SelectContent>
            </Select>
          </div>
          <NumField label={t("Lot")} v={lot} on={setLot} />
          <NumField label={t("Trades")} v={count} on={setCount} />
          <NumField label={t("Interval (s)")} v={interval} on={setIntervalS} />
        </div>
        {orderType !== "market" && <NumField label={(orderType === "limit" ? t("Limit price") : t("Stop price"))} v={orderPrice} on={setOrderPrice} placeholder={price ? fmt(price, priceDigits(price)) : "0.00"} left />}
        <div className="grid gap-3 sm:grid-cols-2">
          <NumField label={t("SL (Optional)")} v={sl} on={setSl} placeholder="0.00" left />
          <NumField label={t("TP (Optional)")} v={tp} on={setTp} placeholder="0.00" left />
        </div>
        <Button variant="hero" className="h-12 w-full rounded-xl text-base" onClick={execute} disabled={sending}>{sending ? <Loader2 className="animate-spin" /> : null}  {t("Execute Trade")}</Button>
       </div>

        <NewsPanel />
      </section>

      {/* RIGHT: open trades */}
      <aside className="order-3 space-y-4 self-start xl:order-none">
       <div className="space-y-4 rounded-2xl border border-border bg-card/40 p-4">
        <Button variant="hero" className="h-12 w-full rounded-xl text-base" onClick={() => setToolsOpen((v) => !v)}>{t("Global Manage")}</Button>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold">{t("Open Trades")} <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground">{accTrades.length}</span></h2>
          <span className={cn("text-sm font-semibold", profit < 0 ? "text-destructive" : "text-success")}>{account?.currency ?? "USD"} {fmt(profit)}</span>
        </div>
        {!account ? <p className="pt-6 text-center text-sm text-muted-foreground">{t("Add an MT5 account to see trades.")}</p>
          : !online && accTrades.length === 0 ? <p className="pt-6 text-center text-sm text-muted-foreground">{t("Waiting for MT5 EA connection…")}</p>
          : accTrades.length === 0 ? <p className="pt-6 text-center text-sm text-muted-foreground">{t("No open trades.")}</p>
          : accTrades.map((trade) => (
            <div key={trade.id} className="rounded-xl border border-border bg-background/40 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{trade.symbol} <span className={cn("ms-1 text-xs", trade.side === "buy" ? "text-success" : "text-destructive")}>{t(trade.side.toUpperCase())} {trade.volume}</span></span>
                <span className={cn("font-semibold", Number(trade.profit) >= 0 ? "text-success" : "text-destructive")}>{fmt(trade.profit)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("Open")} {fmt(trade.open_price, priceDigits(trade.open_price))}  {t("· SL")} {fmt(trade.stop_loss, priceDigits(trade.open_price))}  {t("· TP")} {fmt(trade.take_profit, priceDigits(trade.open_price))}</p>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>#{trade.ticket}{trade.opened_at ? ` · ${timeAgo(trade.opened_at)}` : ""}</span>
                <Button size="sm" variant="destructive" className="h-8 rounded-lg" onClick={() => void queueCommand([account], "close_trade", { ticket: trade.ticket })}>{t("Close")}</Button>
              </div>
            </div>
          ))}
       </div>
        {toolsOpen && <GlobalManage accounts={accounts.data ?? []} current={account} />}
      </aside>

      <InstrumentPicker open={pickerOpen} onOpenChange={setPickerOpen} value={symbol} onChange={setSymbol} />

      <Dialog open={analysisOpen} onOpenChange={setAnalysisOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader><DialogTitle className="text-center">{t("Analysis")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <button onClick={() => setPickerOpen(true)} className="flex h-12 w-full items-center gap-3 rounded-full border border-primary px-3 text-start">
              <InstrumentIcon flag={inst?.flag} /><span className="font-semibold">{symbol}</span><span className="truncate text-xs text-muted-foreground">{inst?.name}</span><ChevronDown className="ms-auto h-4 w-4" />
            </button>
            <div>
              <p className="mb-2 text-sm font-semibold">{t("Timeframe")}</p>
              <div className="grid grid-cols-5 gap-1 rounded-full bg-secondary p-1">{TF.map((t) => <button key={t} onClick={() => setTf(t)} className={cn("rounded-full py-1.5 text-xs font-semibold", tf === t ? "bg-background" : "text-muted-foreground")}>{t}</button>)}</div>
            </div>
            <p className="text-xs text-muted-foreground">{t("The AI reads live candles, the economic calendar and world headlines, then returns direction, entry, stop loss and take profit.")}</p>
            <Button variant="hero" className="h-12 w-full rounded-full" disabled={busy || !symbol} onClick={() => void runAnalysis(symbol, tf)}>{busy ? <Loader2 className="animate-spin" /> : <Brain />}  {t("Analyse")} {symbol}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={eaModal} onOpenChange={setEaModal}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader><DialogTitle className="text-center">{t("EA Is Not Connected")}</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>{t("Your MT5 Expert Advisor (EA) appears to be offline. For Ufuq Trade to send trades and execute your commands, it must be connected to your trading account via an Expert Advisor running inside MetaTrader 5.")}</p>
            <p>{t("This is a one-time setup. Once configured, you can manage your entire trading account from this app — placing trades, monitoring positions, and controlling your account — without ever opening your laptop or a trading terminal again.")}</p>
            <Button variant="hero" className="h-11 w-full rounded-full" onClick={() => { setEaModal(false); void navigate({ to: "/settings" }); }}>{t("Go to Settings")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div></>
  );
}

function Metric({ label, value, badge, tone }: { label: string; value: string | null; badge?: string; tone?: "up" | "down" | undefined }) {
  const t = useT();
  return (
    <div className="min-w-0 p-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">{label}{badge && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] text-primary-foreground">{badge}</span>}</p>
      {value == null ? <div className="mt-2 h-3 w-28 rounded-full bg-muted" /> : <p className={cn("mt-1 truncate text-lg font-bold", tone === "up" && "text-success", tone === "down" && "text-destructive")}>{value}</p>}
    </div>
  );
}

function NumField({ label, v, on, placeholder, left }: { label: string; v: string; on: (v: string) => void; placeholder?: string; left?: boolean }) {
  const t = useT();
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{t(label)}</p>
      <Input inputMode="decimal" value={v} placeholder={placeholder} onChange={(e) => on(e.target.value.replace(/[^0-9.]/g, ""))} className={cn(inputCls, "rounded-xl", left && "px-4 text-start")} />
    </div>
  );
}

function AnalysisCard(p: { symbol: string; tag?: string | undefined; direction: string; confidence?: number | null; entry: number | null; sl: number | null; tp: number | null; text: string | null; at: string; onUse: () => unknown }) {
  const t = useT();
  const d = priceDigits(p.entry);
  return (
    <div className={cn("rounded-xl border border-border border-s-4 bg-background/40 p-3 text-sm", p.direction === "buy" ? "border-s-success" : p.direction === "sell" ? "border-s-destructive" : "border-s-warning")}>
      <div className="flex items-center justify-between">
        <span className="font-semibold">{p.symbol} {p.tag && <span className="ms-1 text-xs font-normal text-muted-foreground">{p.tag}</span>}</span>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", p.direction === "buy" ? "bg-success/15 text-success" : p.direction === "sell" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground")}>
          {p.direction === "buy" ? <ArrowUpRight className="h-3 w-3" /> : p.direction === "sell" ? <ArrowDownRight className="h-3 w-3" /> : null}{t(p.direction.toUpperCase())}
        </span>
      </div>
      {p.confidence != null && <div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-gradient-primary" style={{ width: `${p.confidence}%` }} /></div>}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        {([["Entry", p.entry], ["SL", p.sl], ["TP", p.tp]] as const).map(([l, v]) => <div key={l} className="rounded-md bg-muted/70 p-1.5"><p className="text-muted-foreground">{t(l)}</p><p className="font-mono">{fmt(v, d)}</p></div>)}
      </div>
      {p.text && <p className="mt-3 line-clamp-4 text-xs leading-relaxed text-muted-foreground">{p.text}</p>}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{p.confidence != null ? `${p.confidence}% ${t("model score")} · ` : ""}{timeAgo(p.at)}</span>
        <button onClick={p.onUse} disabled={p.direction === "neutral"} className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground">{t("Use Signal")}</button>
      </div>
    </div>
  );
}

function GlobalManage({ accounts, current }: { accounts: Account[]; current: Account | undefined }) {
  const t = useT();
  const qc = useQueryClient();
  const [scope, setScope] = useState<"one" | "all">("one");
  const [cap, setCap] = useState("");
  const [trail, setTrail] = useState("");
  const [filter, setFilter] = useState("all");
  const commands = useQuery({
    queryKey: ["commands"],
    refetchInterval: 10_000,
    queryFn: async () => (await supabase.from("trade_commands").select("*").order("created_at", { ascending: false }).limit(20)).data ?? [],
  });
  const target = scope === "all" ? accounts : current ? [current] : [];
  const run = async (cmd: Parameters<typeof queueCommand>[1], payload = {}) => {
    if (await queueCommand(target, cmd, payload)) void qc.invalidateQueries({ queryKey: ["commands"] });
  };
  const confirmRun = (msg: string, cmd: Parameters<typeof queueCommand>[1]) => window.confirm(msg) && void run(cmd);
  const shown = (commands.data ?? []).filter((c) => filter === "all" || c.status === filter);
  const radio = (v: "one" | "all", label: string) => (
    <button onClick={() => setScope(v)} className="flex items-center gap-2 text-sm">
      <span className={cn("flex h-4 w-4 items-center justify-center rounded-full border", scope === v ? "border-primary" : "border-muted-foreground")}>{scope === v && <span className="h-2 w-2 rounded-full bg-primary" />}</span>{label}
    </button>
  );
  return (
    <>
      <div className="space-y-4 rounded-2xl border border-border bg-card/40 p-4">
        <h3 className="font-bold">{t("Management Tools")}</h3>
        <div>
          <p className="mb-2 text-sm text-muted-foreground">{t("Account scope")}</p>
          <div className="flex gap-6">{radio("one", t("This account"))}{radio("all", `${t("All accounts")} (${accounts.length})`)}</div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Button variant="destructive" size="sm" className="h-10 rounded-lg px-1 text-xs" onClick={() => confirmRun(t("Close ALL open trades?"), "close_all")}>{t("Close all")}</Button>
          <Button variant="outline" size="sm" className="h-10 rounded-lg px-1 text-xs" onClick={() => void run("break_even")}>{t("Break even")}</Button>
          <Button variant="outline" size="sm" className="h-10 rounded-lg px-1 text-xs" onClick={() => confirmRun(t("Remove the stop loss from all trades?"), "delete_sl")}>{t("Delete SL")}</Button>
          <Button variant="outline" size="sm" className="h-10 rounded-lg px-1 text-xs" onClick={() => void run("clear_pending")}>{t("Cancel pending")}</Button>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("Cap loss amount (USD)")}</p>
          <div className="flex gap-2"><Input placeholder={t("e.g. 200")} inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} className="h-10 rounded-lg" /><Button variant="outline" className="h-10 w-20 rounded-lg" onClick={() => Number(cap) > 0 ? void run("cap_loss", { threshold: -Math.abs(Number(cap)) }) : toast.error(t("Enter an amount."))}>{t("Set")}</Button></div>
          <p className="pt-1 text-sm font-medium">{t("Trailing profit amount (USD)")}</p>
          <div className="flex gap-2"><Input placeholder={t("e.g. 100")} inputMode="decimal" value={trail} onChange={(e) => setTrail(e.target.value)} className="h-10 rounded-lg" /><Button variant="hero" className="h-10 w-20 rounded-lg" onClick={() => Number(trail) > 0 ? void run("trailing_profit", { threshold: Number(trail) }) : toast.error(t("Enter an amount."))}>{t("Activate")}</Button></div>
          <p className="text-xs text-muted-foreground">{t("After price moves in your favor, a 30% giveback will be applied.")}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">{t("Recent commands")}</h3>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-8 w-28 rounded-lg text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{t("All")}</SelectItem><SelectItem value="done">{t("Done")}</SelectItem><SelectItem value="failed">{t("Failed")}</SelectItem><SelectItem value="queued">{t("Queued")}</SelectItem></SelectContent>
          </Select>
        </div>
        <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
          {shown.length === 0 && <li className="text-muted-foreground">{t("Nothing yet.")}</li>}
          {shown.map((c) => (
            <li key={c.id} className="flex items-center gap-2 border-t border-border/50 py-2 first:border-0">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", c.status === "done" ? "bg-success" : c.status === "failed" ? "bg-destructive" : "bg-warning")} />
              <span className="min-w-0 flex-1 truncate capitalize">{c.command.replace(/_/g, " ")}</span>
              <span className="text-xs text-muted-foreground">{timeAgo(c.created_at)}</span>
              <span title={c.result ?? ""} className={cn("rounded-md px-2 py-0.5 text-xs", c.status === "done" ? "bg-success/15 text-success" : c.status === "failed" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning")}>{t(c.status.charAt(0).toUpperCase() + c.status.slice(1))}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function NewsPanel() {
  const t = useT();
  const [tab, setTab] = useState<"geo" | "cal">("geo");
  const newsFn = useServerFn(getNews);
  const calFn = useServerFn(getCalendar);
  const news = useQuery({ queryKey: ["news"], queryFn: () => newsFn(), staleTime: 5 * 60_000, refetchInterval: 5 * 60_000 });
  const cal = useQuery({ queryKey: ["calendar"], queryFn: () => calFn(), staleTime: 30 * 60_000, enabled: tab === "cal" });
  const days = useMemo(() => {
    const g = new Map<string, NonNullable<typeof cal.data>>();
    for (const e of cal.data ?? []) {
      const k = new Date(e.date).toDateString();
      g.set(k, [...(g.get(k) ?? []), e]);
    }
    return [...g.entries()];
  }, [cal.data]);
  const dot = (iso: string) => {
    const h = (Date.now() - new Date(iso).getTime()) / 3600_000;
    return h < 2 ? "bg-success" : h < 5 ? "bg-warning" : "bg-muted-foreground/50";
  };
  return (
    <div className="rounded-2xl border border-border bg-card/40">
      <div className="flex gap-1 p-4 pb-2">
        <div className="flex gap-1 rounded-full bg-background p-1 text-xs font-semibold">
          <button onClick={() => setTab("geo")} className={cn("rounded-full px-3 py-1.5", tab === "geo" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{t("Geopolitics")}</button>
          <button onClick={() => setTab("cal")} className={cn("rounded-full px-3 py-1.5", tab === "cal" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{t("Economic Calendar")}</button>
        </div>
      </div>
      {tab === "geo" ? (
        <ul>
          {news.isLoading && <li className="px-6 py-4 text-sm text-muted-foreground">{t("Loading headlines…")}</li>}
          {news.data?.length === 0 && <li className="px-6 py-4 text-sm text-muted-foreground">{t("Headlines are unavailable right now.")}</li>}
          {(news.data ?? []).map((n) => (
            <li key={n.url + n.title} className="flex items-center gap-3 border-t border-border/60 px-6 py-2.5 text-[13px]">
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot(n.published))} />
              <a href={n.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">{n.title}</a>
              <span className="shrink-0 text-[11px] text-muted-foreground">{n.source} · {timeAgo(n.published)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div>
          {cal.isLoading && <p className="px-6 py-4 text-sm text-muted-foreground">{t("Loading calendar…")}</p>}
          {cal.data?.length === 0 && <p className="px-6 py-4 text-sm text-muted-foreground">{t("Calendar is unavailable right now.")}</p>}
          {days.map(([day, evs]) => (
            <div key={day}>
              <p className="border-t border-border/60 px-6 py-2 text-xs font-semibold text-muted-foreground">{day}</p>
              {evs.map((e, i) => (
                <div key={day + i} className={cn("grid grid-cols-[60px_44px_1fr_auto] items-center gap-3 border-t border-border/40 px-6 py-2 text-[13px]", new Date(e.date).getTime() < Date.now() && "opacity-50")}>
                  <span className="font-mono text-xs">{new Date(e.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="text-xs font-semibold">{e.country}</span>
                  <span className="flex min-w-0 items-center gap-2"><span className={cn("h-2 w-2 shrink-0 rounded-full", e.impact === "High" ? "bg-destructive" : e.impact === "Medium" ? "bg-warning" : "bg-muted-foreground/50")} /><span className="truncate">{e.title}</span></span>
                  <span className="text-[11px] text-muted-foreground">{t("F")} {e.forecast || "—"}  {t("· P")} {e.previous || "—"}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

