import { HelpNote } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { AdminCrud } from "@/components/admin/AdminCrud";

export const Route = createFileRoute("/_authenticated/admin/campaign")({
  component: () => (
    <div className="space-y-3">
      <HelpNote>{"Campaign manages email campaign drafts."}</HelpNote>
      <p className="text-sm text-muted-foreground">Draft email campaigns for users who haven't unsubscribed. Sending requires an email domain to be set up.</p>
      <AdminCrud title="Campaigns" table="campaigns" fields={[
        { key: "subject", label: "Subject", required: true },
        { key: "body", label: "Body", type: "textarea", required: true, table: false },
        { key: "status", label: "Status", type: "select", options: ["draft", "ready"] },
      ]} />
    </div>
  ),
});
