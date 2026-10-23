import { createFileRoute } from "@tanstack/react-router";
import { Target, Cpu, ShieldCheck } from "lucide-react";
import { SiteLayout, SectionHead, PlatformsStrip } from "@/components/site/SiteChrome";
import { useT } from "@/lib/i18n";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/about")({
  head: () => seo("About", "Arrissa AI builds AI-powered analysis and execution tools for MetaTrader 5 traders."),
  component: About,
});

const items = [
  { i: Target, h: "Our mission", p: "We help retail traders make faster, more structured decisions by combining AI market analysis with disciplined execution and risk management tools." },
  { i: Cpu, h: "What we build", p: "A web dashboard that connects to your MetaTrader 5 and TradeLocker accounts through our Expert Advisor, delivering AI analysis, one-click execution, hedging, and performance tracking." },
  { i: ShieldCheck, h: "Our principles", p: "Transparency, security of your credentials, and no hidden fees. You stay in control of every trade." },
];

function About() {
  const t = useT();
  return (
    <SiteLayout>
      <section className="mx-auto max-w-5xl px-4 py-20">
        <SectionHead tag="ABOUT US" title="About Arrissa AI" sub="Smarter Analysis. Bigger Opportunities." />
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {items.map((x) => (
            <div key={x.h} className="rounded-2xl border border-border/70 bg-card/50 p-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/30 bg-primary/10"><x.i className="h-5 w-5 text-primary-glow" /></span>
              <p className="mt-4 font-semibold">{t(x.h)}</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(x.p)}</p>
            </div>
          ))}
        </div>
        <div className="mt-14"><PlatformsStrip /></div>
      </section>
    </SiteLayout>
  );
}
