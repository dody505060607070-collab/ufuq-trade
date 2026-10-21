import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthCard } from "@/components/site/PublicLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/unsubscribe")({
  head: () => seo("Unsubscribe", "Manage your Arrissa AI email preferences."),
  component: Unsubscribe,
});

function Unsubscribe() {
  const { user, loading } = useAuth();
  const [done, setDone] = useState(false);
  const run = async () => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ email_opt_out: true }).eq("id", user.id);
    if (error) return toast.error("Could not update your preferences.");
    setDone(true);
  };
  return (
    <AuthCard title="Email preferences" subtitle="Stop receiving marketing and campaign emails.">
      {loading ? null : !user ? (
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>Sign in to confirm it's you, then come back to this page.</p>
          <Button asChild variant="hero" className="w-full"><Link to="/login" search={{ redirect: "/unsubscribe" }}>Sign in</Link></Button>
        </div>
      ) : done ? (
        <p className="text-sm text-success">You've been unsubscribed. Account emails (security, verification) will still be sent.</p>
      ) : (
        <Button onClick={run} variant="destructive" className="w-full">Unsubscribe {user.email}</Button>
      )}
    </AuthCard>
  );
}
