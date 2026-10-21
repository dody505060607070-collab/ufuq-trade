import { HelpNote } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { AdminCrud } from "@/components/admin/AdminCrud";

export const Route = createFileRoute("/_authenticated/admin/instruments")({
  component: () => (
    <div className="space-y-3"><HelpNote>{"Instruments are symbols traders can pick."}</HelpNote><AdminCrud title="Instruments" table="instruments" order="sort_order" ascending fields={[
      { key: "symbol", label: "Symbol", required: true },
      { key: "name", label: "Name", required: true },
      { key: "category", label: "Category", type: "select", options: ["forex", "metals", "indices", "crypto", "commodities"] },
      { key: "tv_symbol", label: "TradingView symbol", required: true },
      { key: "sort_order", label: "Order", type: "number" },
      { key: "is_active", label: "Active", type: "bool" },
    ]} /></div>
  ),
});
