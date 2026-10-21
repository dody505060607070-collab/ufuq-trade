import { HelpNote } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/audit")({ component: Audit });

function Audit() {
  const logs = useQuery({ queryKey: ["admin-audit"], queryFn: async () => (await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200)).data ?? [] });
  return (
    <>
      <HelpNote>{"Audit is a log of actions performed in the admin area."}</HelpNote>
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Time</th><th>Action</th><th>Details</th></tr></thead>
        <tbody>
          {(logs.data ?? []).map((l) => (
            <tr key={l.id} className="border-t border-border">
              <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</td>
              <td className="font-mono text-xs">{l.action}</td>
              <td className="max-w-md truncate font-mono text-xs text-muted-foreground">{JSON.stringify(l.details)}</td>
            </tr>
          ))}
          {logs.data?.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No activity yet.</td></tr>}
        </tbody>
      </table>
    </div>
    </>
  );
}
