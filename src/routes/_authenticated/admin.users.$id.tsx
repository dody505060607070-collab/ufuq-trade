import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Panel } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/trading";
import { logAudit } from "@/lib/audit";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/admin/users/$id")({ component: UserDetail });

function UserDetail() {
  const { id } = Route.useParams();
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const data = useQuery({
    queryKey: ["admin-user", id],
    queryFn: async () => {
      const [p, r, a, t] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", id),
        supabase.from("trading_accounts").select("id,label,login,platform,server,balance,equity,last_seen_at").eq("user_id", id),
        supabase.from("trades").select("profit,status").eq("user_id", id),
      ]);
      return { profile: p.data, roles: (r.data ?? []).map((x) => x.role), accounts: a.data ?? [], trades: t.data ?? [] };
    },
  });
  if (!data.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data.data.profile) return <p className="text-sm text-muted-foreground">Account not found.</p>;
  const { profile, roles, accounts, trades } = data.data;
  const isAdmin = roles.includes("admin");
  const toggleAdmin = async () => {
    const { error } = isAdmin
      ? await supabase.from("user_roles").delete().eq("user_id", id).eq("role", "admin")
      : await supabase.from("user_roles").insert({ user_id: id, role: "admin" });
    if (error) return toast.error(error.message);
    void logAudit(isAdmin ? "role.revoke_admin" : "role.grant_admin", { user_id: id });
    void qc.invalidateQueries({ queryKey: ["admin-user", id] });
  };
  const net = trades.filter((t) => t.status === "closed").reduce((s, t) => s + Number(t.profit ?? 0), 0);
  return (
    <div className="space-y-6">
      <Link to="/admin/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Users</Link>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-lg font-medium">{profile.full_name || profile.email}</p>
            <p className="text-sm text-muted-foreground">{profile.email} · {profile.country ?? "—"} · {profile.phone ?? "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Roles: {roles.join(", ")} · Joined {new Date(profile.created_at).toLocaleDateString()}</p>
          </div>
          {id !== me?.id && <Button variant={isAdmin ? "destructive" : "secondary"} onClick={toggleAdmin}>{isAdmin ? "Remove admin" : "Make admin"}</Button>}
        </div>
      </Panel>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Accounts</p><p className="text-2xl font-semibold">{accounts.length}</p></div>
        <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Trades</p><p className="text-2xl font-semibold">{trades.length}</p></div>
        <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Net closed P/L</p><p className="text-2xl font-semibold">{fmt(net)}</p></div>
      </div>
      <Panel title="Trading accounts">
        {accounts.length === 0 ? <p className="text-sm text-muted-foreground">No accounts.</p> : (
          <ul className="divide-y divide-border text-sm">
            {accounts.map((a) => <li key={a.id} className="flex justify-between py-2"><span>{a.label || a.login} <span className="text-xs uppercase text-muted-foreground">{a.platform} · {a.server}</span></span><span>${fmt(a.equity)}</span></li>)}
          </ul>
        )}
      </Panel>
    </div>
  );
}
