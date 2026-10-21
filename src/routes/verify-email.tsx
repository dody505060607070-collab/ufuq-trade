import { useT } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { AuthCard } from "@/components/site/PublicLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/verify-email")({
  validateSearch: (s: Record<string, unknown>): { email?: string } =>
    typeof s["email"] === "string" ? { email: s["email"] } : {},
  head: () => seo("Verify your email", "Confirm your email address to activate your Arrissa AI account."),
  component: Verify,
});

function Verify() {
  const t = useT();
  const { email } = Route.useSearch();
  const resend = async () => {
    if (!email) return;
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${window.location.origin}/login` } });
    if (error) toast.error(error.message); else toast.success(t("Verification email sent again."));
  };
  return (
    <AuthCard title="Check your inbox" subtitle={email ? t("We sent a verification link to {email}.", { email }) : t("We sent you a verification link.")}>
      <div className="space-y-4 text-sm text-muted-foreground">
        <MailCheck className="h-10 w-10 text-primary-glow" />
        <p>{t("Click the link in the email to activate your account. Check your spam folder if you don't see it.")}</p>
        {email && <Button variant="outline" className="w-full" onClick={resend}>{t("Resend email")}</Button>}
        <Button asChild variant="hero" className="w-full"><Link to="/login">{t("Back to sign in")}</Link></Button>
      </div>
    </AuthCard>
  );
}
