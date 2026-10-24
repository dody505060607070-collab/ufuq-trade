import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Brain, Layers, Shield, Sparkles, Bot, Bell, FlaskConical, SlidersHorizontal, Check, Instagram, Send, Youtube, Github,
  Coins, LineChart, Droplet, DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT, LanguageToggle } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useBrokers } from "@/lib/trading";
import { BrandMark } from "./Logo";
import { BrandLogo, BrokerLogo, type LogoKey } from "@/components/app/InstrumentIcon";
import fAnalysis from "@/assets/f-analysis.jpg";
import fMulti from "@/assets/f-multiasset.jpg";
import fRisk from "@/assets/f-risk.jpg";
import fStrat from "@/assets/f-strategies.jpg";
import fExec from "@/assets/f-execution.jpg";
import fNotify from "@/assets/f-notify.jpg";
import fBrain from "@/assets/f-brain.jpg";
import fLock from "@/assets/f-profitlock.jpg";
import mForex from "@/assets/m-forex.jpg";
import mGold from "@/assets/m-gold.jpg";
import mIndices from "@/assets/m-indices.jpg";
import mComm from "@/assets/m-commodities.jpg";

const NAV = [["/", "Home"], ["/features", "Features"], ["/markets", "Markets"], ["/pricing", "Pricing"], ["/about", "About"]] as const;

