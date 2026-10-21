import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/app/AppShell";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/settings/preferences")({
  head: () => ({ meta: [{ title: "App settings | Arrissa AI" }] }),
  component: Prefs,
});

type Patch = Database["public"]["Tables"]["profiles"]["Update"];

function Prefs() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ["profile", user?.id], enabled: !!user, queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle()).data });
  const instruments = useQuery({ queryKey: ["instruments"], queryFn: async () => (await supabase.from("instruments").select("*").eq("is_active", true).order("sort_order")).data ?? [] });

  const update = async (patch: Patch) => {
    const { error } = await supabase.from("profiles").update(patch).eq("id", user!.id);
    if (error) return toast.error("Could not save.");
    toast.success("Saved.");
    void qc.invalidateQueries({ queryKey: ["profile"] });
  };
  const enableBrowserNotifications = async (v: boolean) => {
    if (v && "Notification" in window && Notification.permission !== "granted") await Notification.requestPermission();
    void update({ notifications_enabled: v });
  };

  const p = profile.data;
  if (!p) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <Panel>
      <div className="divide-y divide-border">
        <Row title="Default instrument" desc="Instrument selected when you open the dashboard.">
          <Select value={p.default_instrument ?? ""} onValueChange={(v) => update({ default_instrument: v })}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{(instruments.data ?? []).map((i) => <SelectItem key={i.id} value={i.symbol}>{i.symbol}</SelectItem>)}</SelectContent>
          </Select>
        </Row>
        <Row title="Enable Signal Notifications" desc="Get updates on trade execution, signal changes, and account events.">
          <Switch checked={p.notifications_enabled} onCheckedChange={enableBrowserNotifications} />
        </Row>
        <Row title="Marketing emails" desc="Receive product news and campaign emails.">
          <Switch checked={!p.email_opt_out} onCheckedChange={(v) => update({ email_opt_out: !v })} />
        </Row>
      </div>
    </Panel>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
      {children}
    </div>
  );
}
