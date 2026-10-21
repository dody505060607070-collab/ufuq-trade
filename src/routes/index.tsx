import { useT, LanguageToggle } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Brain, Zap, Shield, LineChart, Lock, Bell, Layers, Crosshair, Download, Link2, Sparkles, Rocket, BadgeCheck, Building2, Activity, Check, Instagram, Youtube, Github, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstrumentIcon, BrokerLogo } from "@/components/app/InstrumentIcon";
import { useAuth } from "@/lib/auth";
import { useBrokers, useInstruments } from "@/lib/trading";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => seo("Trade Smarter with Structured AI Analysis", "Execute profitable trades with real-time insights, automate your strategy controls, and connect seamlessly to MetaTrader 5."),
  component: Landing,
});

const features = [
  { icon: Brain, t: "AI Market Analysis", d: "Advanced models analyze market sentiment and generate real-time signal direction." },
  { icon: Zap, t: "One-Click Execution", d: "Execute faster with predefined order settings and account-aware routing." },
  { icon: Shield, t: "Smart Risk Management", d: "Protect capital with break-even actions, lock rules, and controlled exposure." },
  { icon: LineChart, t: "Real-Time Analytics", d: "Track equity, balance, and performance metrics directly from your dashboard." },
  { icon: Lock, t: "Secure MT5 Integration", d: "Connect MetaTrader accounts securely while keeping credentials protected." },
  { icon: Bell, t: "Instant Notifications", d: "Get updates on trade execution, signal changes, and account events." },
  { icon: Layers, t: "Multi-Account Trading", d: "Manage multiple accounts from one workspace with consistent logic." },
  { icon: Crosshair, t: "Custom Instruments", d: "Focus on your preferred symbols with fast instrument selection controls." },
];
const steps = [
  { icon: Download, t: "Download EA", d: "Install the ArrissaAI Expert Advisor for MetaTrader 5." },
  { icon: Link2, t: "Connect Account", d: "Link your MT5 account securely with your API credentials." },
  { icon: Sparkles, t: "AI Analysis", d: "Receive structured insights and directional trade suggestions." },
  { icon: Rocket, t: "Execute & Manage", d: "Execute manually or automate management based on your strategy rules." },
];

