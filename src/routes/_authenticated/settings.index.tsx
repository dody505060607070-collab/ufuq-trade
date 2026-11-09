import { useT, HelpNote, LanguageToggle, Tx } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Copy, Download, AlertTriangle, Wifi, WifiOff, Trash2 } from "lucide-react";
import { Page, Card } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fmt, isOnline, useAccounts, useProfile, type Account } from "@/lib/trading";

export const Route = createFileRoute("/_authenticated/settings/")({
  head: () => ({ meta: [{ title: "MT5 EA Configuration | Ufuq Trade" }, { name: "description", content: "Connect the Ufuq Trade Expert Advisor to your MT5 account." }] }),
  component: EaConfig,
});

function EaConfig() {
  const t = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const profile = useProfile();
  const accounts = useAccounts();
  const ea = useQuery({ queryKey: ["ea-latest"], queryFn: async () => (await supabase.from("ea_releases").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle()).data });
  const creds = useQuery({ queryKey: ["ea-creds", user?.id], enabled: !!user, queryFn: async () => (await supabase.from("ea_credentials").select("api_key").eq("user_id", user!.id).maybeSingle()).data });
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const apiUrl = `${origin}/api/public/ea`;

  const refresh = async () => {
    if (!window.confirm(t("Refresh your API key? Every EA using the current key must be reconfigured."))) return;
    const { error } = await supabase.from("ea_credentials").update({ api_key: crypto.randomUUID(), updated_at: new Date().toISOString() }).eq("user_id", user!.id);
    if (error) return toast.error(t("Could not refresh the key."));
    toast.success(t("New API key generated."));
    void qc.invalidateQueries({ queryKey: ["ea-creds"] });
  };

  const fileUrl = ea.data?.file_url || "/ea/ArrissaEA.mq5?v=1.32";
  const isSource = !ea.data?.file_url;

  return (
    <Page title={t("MT5 EA Configuration")} subtitle={t("Use these credentials to connect your Ufuq Trade EA to this account.")}>
      <HelpNote>{"The EA is a small program running inside MetaTrader 5 that connects this site to your broker account and executes trades. Download it, put it in MQL5/Experts, Compile it in MetaEditor, allow WebRequest, then attach it to a chart with your username and API key."}</HelpNote>
      <Button asChild variant="outline"><Link to="/settings/assistants"><Tx>Assistant access</Tx></Link></Button>
      <Card title={t("Download EA")}>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary-glow"><Download className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t("Ufuq Trade EA")} <span className="ms-1 rounded-md bg-primary/20 px-1.5 py-0.5 text-xs text-primary-glow">{t("v")}{ea.data?.version ?? "1.50"}</span></p>
            <p className="text-sm text-muted-foreground">{t("MetaTrader 5 Expert Advisor — connect your MT5 account to the Ufuq Trade platform.")}</p>
          </div>
          <Button asChild variant="hero" className="h-11 rounded-full px-6"><a href={fileUrl} download>{isSource ? t("Download .mq5") : t("Download .ex5")}</a></Button>
        </div>
        {isSource && <p className="mt-4 text-xs text-muted-foreground">{t("This is the EA source file. Open it in MetaEditor (installed with MT5) and press Compile once — MT5 creates the .ex5 automatically.")}</p>}
      </Card>

      <Card title={t("Your Credentials")}>
        <CopyRow label={t("USERNAME")} value={profile.data?.username ?? "…"} />
        <CopyRow label={t("API KEY")} value={creds.data?.api_key ?? "…"} mono />
        <p className="mt-4 flex gap-2 text-sm text-muted-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />  {t("Refreshing your API key will invalidate the current one. All EAs using it must be reconfigured.")}</p>
        <Button variant="destructive" className="mt-4 h-11 w-full rounded-full" onClick={refresh}>{t("Refresh API Key")}</Button>
      </Card>

      <Card title={t("MT5 Web Request Setup")}>
        <p className="text-sm text-muted-foreground">{t("For the EA to communicate with Ufuq Trade, MetaTrader 5 must be allowed to make web requests to the API URL below. Do this once per MT5 installation.")}</p>
        <div className="mt-4"><CopyRow label={t("API URL")} value={apiUrl} mono /></div>
        <ol className="mt-4 space-y-2 px-5 text-sm text-muted-foreground">
          <li>{t("Open")} <b className="text-foreground">{t("MetaTrader 5")}</b>  {t("and go to")} <b className="text-foreground">{t("Tools → Options")}</b>.</li>
          <li>{t("Click the")} <b className="text-foreground">{t("Expert Advisors")}</b>  {t("tab.")}</li>
          <li>{t("Check")} <b className="text-foreground">{t("\"Allow WebRequest for listed URL\"")}</b>.</li>
          <li>{t("Click the")} <b className="text-foreground">+</b>  {t("button, paste the URL above, and press")} <b className="text-foreground">{t("OK")}</b>.</li>
        </ol>
      </Card>

      <Card title={t("Getting Started")}>
        <ol className="list-decimal space-y-2 ps-5 text-sm text-muted-foreground">
          <li>{t("Download the EA above and place it in MT5:")} <b className="text-foreground">{t("File → Open Data Folder → MQL5 → Experts")}</b>.</li>
          <li>{t("In MT5 open")} <b className="text-foreground">{t("Navigator")}</b>{t(", end-click Expert Advisors → Refresh (compile it in MetaEditor if it's the .mq5 file).")}</li>
          <li>{t("Drag")} <b className="text-foreground">{t("ArrissaEA")}</b>  {t("onto any chart. In the Inputs tab paste your")} <b className="text-foreground">{t("Username")}</b>, <b className="text-foreground">{t("API Key")}</b>  {t("and the")} <b className="text-foreground">{t("API URL")}</b>.</li>
          <li>{t("Turn on the")} <b className="text-foreground">{t("Algo Trading")}</b>  {t("button in the MT5 toolbar. Your account appears below within seconds.")}</li>
          <li>{t("Keep MT5 running (on your PC or a VPS) so the EA can execute your commands.")}</li>
        </ol>
      </Card>

      <Card title={t("Connected accounts")}>
        {(accounts.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("No accounts yet. Attach the EA in MT5 and the account is added automatically, or")} <Link to="/accounts/add-mt5" className="text-primary-glow underline">{t("add it manually")}</Link>.</p>
        ) : <div className="space-y-3">{accounts.data!.map((a) => <AccountRow key={a.id} a={a} />)}</div>}
      </Card>
    </Page>
  );
}

function CopyRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-widest text-muted-foreground">{t(label)}</p>
        <p className={mono ? "mt-1 break-all font-mono text-sm" : "mt-1 font-semibold"}>{value}</p>
      </div>
      <button aria-label={`Copy ${label}`} onClick={() => { void navigator.clipboard.writeText(String(value)); toast.success(`${label.toLowerCase()} copied.`); }} className="text-muted-foreground hover:text-foreground"><Copy className="h-4 w-4" /></button>
    </div>
  );
}

function AccountRow({ a }: { a: Account }) {
  const t = useT();
  const qc = useQueryClient();
  const [lot, setLot] = useState(String(a.lot_size));
  const update = async (patch: Partial<Account>, msg: string) => {
    const { error } = await supabase.from("trading_accounts").update(patch).eq("id", a.id);
    if (error) return toast.error(t("Update failed."));
    toast.success(msg);
    void qc.invalidateQueries({ queryKey: ["accounts"] });
  };
  const remove = async () => {
    if (!window.confirm(t("Disconnect this account? Its trade history will be deleted."))) return;
    await supabase.from("trading_accounts").delete().eq("id", a.id);
    void qc.invalidateQueries({ queryKey: ["accounts"] });
  };
  return (
    <div className="rounded-2xl bg-background/60 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{a.label || a.login} <span className="text-xs text-muted-foreground">#{a.login} · {a.server ?? "—"}</span></p>
          <p className="text-xs text-muted-foreground">{t("Balance")} {fmt(a.balance)}  {t("· Equity")} {fmt(a.equity)} · {a.last_seen_at ? `Last seen ${new Date(a.last_seen_at).toLocaleString()}` : t("EA never connected")}</p>
        </div>
        <span className={`flex items-center gap-1 text-xs ${isOnline(a) ? "text-success" : "text-muted-foreground"}`}>{isOnline(a) ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{isOnline(a) ? t("EA connected") : t("EA not connected")}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2"><span className="text-muted-foreground">{t("Default lot")}</span><Input value={lot} onChange={(e) => setLot(e.target.value)} className="h-8 w-20 rounded-full" /><Button size="sm" variant="secondary" className="rounded-full" onClick={() => { const v = Number(lot); if (!(v >= 0.01 && v <= 100)) return toast.error(t("Lot must be 0.01–100.")); void update({ lot_size: v }, t("Lot size saved.")); }}>{t("Save")}</Button></div>
        <label className="flex items-center gap-2"><Switch checked={a.auto_trading} onCheckedChange={(v) => update({ auto_trading: v }, v ? t("Auto trading enabled.") : t("Auto trading disabled."))} />  {t("Auto-trade platform signals")}</label>
        <div className="flex items-center gap-1 rounded-full bg-muted/40 p-1" role="group" aria-label={t("AI for this account")}>
          <span className="px-2 text-xs text-muted-foreground">{t("AI for this account")}</span>
          {(["gemini", "openai", "mixed"] as const).map((p) => (
            <Button key={p} size="sm" variant={a.ai_provider === p ? "default" : "ghost"} className="h-7 rounded-full" onClick={() => a.ai_provider !== p && update({ ai_provider: p }, t("AI saved for this account."))}>{p === "openai" ? "ChatGPT" : p === "mixed" ? t("Gemini + ChatGPT (take turns)") : "Gemini"}</Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" className="ms-auto text-destructive" onClick={remove}><Trash2 />  {t("Disconnect")}</Button>
      </div>
    </div>
  );
}
