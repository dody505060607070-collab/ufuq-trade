import { useT } from "@/lib/i18n";
import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data } = await supabase.rpc("has_role", { _user_id: u.user!.id, _role: "admin" });
    if (!data) throw redirect({ to: "/dashboard" });
  },
  head: () => ({ meta: [{ title: "Admin | Ufuq Trade" }] }),
  component: AdminLayout,
});

const tabs = [
  ["/admin/overview", "Overview"], ["/admin/approvals", "Sign-up requests"], ["/admin/users", "Users"], ["/admin/brokers", "Brokers"], ["/admin/instruments", "Instruments"],
  ["/admin/models", "AI Models"], ["/admin/signals", "Signals"], ["/admin/ea-releases", "EA Releases"], ["/admin/campaign", "Campaign"],
  ["/admin/audit", "Audit"], ["/admin/settings", "Settings"],
] as const;

function AdminLayout() {
  const t = useT();
  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t("Admin panel")}</h1>
      <div className="mb-6 mt-4 flex flex-wrap gap-1 border-b border-border">
        {tabs.map(([to, label]) => (
          <Link key={to} to={to} className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground" activeProps={{ className: "!border-primary !text-foreground" }}>{t(label)}</Link>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
