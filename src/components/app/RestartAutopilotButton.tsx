import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { restartAutopilot } from "@/lib/autopilot.functions";

export function RestartAutopilotButton({ className }: { className?: string }) {
  const t = useT();
  const qc = useQueryClient();
  const run = useServerFn(restartAutopilot);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await run();
      toast.success(`${t("Auto-Pilot restarted and scanned now")} · ${r.queued} ${t("trade(s) queued")}`);
      void qc.invalidateQueries();
    } catch { toast.error(t("Could not restart Auto-Pilot.")); }
    finally { setBusy(false); }
  };
  return (
    <Button variant="hero" className={className ?? "rounded-full"} onClick={() => void go()} disabled={busy}>
      {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Power className="me-2 h-4 w-4" />}
      {t("Restart Auto-Pilot")}
    </Button>
  );
}
