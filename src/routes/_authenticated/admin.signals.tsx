import { HelpNote } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { AdminCrud } from "@/components/admin/AdminCrud";

export const Route = createFileRoute("/_authenticated/admin/signals")({
  component: () => (
    <div className="space-y-3"><HelpNote>{"Signals are published trading signals."}</HelpNote><AdminCrud title="Signals" table="signals" fields={[
      { key: "symbol", label: "Symbol", required: true },
      { key: "direction", label: "Direction", type: "select", options: ["buy", "sell"] },
      { key: "entry", label: "Entry", type: "number" },
      { key: "stop_loss", label: "Stop loss", type: "number" },
      { key: "take_profit", label: "Take profit", type: "number" },
      { key: "note", label: "Note", type: "textarea", table: false },
      { key: "is_active", label: "Active", type: "bool" },
    ]} /></div>
  ),
});
