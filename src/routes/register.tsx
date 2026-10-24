import { useT } from "@/lib/i18n";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { AuthCard } from "@/components/site/PublicLayout";
import { GoogleButton } from "@/components/site/GoogleButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { safeRedirect } from "@/lib/auth";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/register")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string } =>
    typeof s["redirect"] === "string" ? { redirect: s["redirect"] } : {},
  head: () => seo("Create account", "Create your free Ufuq Trade account."),
  component: Register,
});

const schema = z.object({
  full_name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
});

function Register() {
  const t = useT();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) return toast.error(t("Name, valid email and a password of 8+ characters are required."));
    if (!agree) return toast.error(t("Please accept the terms and risk disclosure."));
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
       options: { data: { full_name: parsed.data.full_name }, emailRedirectTo: new URL(safeRedirect(redirect).startsWith("/.lovable/oauth/consent") ? safeRedirect(redirect) : "/login", window.location.origin).href },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    void navigate({ to: "/verify-email", search: { email: parsed.data.email } });
  };

  return (
    <AuthCard title="Create your account" subtitle="Free forever. No subscriptions.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="full_name">{t("Full name")}</Label><Input id="full_name" name="full_name" required maxLength={100} /></div>
        <div className="space-y-2"><Label htmlFor="email">{t("Email")}</Label><Input id="email" name="email" type="email" required autoComplete="email" /></div>
        <div className="space-y-2"><Label htmlFor="password">{t("Password")}</Label><Input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" /></div>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
          <span>{t("I agree to the")} <Link to="/terms" className="text-primary-glow">{t("Terms")}</Link>, <Link to="/privacy" className="text-primary-glow">{t("Privacy Policy")}</Link> {t("and")} <Link to="/risk-disclosure" className="text-primary-glow">{t("Risk Disclosure")}</Link>.</span>
        </label>
        <Button type="submit" variant="hero" className="w-full" disabled={busy}>{busy ? t("Creating…") : t("Create account")}</Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />{t("or")}<span className="h-px flex-1 bg-border" /></div>
      <GoogleButton redirect={safeRedirect(redirect)} />
      <p className="mt-6 text-center text-sm text-muted-foreground"> {t("Already have an account?")} <Link to="/login" search={redirect ? { redirect } : {}} className="text-primary-glow hover:underline">{t("Sign in")}</Link>
      </p>
    </AuthCard>
  );
}
