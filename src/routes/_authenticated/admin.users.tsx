import { createFileRoute, Link, Outlet, useMatch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/users")({ component: Users });

function Users() {
  const child = useMatch({ from: "/_authenticated/admin/users/$id", shouldThrow: false });
  const [q, setQ] = useState("");
  const users = useQuery({ queryKey: ["admin-users"], queryFn: async () => (await supabase.from("profiles").select("*").order("created_at", { ascending: false })).data ?? [] });
  if (child) return <Outlet />;
  const list = (users.data ?? []).filter((u) => `${u.email} ${u.full_name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-4">
      <Input placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Name</th><th>Email</th><th>Country</th><th>Joined</th></tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-3"><Link to="/admin/users/$id" params={{ id: u.id }} className="text-primary-glow hover:underline">{u.full_name || "—"}</Link></td>
                <td>{u.email}</td><td>{u.country ?? "—"}</td><td className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
