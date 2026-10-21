import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel } from "@/components/app/AppShell";
import { AddAccountForm } from "@/components/app/AddAccountForm";

export const Route = createFileRoute("/_authenticated/accounts/add-tradelocker")({
  head: () => ({ meta: [{ title: "Add TradeLocker Account | Arrissa AI" }] }),
  component: () => (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Add TradeLocker Account" subtitle="Register your TradeLocker account on the platform." />
      <AddAccountForm platform="tradelocker" />
      <Panel title="Connection">
        <p className="text-sm text-muted-foreground">
          TradeLocker accounts receive instructions through a bridge that uses the same per-account EA key shown in Settings. Direct TradeLocker API execution will be enabled once the platform's TradeLocker API credentials are configured.
        </p>
      </Panel>
    </div>
  ),
});
