import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { SiteLayout, SectionHead, BrokerCards } from "@/components/site/SiteChrome";
import { useT } from "@/lib/i18n";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/pricing")({
  head: () => seo("Pricing", "Arrissa AI is free when you open your trading account through one of our partner brokers."),
  component: Pricing,
});

const included = ["AI analysis every 10 minutes", "24/7 Auto-Pilot", "AI Brain that learns from every trade", "Whale Radar", "Profit lock & risk slider", "No subscription fees"];

function Pricing() {
  const t = useT();
  return (
    <SiteLayout>
      <section className="mx-auto max-w-5xl px-4 py-20">
        <SectionHead tag="PRICING" title="AI Trading at Zero Cost" sub="We partnered with various brokers to provide full access with no subscription fees. Open through partner links to unlock all features." />
        <div className="mx-auto mt-10 max-w-md rounded-3xl border border-primary/40 bg-card/60 p-8 text-center shadow-glow">
          <p className="text-5xl font-bold">$0</p><p className="mt-1 text-sm text-muted-foreground">{t("per month")}</p>
          <ul className="mt-6 space-y-2 text-start text-sm">{included.map((x) => <li key={x} className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />{t(x)}</li>)}</ul>
        </div>
        <h2 className="mt-16 text-center text-2xl font-bold">{t("Partner brokers")}</h2>
        <div className="mt-8"><BrokerCards /></div>
      </section>
    </SiteLayout>
  );
}
