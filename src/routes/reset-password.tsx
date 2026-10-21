import { useT } from "@/lib/i18n";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AuthCard } from "@/components/site/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/reset-password")({
  head: () => seo("Set new password", "Choose a new password for your Arrissa AI account."),
  component: Reset,
});

function Reset() {
  const t = useT();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (window.location.hash.includes("type=recovery")) setReady(true);
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password"));
    if (password.length < 8) return toast.error(t("Password must be at least 8 characters."));
    if (password !== String(f.get("confirm"))) return toast.error(t("Passwords don't match."));
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("Password updated."));
    void navigate({ to: "/dashboard" });
  };

  return (
    <AuthCard title="Set a new password">
      {!ready ? (
        <p className="text-sm text-muted-foreground">{t("Open this page from the reset link in your email.")}</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="password">{t("New password")}</Label><Input id="password" name="password" type="password" minLength={8} required /></div>
          <div className="space-y-2"><Label htmlFor="confirm">{t("Confirm password")}</Label><Input id="confirm" name="confirm" type="password" minLength={8} required /></div>
          <Button type="submit" variant="hero" className="w-full" disabled={busy}>{t("Update password")}</Button>
        </form>
      )}
    </AuthCard>
  );
}