function Landing() {
  const t = useT();
  const { user } = useAuth();
  const instruments = useInstruments();
  const brokers = useBrokers();
  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden bg-hero-glow pb-16">
        <header className="mx-auto mt-4 flex max-w-4xl items-center justify-between rounded-full border border-border bg-card/70 px-5 py-3 backdrop-blur">
          <Link to="/" className="flex items-center gap-2 font-bold"><span className="text-primary-glow">✳</span> ArrissaAI</Link>
          <nav className="hidden gap-8 text-xs text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">{t("Features")}</a>
            <a href="#how" className="hover:text-foreground">{t("How It Works")}</a>
            <a href="#pricing" className="hover:text-foreground">{t("Pricing")}</a>
          </nav>
          <div className="flex gap-2"><LanguageToggle />
            {user ? <Button asChild variant="hero" size="sm" className="rounded-full"><Link to="/dashboard">{t("Open Dashboard")}</Link></Button> : <>
              <Button asChild variant="secondary" size="sm" className="rounded-full"><Link to="/login">{t("Sign In")}</Link></Button>
              <Button asChild variant="hero" size="sm" className="rounded-full"><Link to="/register">{t("Get Started")}</Link></Button>
            </>}
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-4 pt-16 text-center">
          <p className="text-[11px] font-semibold tracking-widest text-primary-glow">{t("AI-POWERED TRADING INTELLIGENCE")}</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">{t("Trade Smarter with")}<br />{t("Structured AI Analysis")}</h1>
          <p className="mx-auto mt-5 max-w-xl text-sm text-muted-foreground">{t("Execute profitable trades with real-time insights, automate your strategy controls, and connect seamlessly to MetaTrader 5.")}</p>
          <div className="mt-7 flex justify-center gap-3">
            <Button asChild variant="hero" className="rounded-full px-6"><Link to={user ? "/dashboard" : "/register"}>{t("Start Trading Free")}</Link></Button>
            <Button asChild variant="outline" className="rounded-full px-10"><Link to="/login">{t("Sign In")}</Link></Button>
          </div>
          <div className="mx-auto mt-10 flex max-w-2xl flex-wrap justify-center gap-2">
            {(instruments.data ?? []).map((i) => (
              <span key={i.id} className="flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-medium"><InstrumentIcon flag={i.flag} className="h-4 w-4 text-[7px]" />{i.symbol}</span>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-5xl px-4">
          <Mockup />
          <p className="mt-4 text-center text-xs text-muted-foreground">{t("Real-time AI signals, account analytics, and one-click execution in a single workflow.")}</p>
        </div>
      </section>

      <section id="features" className="bg-surface py-20">
        <div className="mx-auto max-w-5xl px-4">
          <Head tag="FEATURES" title={<>{t("Everything You Need to Trade with")}<br />{t("Precision")}</>} sub="Built for modern traders who want clarity, automation, and speed without platform bloat." />
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={t(f.t)}>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-primary-glow"><f.icon className="h-4 w-4" /></span>
                <p className="mt-4 text-sm font-semibold">{t(f.t)}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t(f.d)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="py-20">
        <div className="mx-auto max-w-5xl px-4">
          <Head tag="HOW IT WORKS" title="Get Started in Minutes" sub="From setup to execution, the flow is direct and purpose-built for MT5 traders." />
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <div key={t(s.t)} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-primary-glow"><s.icon className="h-4 w-4" /></span><span className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-[10px] text-muted-foreground">0{i + 1}</span></div>
                <p className="mt-6 text-sm font-semibold">{t(s.t)}</p>
                <p className="mt-2 text-xs text-muted-foreground">{t(s.d)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-surface py-20">
        <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 lg:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold tracking-widest text-muted-foreground">{t("PRICING")}</p>
            <h2 className="mt-2 text-3xl font-bold">{t("AI Trading at Zero Cost")}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{t("We partnered with various brokers to provide full access with no subscription fees. Open through partner links to unlock all features.")}</p>
            <ul className="mt-6 space-y-4 text-sm">
              {[[BadgeCheck, "100% Free to Use", "No subscriptions and no hidden usage fees."], [Building2, "Regulated Brokers", "Trade through established global partner brokers."], [Activity, "Tight Spreads", "Competitive spreads and fast execution conditions."]].map(([I, label, d]) => {
                const Icon = I as typeof BadgeCheck;
                return <li key={t(label as string)} className="flex gap-3"><Icon className="mt-0.5 h-4 w-4 text-primary-glow" /><span><b>{t(label as string)}</b><br /><span className="text-xs text-muted-foreground">{t(d as string)}</span></span></li>;
              })}
            </ul>
          </div>
          <div>
            <p className="mb-4 text-center text-sm font-semibold">{t("Official Partner Brokers")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(brokers.data ?? []).map((b) => (
                <div key={b.id} className="rounded-2xl border border-border bg-card p-5 text-center">
                  <BrokerLogo name={b.name} color={b.brand_color} className="mx-auto h-16 w-16" />
                  <p className="mt-3 text-sm font-semibold">{b.name}</p>
                  <ul className="mt-3 space-y-1 text-start text-xs text-muted-foreground">{b.features.map((f) => <li key={f} className="flex items-center gap-2"><Check className="h-3 w-3 text-success" />{f}</li>)}</ul>
                  <Button asChild variant="hero" size="sm" className="mt-4 w-full rounded-full"><a href={b.partner_url ?? "#"} target="_blank" rel="noreferrer">{t("Open Account")}</a></Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-20">
        <div className="mx-auto max-w-4xl rounded-3xl border border-border bg-card px-6 py-16 text-center">
          <h2 className="text-3xl font-bold">{t("Ready to Transform Your Trading?")}</h2>
          <p className="mt-3 text-sm text-muted-foreground">{t("Join traders using AI to make sharper decisions with less manual overhead.")}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild variant="hero" className="rounded-full px-8"><Link to={user ? "/dashboard" : "/register"}>{t("Get Started Free")}</Link></Button>
            <Button asChild variant="secondary" className="rounded-full px-12"><Link to="/login">{t("Sign In")}</Link></Button>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-5 text-xs text-muted-foreground">
            {["No credit card required", "Free tier available", "Cancel anytime"].map((label) => <span key={label} className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" />{t(label)}</span>)}
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-4xl px-4 pb-10">
        <div className="grid gap-8 sm:grid-cols-4">
          <div>
            <p className="font-bold">ArrissaAI</p>
            <div className="mt-3 flex gap-2 text-muted-foreground">{[Instagram, Youtube, Github, Music2].map((I, i) => <span key={i} className="flex h-7 w-7 items-center justify-center rounded-full border border-border"><I className="h-3.5 w-3.5" /></span>)}</div>
          </div>
          <FootCol title="Product" links={[["#features", "Features"], ["#pricing", "Pricing"], ["/ea/ArrissaEA.mq5", "Download EA"]]} />
          <FootCol title="Company" links={[["/about", "About"], ["/contact", "Contact"]]} />
          <FootCol title="Legal" links={[["/terms", "Terms"], ["/privacy", "Privacy"], ["/risk-disclosure", "Risk Disclosure"]]} />
        </div>
        <div className="mt-10 flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground">
          <span>© {new Date().getFullYear()} {t("ArrissaAI. All rights reserved.")}</span>
          <span>{t("Trading in derivatives is highly speculative and involves significant risk.")}</span>
        </div>
      </footer>
    </div>
  );
}

function Head({ tag, title, sub }: { tag: string; title: React.ReactNode; sub: string }) {
  const t = useT();
  return <div className="text-center"><p className="text-[11px] font-semibold tracking-widest text-muted-foreground">{t(tag)}</p><h2 className="mt-2 text-3xl font-bold">{typeof title === "string" ? t(title) : title}</h2><p className="mt-3 text-sm text-muted-foreground">{t(sub)}</p></div>;
}

function FootCol({ title, links }: { title: string; links: [string, string][] }) {
  const t = useT();
  return <div><p className="text-sm font-semibold">{typeof title === "string" ? t(title) : title}</p><ul className="mt-3 space-y-2 text-xs text-muted-foreground">{links.map(([h, l]) => <li key={t(l)}><a href={h} className="hover:text-foreground">{t(l)}</a></li>)}</ul></div>;
}

/** Static preview of the dashboard. */
function Mockup() {
  const t = useT();
  const sig = [["USDJPY", "sell"], ["EURJPY", "sell"], ["BTCUSD", "sell"], ["XAUUSD", "sell"]];
  const trades = ["USDJPY", "USDJPY", "USDJPY", "EURJPY", "USDJPY", "EURJPY", "USDJPY"];
  return (
    <div className="grid h-[300px] grid-cols-[110px_110px_1fr_110px] gap-2 overflow-hidden rounded-3xl border border-border bg-card p-3 text-[7px] sm:h-[300px] md:text-[8px]">
      <div className="space-y-2 text-muted-foreground"><p className="font-bold text-foreground">✳ ArrissaAI</p>{["Dashboard", "Add MT5 Account", "MT5 EA Configuration", "Performance", "Personal Profile"].map((x) => <p key={t(x)}>{t(x)}</p>)}</div>
      <div className="space-y-1.5"><div className="rounded-full bg-primary py-1 text-center text-primary-foreground">{t("Analysis")}</div>
        {sig.map(([s]) => <div key={s} className="rounded-md bg-background p-1.5"><div className="flex justify-between"><b>{s}</b><span className="rounded bg-destructive px-1 text-destructive-foreground">{t("SELL")}</span></div><div className="mt-1 h-1 rounded bg-muted" /><div className="mt-1 rounded bg-primary/70 py-0.5 text-center text-primary-foreground">{t("Use Signal")}</div></div>)}
      </div>
      <div className="space-y-2">
        <div className="flex justify-between rounded-full bg-background px-3 py-1.5"><span>{t("BALANCE")}<br /><b>$ 95364.50</b></span><span>{t("EQUITY")}<br /><b>$ 102564.22</b></span><span>{t("PROFIT")}<br /><b className="text-success">$ 7299.72</b></span></div>
        <div className="rounded-full border border-border px-3 py-1.5">{t("Arrissa Account")}</div>
        <div className="rounded-full border border-primary px-3 py-1.5">BTCUSD</div>
        <div className="grid grid-cols-2 overflow-hidden rounded-full"><span className="bg-buy py-1.5 text-center text-primary-foreground">{t("BUY")}</span><span className="bg-sell-muted py-1.5 text-center text-destructive">{t("SELL")}</span></div>
        <div className="grid grid-cols-3 gap-1">{["Market", "1", "1"].map((x, i) => <span key={i} className="rounded-full border border-border px-2 py-1">{t(x)}</span>)}</div>
        <div className="rounded-full bg-primary py-1.5 text-center text-primary-foreground">{t("Execute Trade")}</div>
      </div>
      <div className="space-y-1.5"><div className="rounded-full bg-primary py-1 text-center text-primary-foreground">{t("Global Manage")}</div>
        {trades.map((t, i) => <div key={i} className={cn("flex justify-between rounded-md bg-background p-1.5")}><b>{t}</b><span className="text-success">+212.83</span></div>)}
      </div>
    </div>
  );
}
