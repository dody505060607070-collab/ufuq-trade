import { useT } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel } from "@/components/app/AppShell";
import { AddAccountForm } from "@/components/app/AddAccountForm";

export const Route = createFileRoute("/_authenticated/accounts/add-tradelocker")({
  head: () => ({ meta: [{ title: "Add TradeLocker Account | Ufuq Trade" }] }),
  component: AddTradeLocker,
});

function AddTradeLocker() {
  const t = useT();
  return (
    <div className="max-w-3xl space-y-6 p-4 md:p-8">
      <PageHeader title={t("Add TradeLocker Account")} subtitle={t("Register your TradeLocker account on the platform.")} />
      <AddAccountForm platform="tradelocker" />
      <Panel title={t("Connection")}>
        <p className="text-sm text-muted-foreground">
           {t("TradeLocker accounts receive instructions through a bridge that uses the same per-account EA key shown in Settings. Direct TradeLocker API execution will be enabled once the platform's TradeLocker API credentials are configured.")} </p>
      </Panel>
    </div>
  );
}
