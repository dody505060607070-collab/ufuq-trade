import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/approvals")({
  head: () => ({ meta: [{ title: "Sign-up requests | Arrissa AI" }] }),
  component: Approvals,
});

function Approvals() {
  const t = useT();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["approvals"],
    queryFn: async () => (await supabase.from("profiles").select("id,email,full_name,created_at,approval_status").order("created_at", { ascending: false })).data ?? [],
  });
  const set = async (id: string, approval_status: "approved" | "rejected") => {
    const { error } = await supabase.from("profiles").update({ approval_status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t(approval_status === "approved" ? "Approved" : "Rejected"));
    void qc.invalidateQueries({ queryKey: ["approvals"] });
  };
  const rows = q.data ?? [];
  const pending = rows.filter((r) => r.approval_status === "pending");
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("New sign-ups wait here until you approve them.")} · {pending.length} {t("pending")}</p>
      <div className="divide-y divide-border rounded-2xl border border-border bg-card/50">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1"><p className="font-medium">{r.full_name || r.email}</p><p className="text-xs text-muted-foreground">{r.email} · {new Date(r.created_at).toLocaleString()}</p></div>
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs", r.approval_status === "approved" ? "bg-success/15 text-success" : r.approval_status === "rejected" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary-glow")}>{t(r.approval_status === "approved" ? "Approved" : r.approval_status === "rejected" ? "Rejected" : "Pending")}</span>
            {r.approval_status !== "approved" && <Button size="sm" variant="hero" onClick={() => set(r.id, "approved")}>{t("Approve")}</Button>}
            {r.approval_status !== "rejected" && <Button size="sm" variant="outline" onClick={() => set(r.id, "rejected")}>{t("Reject")}</Button>}
          </div>
        ))}
      </div>
    </div>
  );
}
