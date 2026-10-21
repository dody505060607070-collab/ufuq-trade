import { useT, HelpNote, LanguageToggle } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, Monitor, Info } from "lucide-react";
import { Page } from "@/components/app/AppShell";
import { BrokerLogo } from "@/components/app/InstrumentIcon";
import { Button } from "@/components/ui/button";
import { useBrokers } from "@/lib/trading";

export const Route = createFileRoute("/_authenticated/brokers")({
  head: () => ({ meta: [{ title: "Brokers | Arrissa AI" }, { name: "description", content: "Partner brokers supported on the Arrissa platform." }] }),
  component: Brokers,
});

function Brokers() {
  const t = useT();
  const brokers = useBrokers();
  return (
    <Page wide title={t("Brokers")} subtitle={t("Partner brokers supported on the Arrissa platform. Open an account through our partner link to connect.")}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(brokers.data ?? []).map((b) => (
          <div key={b.id} className="flex flex-col rounded-3xl bg-card p-5">
            <BrokerLogo name={b.name} color={b.brand_color} className="h-12 w-12" />
            <p className="mt-3 font-bold">{b.name}</p>
            {b.regulation && <p className="text-xs text-muted-foreground">{b.regulation}</p>}
            <div className="mt-2 flex gap-1">{b.platforms.map((p) => <span key={p} className="rounded-md border border-primary/40 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary-glow">{p}</span>)}</div>
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <Button asChild variant="hero" className="w-full rounded-full"><a href={b.partner_url ?? "#"} target="_blank" rel="noreferrer"><ExternalLink />  {t("Open Account")}</a></Button>
              <Button asChild variant="outline" className="w-full rounded-full"><Link to="/accounts/add-mt5"><Monitor />  {t("Add MT5 Account")}</Link></Button>
            </div>
          </div>
        ))}
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5" />  {t("You must register through our partner link before connecting an account.")}</p>
    </Page>
  );
}
