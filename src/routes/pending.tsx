import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Hourglass } from "lucide-react";
import { AuthCard } from "@/components/site/PublicLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/pending")({
  head: () => seo("Waiting for approval", "Your Arrissa AI account is waiting for admin approval."),
  component: Pending,
});

function Pending() {
  const t = useT();
  const nav = useNavigate();
  return (
    <AuthCard title="Waiting for admin approval" subtitle="Your account was created. The admin will review it soon, then you can open the dashboard.">
      <div className="flex flex-col items-center gap-4">
        <Hourglass className="h-10 w-10 text-primary-glow" />
        <Button variant="hero" className="w-full" onClick={() => nav({ to: "/dashboard" })}>{t("Check again")}</Button>
        <Button variant="outline" className="w-full" onClick={async () => { await supabase.auth.signOut(); nav({ to: "/" }); }}>{t("Sign out")}</Button>
      </div>
    </AuthCard>
  );
}
