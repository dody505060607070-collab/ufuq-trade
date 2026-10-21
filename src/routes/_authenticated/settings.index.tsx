import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Download, RefreshCw, Trash2, Wifi, WifiOff, Eye, EyeOff } from "lucide-react";
import { Panel, Empty } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { fmt, isOnline, useAccounts, type Account } from "@/lib/trading";

export const Route = createFileRoute("/_authenticated/settings/")({
  component: AccountsSettings,
});

function AccountsSettings() {
  const accounts = useAccounts();
  const ea = useQuery({ queryKey: ["ea-latest"], queryFn: async () => (await supabase.from("ea_releases").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle()).data });
  return (
    <div className="space-y-6">
      <Panel title="Expert Advisor">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-medium">ArrissaAI EA {ea.data ? `v${ea.data.version}` : ""}</p>
            <p className="text-muted-foreground">{ea.data?.notes ?? "No EA release published yet."}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">Sync URL: {typeof window !== "undefined" ? `${window.location.origin}/api/public/ea/sync` : ""}</p>
          </div>
          {ea.data?.file_url ? <Button asChild variant="hero"><a href={ea.data.file_url} target="_blank" rel="noreferrer"><Download /> Download EA</a></Button> : <Button disabled><Download /> Download EA</Button>}
        </div>
      </Panel>
      <Panel title="Connected accounts">
        {(accounts.data ?? []).length === 0 ? (
          <Empty title="No accounts yet"><Link to="/accounts/add-mt5" className="text-primary-glow underline">Add MT5 Account</Link></Empty>
        ) : <div className="space-y-3">{accounts.data!.map((a) => <AccountRow key={a.id} a={a} />)}</div>}
      </Panel>
    </div>
  );
}

function AccountRow({ a }: { a: Account }) {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [lot, setLot] = useState(String(a.lot_size));
  const refresh = () => qc.invalidateQueries({ queryKey: ["accounts"] });
  const update = async (patch: Partial<Account>, msg: string) => {
    const { error } = await supabase.from("trading_accounts").update(patch).eq("id", a.id);
    if (error) return toast.error("Update failed.");
    toast.success(msg);
    void refresh();
  };
  const remove = async () => {
    if (!confirm("Remove this account? Its trade history will be deleted.")) return;
    await supabase.from("trading_accounts").delete().eq("id", a.id);
    void refresh();
  };
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{a.label || a.login} <span className="text-xs uppercase text-muted-foreground">{a.platform} · {a.server}</span></p>
          <p className="text-xs text-muted-foreground">Balance ${fmt(a.balance)} · Equity ${fmt(a.equity)} · {a.last_seen_at ? `Last seen ${new Date(a.last_seen_at).toLocaleString()}` : "EA never connected"}</p>
        </div>
        <span className={`flex items-center gap-1 text-xs ${isOnline(a) ? "text-success" : "text-muted-foreground"}`}>{isOnline(a) ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{isOnline(a) ? "EA connected" : "EA Is Not Connected"}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{show ? a.ea_key : "••••••••-••••-••••-••••-••••••••••••"}</code>
        <Button size="icon" variant="ghost" onClick={() => setShow(!show)} aria-label="Show key">{show ? <EyeOff /> : <Eye />}</Button>
        <Button size="icon" variant="ghost" onClick={() => { void navigator.clipboard.writeText(a.ea_key); toast.success("EA key copied."); }} aria-label="Copy key"><Copy /></Button>
        <Button size="sm" variant="ghost" onClick={() => confirm("Generate a new key? The EA must be updated with it.") && update({ ea_key: crypto.randomUUID() }, "New EA key generated.")}><RefreshCw /> New key</Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Lot</span><Input value={lot} onChange={(e) => setLot(e.target.value)} className="h-8 w-20" /><Button size="sm" variant="secondary" onClick={() => update({ lot_size: Number(lot) || 0.01 }, "Lot size saved.")}>Save</Button></div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={a.auto_trading} onCheckedChange={(v) => update({ auto_trading: v }, v ? "Auto trading enabled." : "Auto trading disabled.")} /> Auto-trade platform signals</label>
        <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={remove}><Trash2 /> Remove</Button>
      </div>
    </div>
  );
}
