import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { lovable } from "@/integrations/lovable/index";
import { safeRedirect } from "@/lib/auth";

export function GoogleButton({ redirect }: { redirect: string }) {
  const t = useT();
  const onClick = async () => {
    const target = safeRedirect(redirect);
    sessionStorage.setItem("post_auth_redirect", target);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: new URL(target.startsWith("/.lovable/oauth/consent") ? target : "/login", window.location.origin).href });
    if (result.error) toast.error(t("Google sign-in failed."));
  };
  return (
    <Button type="button" variant="outline" className="w-full" onClick={onClick}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden><path fill="currentColor" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.62 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.68 3.7 14.55 2.75 12 2.75 6.9 2.75 2.75 6.9 2.75 12S6.9 21.25 12 21.25c5.34 0 8.88-3.75 8.88-9.04 0-.6-.07-1.06-.15-1.51Z"/></svg> {t("Continue with Google")} </Button>
  );
}
