import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteLayout, SectionHead, BrokerCards } from "@/components/site/SiteChrome";
import { useT } from "@/lib/i18n";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/pricing")({
  head: () => seo("Pricing", "Ufuq Trade full AI trading plan: $250 per month with Auto-Pilot, AI Brain, Whale Radar and 24/7 support."),
  component: Pricing,
});

const included = ["AI analysis every 10 minutes", "24/7 Auto-Pilot", "AI Brain that learns from every trade", "Whale Radar", "Profit lock & risk slider", "Premium AI models & powerful servers", "24/7 support & continuous development"];

function Pricing() {
  const t = useT();
  return (
    <SiteLayout>
      <section className="mx-auto max-w-5xl px-4 py-20">
        <SectionHead tag="PRICING" title="One Plan. Everything Included." sub="Full access to every feature of the platform with one simple monthly subscription." />
        <div className="mx-auto mt-10 max-w-md rounded-3xl border border-primary/40 bg-card/60 p-8 text-center shadow-glow">
          <p className="text-sm font-semibold text-primary-glow">{t("Pro Plan")}</p>
          <p className="mt-2 text-5xl font-bold">$250</p><p className="mt-1 text-sm text-muted-foreground">{t("per month")}</p>
          <ul className="mt-6 space-y-2 text-start text-sm">{included.map((x) => <li key={x} className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />{t(x)}</li>)}</ul>
          <Button asChild variant="hero" className="mt-6 h-11 w-full rounded-xl"><Link to="/register">{t("Subscribe now")}</Link></Button>
        </div>
        <h2 className="mt-16 text-center text-2xl font-bold">{t("Partner brokers")}</h2>
        <div className="mt-8"><BrokerCards /></div>
      </section>
    </SiteLayout>
  );
}
