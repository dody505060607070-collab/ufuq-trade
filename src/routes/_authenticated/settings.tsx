import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings | Arrissa AI" }] }),
  component: SettingsLayout,
});

const tabs = [
  { to: "/settings", label: "Accounts & EA" },
  { to: "/settings/profile", label: "Personal profile" },
  { to: "/settings/preferences", label: "App settings" },
] as const;

function SettingsLayout() {
  const { pathname } = useLocation();
  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" />
      <div className="mb-6 flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <Link key={t.to} to={t.to} className={`-mb-px border-b-2 px-4 py-2 text-sm ${pathname === t.to ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</Link>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
