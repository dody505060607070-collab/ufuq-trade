import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel } from "@/components/app/AppShell";
import { AddAccountForm } from "@/components/app/AddAccountForm";

export const Route = createFileRoute("/_authenticated/accounts/add-mt5")({
  head: () => ({ meta: [{ title: "Add MT5 Account | Arrissa AI" }] }),
  component: () => (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Add MT5 Account" subtitle="Link your MetaTrader 5 account. Your broker password is never stored here." />
      <AddAccountForm platform="mt5" />
      <Panel title="Then connect the EA">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Download the ArrissaAI EA from Settings and copy it into MT5 → File → Open Data Folder → MQL5/Experts.</li>
          <li>In MT5, enable Tools → Options → Expert Advisors → "Allow WebRequest" and add this site's address.</li>
          <li>Attach the EA to any chart and paste the account's EA key from Settings.</li>
          <li>Enable Algo Trading. The account shows online on the dashboard within a minute.</li>
        </ol>
      </Panel>
    </div>
  ),
});
