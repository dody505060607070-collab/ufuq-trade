import { createFileRoute } from "@tanstack/react-router";
import { AdminCrud } from "@/components/admin/AdminCrud";

export const Route = createFileRoute("/_authenticated/admin/brokers")({
  component: () => (
    <AdminCrud title="Brokers" table="brokers" order="sort_order" ascending fields={[
      { key: "name", label: "Name", required: true },
      { key: "description", label: "Description", type: "textarea", table: false },
      { key: "partner_url", label: "Partner link" },
      { key: "logo_url", label: "Logo URL", table: false },
      { key: "platforms", label: "Platforms (comma separated)", type: "list" },
      { key: "sort_order", label: "Order", type: "number" },
      { key: "is_active", label: "Active", type: "bool" },
    ]} />
  ),
});