export function SiteHeader() {
  const t = useT();
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandMark className="h-9 w-auto" />
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {NAV.map(([to, l]) => <Link key={to} to={to} className="hover:text-foreground" activeOptions={{ exact: true }} activeProps={{ className: "text-foreground" }}>{t(l)}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />{t("Live Trading")}</span>
          <LanguageToggle />
          {user ? <Button asChild variant="hero" size="sm" className="rounded-lg"><Link to="/dashboard">{t("Open Dashboard")}</Link></Button> : <>
            <Button asChild variant="outline" size="sm" className="rounded-lg"><Link to="/login">{t("Sign In")}</Link></Button>
            <Button asChild variant="hero" size="sm" className="rounded-lg"><Link to="/register">{t("Get Started")}</Link></Button>
          </>}
        </div>
      </div>
      <nav className="flex gap-5 overflow-x-auto px-4 pb-2 text-xs text-muted-foreground md:hidden">
        {NAV.map(([to, l]) => <Link key={to} to={to} activeOptions={{ exact: true }} activeProps={{ className: "text-foreground" }}>{t(l)}</Link>)}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const t = useT();
  const cols: [string, [string, string][]][] = [
    ["Product", [["/features", "Features"], ["/pricing", "Pricing"], ["/markets", "Markets"]]],
    ["Company", [["/about", "About"], ["/contact", "Contact"]]],
    ["Legal", [["/terms", "Terms"], ["/privacy", "Privacy"], ["/risk-disclosure", "Risk Disclosure"]]],
  ];
  return (
    <footer className="border-t border-border/50">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 pt-12 text-center">
        <BrandMark className="h-14 w-auto" />
        <p className="text-sm text-muted-foreground">{t("Smarter Analysis. Bigger Opportunities.")}</p>
        <p className="text-xs text-muted-foreground">{t("An Arab trading platform built by traders and developers with over 10 years in the markets.")}</p>
      </div>
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-4">
        {cols.map(([title, links]) => (
          <div key={title}><p className="text-sm font-semibold">{t(title)}</p><ul className="mt-3 space-y-2 text-xs text-muted-foreground">{links.map(([h, l]) => <li key={l}><Link to={h} className="hover:text-foreground">{t(l)}</Link></li>)}{title === "Product" && <li><a href="/ea/ArrissaEA.mq5" className="hover:text-foreground">{t("Download EA")}</a></li>}</ul></div>
        ))}
        <div>
          <div className="flex gap-2 text-muted-foreground">{[Instagram, Send, Youtube, Github].map((I, i) => <span key={i} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border"><I className="h-4 w-4" /></span>)}</div>
          <p className="mt-4 text-[11px] text-muted-foreground">© {new Date().getFullYear()} {t("Ufuq Trade. All rights reserved.")}</p>
        </div>
      </div>
      <p className="border-t border-border/40 py-4 text-center text-[11px] text-muted-foreground">{t("Trading in derivatives is highly speculative and involves significant risk.")}</p>
    </footer>
  );
}

export function SiteLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen overflow-x-hidden bg-space text-foreground"><SiteHeader /><main>{children}</main><SiteFooter /></div>;
}

export function SectionHead({ tag, title, sub }: { tag: string; title: ReactNode; sub: string }) {
  const t = useT();
  return <div className="text-center"><p className="text-[11px] font-semibold tracking-[0.2em] text-primary-glow">{t(tag)}</p><h2 className="mt-3 text-3xl font-bold sm:text-4xl">{typeof title === "string" ? t(title) : title}</h2><p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">{t(sub)}</p></div>;
}

const features = [
  { icon: Brain, img: fAnalysis, t: "AI Market Analysis", d: "Real-time analysis of multiple markets using advanced AI models. Spot opportunities before they happen." },
  { icon: Layers, img: fMulti, t: "Multi-Asset Trading", d: "Trade forex, gold, crypto, indices, stocks and more — all in one powerful platform." },
  { icon: Shield, img: fRisk, t: "Smart Risk Management", d: "AI adjusts position sizes, stop loss and take profit based on market conditions and volatility." },
  { icon: Sparkles, img: fStrat, t: "Advanced Strategies", d: "ICT, smart money concepts, price action and trend strengths — combined by the AI." },
  { icon: Bot, img: fExec, t: "Automated Execution", d: "The AI finds, analyzes and executes trades automatically, 24/7, without human intervention." },
  { icon: Bell, img: fNotify, t: "Real-Time Notifications", d: "Get instant updates on trades, signals, market movements and account events." },
  { icon: FlaskConical, img: fBrain, t: "Learns From Every Trade", d: "Every closed trade becomes a lesson. The AI Brain builds rules from wins and losses." },
  { icon: SlidersHorizontal, img: fLock, t: "Profit Lock & Risk Slider", d: "Lock profits, rest after a target and choose your own risk level per trade." },
];

export function FeaturesGrid() {
  const t = useT();
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {features.map((f, i) => (
        <div key={f.t} className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/50 backdrop-blur transition hover:border-primary/60 hover:shadow-glow">
          <img src={f.img} alt={t(f.t)} loading="lazy" width={1024} height={640} className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-105" />
          <span className="absolute end-3 top-3 rounded-full bg-background/80 px-2 py-0.5 text-[10px] text-primary-glow">0{i + 1}</span>
          <div className="flex gap-3 p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10"><f.icon className="h-4 w-4 text-primary-glow" /></span>
            <div><p className="text-sm font-semibold">{t(f.t)}</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t(f.d)}</p></div>
          </div>
        </div>
      ))}
    </div>
  );
}

type Market = { t: string; d: string; icon?: typeof Coins; logos?: LogoKey[]; img?: string };
const markets: Market[] = [
  { icon: DollarSign, img: mForex, t: "Forex", d: "Majors · Minors · Exotics" },
  { icon: Coins, img: mGold, t: "Gold & Silver", d: "XAUUSD · XAGUSD" },
  { logos: ["btc", "eth", "sol"], t: "Cryptocurrencies", d: "BTC · ETH · SOL" },
  { icon: LineChart, img: mIndices, t: "Indices", d: "US30 · NAS100 · SP500" },
  { logos: ["apple", "tesla", "nvidia"], t: "Stocks", d: "AAPL · TSLA · NVDA" },
  { icon: Droplet, img: mComm, t: "Commodities", d: "Oil · Gas" },
];

export function MarketsGrid() {
  const t = useT();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {markets.map((m) => (
        <div key={m.t} className="overflow-hidden rounded-2xl border border-border/70 bg-card/50 text-center transition hover:-translate-y-1 hover:border-primary/60">
          {m.img ? (
            <img src={m.img} alt={t(m.t)} loading="lazy" width={944} height={704} className="aspect-[4/3] w-full object-cover" />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center -space-x-3 bg-primary/5 rtl:space-x-reverse">{m.logos?.map((l) => <BrandLogo key={l} name={l} className="h-10 w-10 ring-2 ring-background" />)}</div>
          )}
          <div className="p-4">
            <p className="text-sm font-semibold">{t(m.t)}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{m.d}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function BrokerCards() {
  const t = useT();
  const brokers = useBrokers();
  return (
    <div className="flex flex-wrap justify-center gap-4">
      {(brokers.data ?? []).map((b) => (
        <div key={b.id} className="w-full max-w-xs rounded-2xl border border-border/70 bg-card/50 p-5 text-center">
          <BrokerLogo name={b.name} color={b.brand_color} className="mx-auto h-14 w-14" />
          <p className="mt-3 text-sm font-semibold">{b.name}</p>
          <ul className="mt-3 space-y-1 text-start text-xs text-muted-foreground">{b.features.map((f) => <li key={f} className="flex items-center gap-2"><Check className="h-3 w-3 text-success" />{f}</li>)}</ul>
          <Button asChild variant="hero" size="sm" className="mt-4 w-full rounded-lg"><a href={b.partner_url ?? "#"} target="_blank" rel="noreferrer">{t("Open Account")}</a></Button>
        </div>
      ))}
    </div>
  );
}

export function PlatformsStrip() {
  const t = useT();
  const items: [LogoKey, string, string][] = [["mt5", "MetaTrader 5", "Live now"], ["tradelocker", "TradeLocker", "Coming soon"], ["hyperliquid", "Hyperliquid", "Coming soon"]];
  return (
    <div className="flex flex-wrap justify-center gap-4">
      {items.map(([k, n, s]) => (
        <div key={k} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/50 px-5 py-3"><BrandLogo name={k} alt={n} /><div><p className="text-sm font-semibold">{n}</p><p className="text-[11px] text-muted-foreground">{t(s)}</p></div></div>
      ))}
    </div>
  );
}
