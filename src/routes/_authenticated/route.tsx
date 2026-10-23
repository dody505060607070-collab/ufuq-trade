import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login", search: { redirect: location.href } });
    const { data: ok } = await supabase.rpc("is_approved", { _user_id: data.user.id });
    if (!ok) throw redirect({ to: "/pending" });
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
