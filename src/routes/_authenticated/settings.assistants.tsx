import { Tx } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Page, Card } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/_authenticated/settings/assistants")({
  head: () => seo("Assistant access", "Manage and revoke private assistant access to your Ufuq Trade account."),
  component: Assistants,
});
function Assistants() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const grants = useQuery({ queryKey: ["assistant-grants"], queryFn: async () => {
    const { data, error } = await supabase.auth.oauth.listGrants();
    if (error) throw new Error("Could not load assistant access.");
    return data ?? [];
  } });
  async function revoke(clientId: string) {
    if (!window.confirm("Revoke this assistant's access?")) return;
    setBusy(clientId); setError("");
    try {
      const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["assistant-grants"] });
    } catch { setError("Could not revoke access. Please retry."); }
    finally { setBusy(""); }
  }
  return <Page title="Assistant access" subtitle="Private account connections">
    <Card title="Authorized assistants">
      {grants.isPending ? <p>Loading…</p> : grants.isError ? <p role="alert"><Tx>Could not load assistant access.</Tx></p> : !grants.data?.length ? <p className="text-muted-foreground"><Tx>No authorized assistants.</Tx></p> : grants.data.map((g) => <div key={g.client.id} className="flex items-center justify-between gap-3 border-b border-border py-4"><span className="break-words">{g.client.name}</span><Button variant="outline" disabled={!!busy} onClick={() => void revoke(g.client.id)}><Tx>Revoke access</Tx></Button></div>)}
      {error && <p role="alert" className="mt-4 text-destructive">{error}</p>}
    </Card>
  </Page>;
}