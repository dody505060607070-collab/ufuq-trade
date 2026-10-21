import { HelpNote } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { AdminCrud } from "@/components/admin/AdminCrud";

export const Route = createFileRoute("/_authenticated/admin/models")({
  component: () => (
    <div className="space-y-3">
      <HelpNote>{"Models select which AI model analyses use."}</HelpNote>
      <p className="text-sm text-muted-foreground">The active model marked as default is used for all dashboard analyses.</p>
      <AdminCrud title="AI models" table="ai_models" order="name" ascending fields={[
        { key: "name", label: "Display name", required: true },
        { key: "model_id", label: "Model ID", type: "select", options: ["openai/gpt-6-astra", "openai/gpt-6-sol", "openai/gpt-6-luna", "openai/gpt-5.5"] },
        { key: "description", label: "Description" },
        { key: "is_default", label: "Default", type: "bool" },
        { key: "is_active", label: "Active", type: "bool" },
      ]} />
    </div>
  ),
});
