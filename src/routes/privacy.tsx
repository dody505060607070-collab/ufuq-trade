import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/PublicLayout";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/privacy")({
  head: () => seo("Privacy Policy", "How Arrissa AI collects, uses and protects your data."),
  component: () => (
    <LegalPage
      title="Privacy Policy"
      updated="October 2026"
      sections={[
        { h: "Data we collect", p: "Account details (name, email), connected trading account identifiers, trade history reported by the Expert Advisor, and usage data needed to run the service." },
        { h: "How we use it", p: "To provide analysis, relay trade instructions, show performance, send account notifications, and improve the platform." },
        { h: "Credentials", p: "We never ask for your broker master password. The Expert Advisor authenticates with a unique per-account key that you can revoke at any time." },
        { h: "Sharing", p: "We do not sell your data. We share data only with infrastructure providers needed to run the service, or when required by law." },
        { h: "Your rights", p: "You can access, update or delete your data from Settings, or contact us to request deletion." },
      ]}
    />
  ),
});
