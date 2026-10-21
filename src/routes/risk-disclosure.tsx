import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/PublicLayout";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/risk-disclosure")({
  head: () => seo("Risk Disclosure", "Trading leveraged products carries a high level of risk. Read the Arrissa AI risk disclosure."),
  component: () => (
    <LegalPage
      title="Risk Disclosure"
      updated="October 2026"
      sections={[
        { h: "High risk", p: "Trading forex, CFDs, metals, indices and crypto on margin carries a high level of risk and may not be suitable for all investors. You can lose more than your initial deposit." },
        { h: "AI limitations", p: "AI analysis is probabilistic and can be wrong. Past performance is not indicative of future results." },
        { h: "Automation", p: "Automated trading and hedging tools can execute quickly and in volume. Test on a demo account first and use appropriate lot sizes." },
        { h: "Technology risk", p: "Internet, broker, VPS or MetaTrader outages can delay or prevent execution of instructions." },
      ]}
    />
  ),
});
