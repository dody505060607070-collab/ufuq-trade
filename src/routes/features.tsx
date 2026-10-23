import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteLayout, SectionHead, FeaturesGrid, PlatformsStrip } from "@/components/site/SiteChrome";
import { useT } from "@/lib/i18n";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/features")({
  head: () => seo("Features", "AI market analysis, automated MT5 execution, smart risk management and an AI Brain that learns from every trade."),
  component: Features,
});

const steps: [string, string, string][] = [
  ["1", "Connect MetaTrader 5", "Attach the Arrissa EA to one chart. Your funds stay with your broker."],
  ["2", "The AI analyses every 10 minutes", "Six AI experts read price, ICT levels, news and whale positioning."],
  ["3", "Trades run on their own", "Entries, stop loss, take profit and profit lock are handled automatically."],
];

function Features() {
  const t = useT();
  return (
    <SiteLayout>
      <section className="mx-auto max-w-7xl px-4 py-20">
        <SectionHead tag="POWERFUL FEATURES" title={<>{t("Everything You Need to Trade with")} <span className="text-gradient-violet">{t("Precision")}</span></>} sub="From market analysis to automated execution, our AI handles every step of the trading process." />
        <div className="mt-12"><FeaturesGrid /></div>
      </section>
      <section className="mx-auto max-w-5xl px-4 py-12">
        <SectionHead tag="HOW IT WORKS" title="Three Steps to Autonomous Trading" sub="Set it once. The platform keeps working while you rest." />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map(([n, h, d]) => (
            <div key={n} className="rounded-2xl border border-border/70 bg-card/50 p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 font-bold text-primary-glow">{n}</span>
              <p className="mt-4 font-semibold">{t(h)}</p><p className="mt-2 text-sm text-muted-foreground">{t(d)}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-4 py-12">
        <SectionHead tag="PLATFORMS" title="One AI Brain, Every Platform" sub="The same safety rules apply wherever you trade." />
        <div className="mt-8"><PlatformsStrip /></div>
        <div className="mt-10 text-center"><Button asChild variant="hero" size="lg" className="rounded-xl"><Link to="/register">{t("Start Trading Free")} <ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link></Button></div>
      </section>
    </SiteLayout>
  );
}
