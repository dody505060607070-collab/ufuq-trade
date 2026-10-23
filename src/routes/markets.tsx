import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteLayout, SectionHead, MarketsGrid } from "@/components/site/SiteChrome";
import { InstrumentIcon } from "@/components/app/InstrumentIcon";
import { useInstruments } from "@/lib/trading";
import { useT } from "@/lib/i18n";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/markets")({
  head: () => seo("Markets", "Trade gold, forex, crypto, indices, stocks and commodities with Arrissa AI on MetaTrader 5."),
  component: Markets,
});

function Markets() {
  const t = useT();
  const instruments = useInstruments();
  return (
    <SiteLayout>
      <section className="mx-auto max-w-7xl px-4 py-20">
        <SectionHead tag="SUPPORTED MARKETS" title="Trade What Moves the World" sub="From gold to crypto, forex to indices — our AI analyzes major markets and finds the best opportunities for you." />
        <div className="mt-12"><MarketsGrid /></div>
      </section>
      <section className="mx-auto max-w-5xl px-4 pb-20">
        <h2 className="text-center text-2xl font-bold">{t("Instruments the AI watches")}</h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(instruments.data ?? []).map((i) => (
            <div key={i.id} className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/50 px-4 py-3">
              <InstrumentIcon flag={i.flag} className="h-9 w-9" />
              <div><p className="text-sm font-semibold">{i.symbol}</p><p className="text-xs text-muted-foreground">{i.name}</p></div>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center"><Button asChild variant="hero" size="lg" className="rounded-xl"><Link to="/register">{t("Start Trading Free")} <ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link></Button></div>
      </section>
    </SiteLayout>
  );
}
