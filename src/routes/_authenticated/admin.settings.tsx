import { HelpNote } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Panel } from "@/components/app/AppShell";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/admin/settings")({ component: AdminSettings });

type Platform = { maintenance?: boolean; signup_open?: boolean };

function AdminSettings() {
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["app-settings"], queryFn: async () => ((await supabase.from("app_settings").select("value").eq("key", "platform").maybeSingle()).data?.value ?? {}) as Platform });
  const set = async (patch: Platform) => {
    const value = { ...(s.data ?? {}), ...patch };
    const { error } = await supabase.from("app_settings").upsert({ key: "platform", value, updated_at: new Date().toISOString() });
    if (error) return toast.error(error.message);
    void logAudit("settings.update", value);
    toast.success("Saved.");
    void qc.invalidateQueries({ queryKey: ["app-settings"] });
  };
  return (
    <>
      <HelpNote>{"Settings control site-wide options."}</HelpNote>
    <Panel>
      <div className="divide-y divide-border">
        <label className="flex items-center justify-between py-4"><span><span className="text-sm font-medium">Maintenance mode</span><br /><span className="text-xs text-muted-foreground">Show a maintenance banner to all users.</span></span><Switch checked={!!s.data?.maintenance} onCheckedChange={(v) => set({ maintenance: v })} /></label>
        <label className="flex items-center justify-between py-4"><span><span className="text-sm font-medium">Open registration</span><br /><span className="text-xs text-muted-foreground">Allow new users to create accounts.</span></span><Switch checked={s.data?.signup_open !== false} onCheckedChange={(v) => set({ signup_open: v })} /></label>
      </div>
    </Panel>
    </>
  );
}
