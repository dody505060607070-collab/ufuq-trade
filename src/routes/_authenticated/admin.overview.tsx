import { HelpNote, Tx } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/overview")({ component: Overview });

const count = async (t: "profiles" | "trading_accounts" | "trades" | "analyses" | "trade_commands" | "contact_messages") =>
  (await supabase.from(t).select("*", { count: "exact", head: true })).count ?? 0;

function Overview() {
  const stats = useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const [users, accounts, trades, analyses, commands, messages] = await Promise.all([count("profiles"), count("trading_accounts"), count("trades"), count("analyses"), count("trade_commands"), count("contact_messages")]);
      return { users, accounts, trades, analyses, commands, messages };
    },
  });
  const msgs = useQuery({ queryKey: ["admin-messages"], queryFn: async () => (await supabase.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(10)).data ?? [] });
  const s = stats.data;
  return (
    <>
      <HelpNote>{"The admin overview summarizes platform activity and recent messages."}</HelpNote>
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[["Users", s?.users], ["Accounts", s?.accounts], ["Trades", s?.trades], ["AI analyses", s?.analyses], ["Commands", s?.commands], ["Messages", s?.messages]].map(([l, v]) => (
          <div key={String(l)} className="rounded-xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 text-2xl font-semibold">{v ?? "…"}</p></div>
        ))}
      </div>
      <Panel title="Latest contact messages">
        {(msgs.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground"><Tx>No messages.</Tx></p> : (
          <ul className="divide-y divide-border">
            {msgs.data!.map((m) => (
              <li key={m.id} className="py-3 text-sm">
                <p className="font-medium">{m.name} <a href={`mailto:${m.email}`} className="text-xs text-primary-glow">{m.email}</a> <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span></p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{m.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
    </>
  );
}
