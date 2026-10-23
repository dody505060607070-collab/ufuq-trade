import { useT } from "@/lib/i18n";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AuthCard } from "@/components/site/PublicLayout";
import { GoogleButton } from "@/components/site/GoogleButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { safeRedirect, useAuth } from "@/lib/auth";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => {
    const value = s["next"] ?? s["redirect"];
    return typeof value === "string" ? { redirect: safeRedirect(value) } : {};
  },
  head: () => seo("Sign in", "Sign in to your Arrissa AI trading dashboard."),
  component: Login,
});

function Login() {
  const t = useT();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const target = safeRedirect(redirect);

  useEffect(() => {
    if (!user) return;
    const stored = sessionStorage.getItem("post_auth_redirect");
    sessionStorage.removeItem("post_auth_redirect");
    void navigate({ to: safeRedirect(stored ?? target), replace: true });
  }, [user, navigate, target]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: String(f.get("email")), password: String(f.get("password")) });
    setBusy(false);
    if (error) toast.error(error.message === "Email not confirmed" ? t("Please verify your email first.") : t("Invalid email or password."));
  };

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to your trading dashboard.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="email">{t("Email")}</Label><Input id="email" name="email" type="email" required autoComplete="email" /></div>
        <div className="space-y-2">
          <div className="flex justify-between"><Label htmlFor="password">{t("Password")}</Label><Link to="/forgot-password" className="text-xs text-primary-glow hover:underline">{t("Forgot password?")}</Link></div>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <Button type="submit" variant="hero" className="w-full" disabled={busy}>{busy ? t("Signing in…") : t("Sign in")}</Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />{t("or")}<span className="h-px flex-1 bg-border" /></div>
      <GoogleButton redirect={target} />
      <p className="mt-6 text-center text-sm text-muted-foreground"> {t("No account?")} <Link to="/register" search={redirect ? { redirect } : {}} className="text-primary-glow hover:underline">{t("Create one")}</Link>
      </p>
    </AuthCard>
  );
}
