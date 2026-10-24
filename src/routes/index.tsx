import { useT } from "@/lib/i18n";
import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Brain, Layers, Shield, Sparkles, Bot, Bell, FlaskConical, SlidersHorizontal, ArrowRight, Play, Clock, BarChart3, Server,
  CheckCircle2, Moon, Trophy, Monitor, Cpu, Zap, Headphones, Check, Instagram, Send, Youtube, Github, Coins, LineChart, Bitcoin, Droplet, Apple, DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstrumentIcon } from "@/components/app/InstrumentIcon";
import { SiteHeader, SiteFooter, SectionHead as Head, FeaturesGrid, MarketsGrid, BrokerCards, PlatformsStrip } from "@/components/site/SiteChrome";
import { useAuth } from "@/lib/auth";
import { useInstruments } from "@/lib/trading";
import { getQuotes } from "@/lib/market.functions";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Callout } from "@/components/app/NeuralGalaxy";
import vpsImg from "@/assets/vps-server.jpg";
import sleepImg from "@/assets/sleep-trader.jpg";

const NeuralGalaxy = lazy(() => import("@/components/app/NeuralGalaxy"));

export const Route = createFileRoute("/")({
  head: () => seo("The Future of Trading is Autonomous", "Ufuq Trade analyzes global markets, finds high-probability opportunities and executes trades on MetaTrader 5 automatically, 24/7."),
  component: Landing,
});

const why = [
  { icon: Trophy, t: "Smarter Decisions", d: "Six AI experts per analysis" },
  { icon: Monitor, t: "MetaTrader 5", d: "Your broker, your account" },
  { icon: Cpu, t: "Advanced AI", d: "Learns from every trade" },
  { icon: Zap, t: "Full Automation", d: "No manual work" },
  { icon: Headphones, t: "24/7 Support", d: "We're always here" },
];

const heroNodes: Callout[] = [
  { id: "mt5", kind: "layer", title: "MetaTrader 5", sub: "Analysis & Execution" },
  { id: "crypto", kind: "symbol", title: "Crypto", sub: "BTC · ETH · SOL" },
  { id: "forex", kind: "symbol", title: "Forex", sub: "Major · Minor · Exotic" },
  { id: "idx", kind: "win", title: "Indices", sub: "US30 · NAS100 · SP500" },
  { id: "com", kind: "symbol", title: "Commodities", sub: "Gold · Silver · Oil" },
  { id: "stk", kind: "rule", title: "Stocks", sub: "AAPL · TSLA · NVDA" },
  { id: "brain", kind: "layer", title: "AI Brain", sub: "Deep learning · Real-time analysis" },
  { id: "risk", kind: "rule", title: "Risk Manager", sub: "Profit lock · Smart lot" },
];

