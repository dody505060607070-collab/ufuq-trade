import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/PublicLayout";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/terms")({
  head: () => seo("Terms of Service", "The terms that govern your use of the Arrissa AI platform."),
  component: () => (
    <LegalPage
      title="Terms of Service"
      updated="October 2026"
      sections={[
        { h: "1. Acceptance", p: "By creating an account or using Arrissa AI you agree to these terms. If you do not agree, do not use the platform." },
        { h: "2. The service", p: "Arrissa AI provides analysis tools and an Expert Advisor that relays your instructions to your own trading accounts. We do not hold client funds and are not a broker." },
        { h: "3. No financial advice", p: "AI analysis is informational only and is not investment advice. You are solely responsible for your trading decisions." },
        { h: "4. Your account", p: "Keep your credentials secure. You are responsible for all activity under your account and connected trading accounts." },
        { h: "5. Liability", p: "To the maximum extent permitted by law, Arrissa AI is not liable for trading losses, missed trades, connectivity failures, or broker issues." },
        { h: "6. Changes", p: "We may update these terms. Continued use after changes means you accept the updated terms." },
      ]}
    />
  ),
});
