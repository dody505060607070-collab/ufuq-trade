import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Brain, Zap, Shield, LineChart, Lock, Bell, Layers, Crosshair, Download, Link2, Sparkles, PlayCircle, BadgeCheck, Building2, ArrowRight,
} from "lucide-react";
import { PublicLayout } from "@/components/site/PublicLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => seo("AI Trading Signals & Execution for MT5", "AI market analysis, one-click execution, smart risk management and real-time analytics for MetaTrader 5 traders."),
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
  { icon: Download, t: "Install EA", d: "Install the ArrissaAI Expert Advisor for MetaTrader 5." },
  { icon: Link2, t: "Connect Account", d: "Link your MT5 account securely with your API credentials." },
  { icon: Sparkles, t: "Get AI Analysis", d: "Receive structured insights and directional trade suggestions." },
  { icon: PlayCircle, t: "Execute & Manage", d: "Execute manually or automate management based on your strategy rules." },
];

function Landing() {
  const { data: instruments } = useQuery({
    queryKey: ["public-instruments"],
    queryFn: async () => (await supabase.from("instruments").select("symbol,name").order("sort_order")).data ?? [],
  });
  const { data: brokers } = useQuery({
    queryKey: ["public-brokers"],
    queryFn: async () => (await supabase.from("brokers").select("id,name").order("sort_order")).data ?? [],
  });

  return (
    <PublicLayout>
      <section className="relative overflow-hidden bg-hero-glow">
        <div className="grid-bg absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-24 text-center md:pt-32">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary-glow" /> AI-powered trading for MetaTrader 5
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
            Trade smarter with <span className="text-gradient">AI analysis</span> and one-click execution
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Real-time signal direction, account-aware execution and smart risk controls — all from one dashboard connected to your MT5 accounts.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button asChild variant="hero" size="lg"><Link to="/register">Create free account <ArrowRight /></Link></Button>
            <Button asChild variant="outline" size="lg"><Link to="/login">Sign in</Link></Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">No subscriptions and no hidden usage fees.</p>
        </div>
      </section>

      <section className="border-y border-border/60 bg-surface py-6">
        <div className="mx-auto max-w-6xl px-4">
          <p className="mb-3 text-center text-xs uppercase tracking-widest text-muted-foreground">Supported instruments</p>
          <div className="flex flex-wrap justify-center gap-2">
            {(instruments ?? []).map((i) => (
              <span key={i.symbol} title={i.name} className="rounded-md border border-border bg-card px-3 py-1 font-mono text-sm">{i.symbol}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-24">
        <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">Everything you need to trade with confidence</h2>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.t} className="rounded-xl border border-border bg-card p-6 transition hover:border-primary/60">
              <f.icon className="h-6 w-6 text-primary-glow" />
              <h3 className="mt-4 font-medium">{f.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border/60 bg-surface py-24">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">How it works</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-4">
            {steps.map((s, i) => (
              <div key={s.t} className="relative rounded-xl border border-border bg-card p-6">
                <span className="absolute right-4 top-4 font-mono text-xs text-muted-foreground">0{i + 1}</span>
                <s.icon className="h-6 w-6 text-primary-glow" />
                <h3 className="mt-4 font-medium">{s.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-24 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-8">
          <BadgeCheck className="h-7 w-7 text-success" />
          <h3 className="mt-4 text-2xl font-semibold">Free to use</h3>
          <p className="mt-2 text-muted-foreground">No subscriptions and no hidden usage fees.</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-8">
          <Building2 className="h-7 w-7 text-primary-glow" />
          <h3 className="mt-4 text-2xl font-semibold">Regulated Brokers</h3>
          <p className="mt-2 text-muted-foreground">Trade through established global partner brokers.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(brokers ?? []).map((b) => <span key={b.id} className="rounded-md bg-secondary px-3 py-1 text-sm">{b.name}</span>)}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24">
        <div className="rounded-3xl bg-gradient-primary p-10 text-center shadow-glow md:p-16">
          <h2 className="text-3xl font-semibold text-primary-foreground md:text-4xl">Start trading with Arrissa AI today</h2>
          <Button asChild size="lg" variant="secondary" className="mt-8"><Link to="/register">Create your account</Link></Button>
        </div>
      </section>
    </PublicLayout>
  );
}
