import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/PublicLayout";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/about")({
  head: () => seo("About", "Arrissa AI builds AI-powered analysis and execution tools for MetaTrader 5 traders."),
  component: () => (
    <LegalPage
      title="About Arrissa AI"
      updated="2026"
      sections={[
        { h: "Our mission", p: "We help retail traders make faster, more structured decisions by combining AI market analysis with disciplined execution and risk management tools." },
        { h: "What we build", p: "A web dashboard that connects to your MetaTrader 5 and TradeLocker accounts through our Expert Advisor, delivering AI analysis, one-click execution, hedging, and performance tracking." },
        { h: "Our principles", p: "Transparency, security of your credentials, and no hidden fees. You stay in control of every trade." },
      ]}
    />
  ),
});