function Landing() {
  const t = useT();
  const { user } = useAuth();
  const start = user ? "/dashboard" : "/register";
  return (
    <div className="min-h-screen overflow-x-hidden bg-space text-foreground">
      <SiteHeader />

      {/* HERO */}
      <section className="relative">
        <div className="mx-auto grid max-w-7xl items-center gap-6 px-4 pt-10 lg:grid-cols-[1fr_1.15fr]">
          <div className="relative z-10 py-8">
            <p className="inline-block rounded-md border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold tracking-[0.2em] text-primary-glow">{t("AI POWERED TRADING PLATFORM")}</p>
            <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
              {t("The Future of Trading")}<br />{t("is")} <span className="text-gradient-violet">{t("Autonomous")}</span>
            </h1>
            <p className="mt-5 max-w-lg text-base text-muted-foreground">{t("Our AI analyzes the global markets, finds high-probability opportunities, and executes trades — automatically. 24/7. No emotions. Just logic.")}</p>
            <div className="mt-8 grid max-w-lg grid-cols-2 gap-5 sm:grid-cols-4">
              {[[Clock, "10 min", "AI analysis cycle"], [BarChart3, "24/7", "Auto Trading"], [Layers, "6", "AI experts"], [Server, "VPS", "Cloud Hosted"]].map(([I, v, l]) => {
                const Icon = I as typeof Clock;
                return <div key={l as string} className="flex items-center gap-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10"><Icon className="h-4 w-4 text-primary-glow" /></span><div><p className="text-lg font-bold leading-none">{t(v as string)}</p><p className="mt-1 text-[11px] text-muted-foreground">{t(l as string)}</p></div></div>;
              })}
            </div>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild variant="hero" size="lg" className="rounded-xl px-7"><Link to={start}>{t("Start Trading Now")} <ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link></Button>
              <Button asChild variant="outline" size="lg" className="rounded-xl px-7"><a href="#automation"><Play className="h-4 w-4" /> {t("How it works")}</a></Button>
            </div>
            <p className="mt-4 flex gap-4 text-xs text-muted-foreground"><span>{t("No credit card required")}</span><span>✦ {t("Free plan available")}</span></p>
          </div>
          <div className="relative h-[460px] sm:h-[560px] lg:h-[640px]">
            <div className="pointer-events-none absolute inset-x-10 bottom-6 h-24 rounded-[50%] bg-primary/30 blur-3xl" />
            <ClientOnly fallback={<div className="h-full" />}>
              <Suspense fallback={<div className="h-full" />}>
                <div className="h-full w-full" style={{ maskImage: "radial-gradient(closest-side, #000 80%, transparent 100%)", WebkitMaskImage: "radial-gradient(closest-side, #000 80%, transparent 100%)" }}><NeuralGalaxy items={heroNodes} /></div>
              </Suspense>
            </ClientOnly>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-8"><Ticker /></div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-7xl px-4">
          <Head tag="POWERFUL FEATURES" title={<>{t("Everything You Need to Trade with")} <span className="text-gradient-violet">{t("Precision")}</span></>} sub="From market analysis to automated execution, our AI handles every step of the trading process." />
          <div className="mt-12"><FeaturesGrid /></div>
        </div>
      </section>

      {/* MARKETS */}
      <section id="markets" className="py-16">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 lg:grid-cols-[300px_1fr]">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.2em] text-primary-glow">{t("SUPPORTED MARKETS")}</p>
            <h2 className="mt-3 text-3xl font-bold">{t("Trade What Moves the World")}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{t("From gold to crypto, forex to indices — our AI analyzes major markets and finds the best opportunities for you.")}</p>
            <Button asChild variant="outline" className="mt-6 rounded-xl"><Link to={start}>{t("Explore All Markets")} <ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link></Button>
          </div>
          <MarketsGrid />
        </div>
      </section>

      {/* AUTOMATION & VPS */}
      <section id="automation" className="py-16">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 lg:grid-cols-[1fr_1fr_1.1fr]">
          <img src={vpsImg} alt={t("Cloud VPS server")} loading="lazy" width={1024} height={768} className="w-full rounded-3xl" />
          <div>
            <p className="text-[11px] font-semibold tracking-[0.2em] text-primary-glow">{t("AUTOMATION & VPS")}</p>
            <h2 className="mt-3 text-3xl font-bold">{t("Set It Once. Let It Work.")}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{t("Our AI runs on cloud servers and your MetaTrader 5 runs on a VPS, ensuring uninterrupted trading 24/7. You sleep, it trades.")}</p>
            <ul className="mt-5 space-y-2.5 text-sm">
              {["24/7 Cloud VPS Hosting", "Automatic weekend pause", "Profit lock & cooldown", "Your broker keeps your funds"].map((x) => <li key={x} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" />{t(x)}</li>)}
            </ul>
          </div>
          <div className="relative overflow-hidden rounded-3xl border border-primary/30">
            <img src={sleepImg} alt={t("Trader sleeping while the AI trades")} loading="lazy" width={1024} height={640} className="h-full min-h-[260px] w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/85 via-background/30 to-transparent rtl:bg-gradient-to-l" />
            <div className="absolute inset-y-0 start-0 flex max-w-[60%] flex-col justify-center p-6">
              <Moon className="h-6 w-6 text-primary-glow" />
              <p className="mt-3 text-2xl font-bold leading-tight">{t("You Sleep...")}<br />{t("It Trades.")}</p>
              <p className="mt-3 text-xs text-muted-foreground">{t("While you rest, our AI analyzes, executes and manages your trades around the clock.")}</p>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-success"><span className="h-2 w-2 rounded-full bg-success" />{t("Trading 24/7")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* WHY */}
      <section className="py-16">
        <div className="mx-auto max-w-5xl px-4">
          <Head tag="WHY CHOOSE US" title="More Than a Trading Bot" sub="We combine the power of AI, MetaTrader 5 and advanced strategies to give you the ultimate trading experience." />
          <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-5">
            {why.map((w, i) => (
              <div key={w.t} className={cn("text-center", i > 0 && "sm:border-s sm:border-border/60")}>
                <w.icon className="mx-auto h-6 w-6 text-primary-glow" />
                <p className="mt-3 text-sm font-semibold">{t(w.t)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{t(w.d)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING / BROKERS */}
      <section id="pricing" className="py-16">
        <div className="mx-auto max-w-5xl px-4">
          <Head tag="PRICING" title="One Plan — $250 per Month" sub="Full access to the AI analysis, Auto-Pilot, AI Brain, Whale Radar and 24/7 support. Trade through any of our partner brokers." />
          <div className="mt-10"><BrokerCards /></div>
          <div className="mt-8"><PlatformsStrip /></div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl rounded-3xl border border-primary/30 bg-card/60 px-6 py-12 text-center shadow-glow backdrop-blur">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-primary-glow">{t("GET STARTED TODAY")}</p>
          <h2 className="mt-3 text-3xl font-bold">{t("Your Trading Journey Starts Here")}</h2>
          <p className="mt-3 text-sm text-muted-foreground">{t("Join traders who are already using AI to trade smarter, faster and with more discipline.")}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild variant="hero" className="rounded-xl px-7"><Link to={start}>{t("Start Trading Now")} <ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link></Button>
            <Button asChild variant="outline" className="rounded-xl px-7"><Link to="/features">{t("Learn More")}</Link></Button>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-5 text-xs text-muted-foreground">
            {["No credit card required", "Free plan available", "Cancel anytime"].map((label) => <span key={label} className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" />{t(label)}</span>)}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

/** Live prices strip — real quotes from public market data. */
function Ticker() {
  const instruments = useInstruments();
  const quotesFn = useServerFn(getQuotes);
  const list = (instruments.data ?? []).filter((i) => i.yahoo_symbol).slice(0, 6);
  const quotes = useQuery({
    queryKey: ["landing-quotes", list.map((i) => i.symbol).join(",")],
    enabled: list.length > 0,
    refetchInterval: 30_000,
    queryFn: () => quotesFn({ data: { items: list.map((i) => ({ symbol: i.symbol, yahoo: i.yahoo_symbol! })) } }),
  });
  if (!list.length) return null;
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/40 sm:grid-cols-3 lg:grid-cols-6">
      {list.map((i) => {
        const q = quotes.data?.find((x) => x.symbol === i.symbol);
        const up = (q?.change_pct ?? 0) >= 0;
        return (
          <div key={i.id} className="flex items-center gap-3 bg-card/80 px-4 py-4 backdrop-blur">
            <InstrumentIcon flag={i.flag} className="h-8 w-8 text-[9px]" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">{i.symbol}</p>
              <p className="truncate text-[10px] text-muted-foreground">{i.name}</p>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium tabular-nums">{q?.price != null ? q.price.toLocaleString(undefined, { maximumFractionDigits: q.price > 100 ? 2 : 4 }) : "—"}</span>
                {q?.change_pct != null && <span className={cn("text-[11px] tabular-nums", up ? "text-success" : "text-destructive")}>{up ? "+" : ""}{q.change_pct.toFixed(2)}%</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
