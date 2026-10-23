import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  head: () => seo("Authorize assistant", "Approve or deny private read-only access to your Arrissa AI account."),
  validateSearch: (s: Record<string, unknown>) => ({ authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "" }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization request. Reconnect from your assistant.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login", search: { redirect: location.pathname + location.searchStr } });
    const { data: approved, error } = await supabase.rpc("is_approved", { _user_id: data.session.user.id });
    if (error || !approved) throw redirect({ to: "/pending" });
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.searchStr).get("authorization_id");
    if (!id) throw new Error("Missing authorization request.");
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
    if (error || !data) throw new Error("This request is invalid or expired. Reconnect from your assistant.");
    if ("redirect_url" in data) throw redirect({ href: data.redirect_url });
    return data;
  },
  component: Consent,
  pendingComponent: () => <main className="mx-auto max-w-lg px-6 py-20 text-foreground">Loading authorization…</main>,
  errorComponent: () => <main className="mx-auto max-w-lg px-6 py-20 text-foreground"><h1 className="text-2xl font-semibold">Authorization unavailable</h1><p className="mt-4 text-muted-foreground">This request is missing, expired or unavailable. Start again from your assistant.</p></main>,
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function decide(approve: boolean) {
    setBusy(true); setError("");
    try {
      const result = approve
        ? await supabase.auth.oauth.approveAuthorization(authorization_id, { skipBrowserRedirect: true })
        : await supabase.auth.oauth.denyAuthorization(authorization_id, { skipBrowserRedirect: true });
      if (result.error || !result.data?.redirect_url) throw new Error("Could not save your decision. Please retry.");
      window.location.assign(result.data.redirect_url);
    } catch { setError("Could not save your decision. Please retry."); setBusy(false); }
  }
  return <main className="mx-auto max-w-lg px-6 py-20 text-foreground">
    <h1 className="text-2xl font-semibold">Connect {details.client.name || "assistant"}</h1>
    <p className="mt-4 break-words text-sm text-muted-foreground">{details.client.uri}</p>
    <p className="mt-6">Allow this assistant to read your balances, trades, saved analyses and Auto-Pilot settings.</p>
    <p className="mt-3 text-sm text-muted-foreground">No passwords or API keys. No trading actions. No access to other users. Revoke access from Assistant access in Settings.</p>
    {error && <p role="alert" className="mt-4 text-destructive">{error}</p>}
    <div className="mt-8 flex gap-3"><Button disabled={busy} onClick={() => void decide(true)}>Approve read-only access</Button><Button variant="outline" disabled={busy} onClick={() => void decide(false)}>Deny</Button></div>
  </main>;
}