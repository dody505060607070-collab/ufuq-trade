import { useT, HelpNote, LanguageToggle } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Check, Monitor, Unplug, Wifi, WifiOff } from "lucide-react";
import { Page } from "@/components/app/AppShell";
import { BrokerLogo } from "@/components/app/InstrumentIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { isOnline, useAccounts, useBrokers } from "@/lib/trading";
import { cn, defined } from "@/lib/utils";
import { DEFAULT_TRADE_LOT } from "@/lib/lot-settings";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/accounts/add-mt5")({
  head: () => seo("Add MT5 Account", "Connect a MetaTrader 5 trading account from a supported broker."),
  component: AddMt5,
});

const schema = z.object({
  login: z.string().trim().regex(/^\d{3,20}$/, "Account number must be digits only."),
  server: z.string().trim().min(2, "Enter the MT5 server name.").max(100),
  label: z.string().trim().max(60).optional(),
  lot_size: z.coerce.number().min(0.01, "Lot must be at least 0.01.").max(100),
});

function AddMt5() {
  const t = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const brokers = useBrokers();
  const accounts = useAccounts();
  const [broker, setBroker] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const chosen = brokers.data?.find((b) => b.name === broker) ?? brokers.data?.[0];

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const r = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!r.success) return toast.error(r.error.issues[0]!.message);
    if (accounts.data?.some((a) => a.login === r.data.login)) return toast.error(t("This account is already connected."));
    setBusy(true);
    const { error } = await supabase.from("trading_accounts").insert(defined({ ...r.data, label: r.data.label || "MT5 Account", platform: "mt5", broker_name: chosen?.name, user_id: user!.id }));
    setBusy(false);
    if (error) return toast.error(t("Could not add the account."));
    toast.success(t("Account added. Now attach the EA in MT5 to connect it."));
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ["accounts"] });
  };

  const disconnect = async (id: string) => {
    if (!window.confirm(t("Disconnect this account? Its trade history on Arrissa will be deleted."))) return;
    const { error } = await supabase.from("trading_accounts").delete().eq("id", id);
    if (error) return toast.error(t("Could not disconnect."));
    toast.success(t("Account disconnected."));
    void qc.invalidateQueries({ queryKey: ["accounts"] });
  };

  const mt5 = (accounts.data ?? []).filter((a) => a.platform === "mt5");
  return (
    <Page title={t("Add MT5 Account")} subtitle={t("Connect a MetaTrader 5 trading account from a supported broker.")}>
      <HelpNote>{"Choose a supported broker and enter your MT5 account number, server, and default lot size. Attach the EA inside MT5 to connect the account and enable trading."}</HelpNote>
      <div>
        <p className="mb-3 text-sm font-semibold tracking-widest text-muted-foreground">{t("SELECT YOUR BROKER")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {(brokers.data ?? []).map((b) => (
            <button key={b.id} onClick={() => setBroker(b.name)} className={cn("rounded-3xl border-2 bg-card p-5 text-start transition-colors", chosen?.id === b.id ? "border-primary" : "border-transparent")}>
              <span className="flex items-center gap-3"><BrokerLogo name={b.name} color={b.brand_color} className="h-14 w-14" /><span className="font-semibold">{b.name}</span></span>
              <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
                {b.features.map((f) => <li key={f} className="flex items-center gap-2"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-success/20 text-success"><Check className="h-2.5 w-2.5" /></span>{f}</li>)}
              </ul>
            </button>
          ))}
        </div>
      </div>
      <Button variant="hero" className="h-12 w-full rounded-full text-base" onClick={() => setOpen(true)} disabled={!chosen}>{t("Configure MT5 account connection")}</Button>
      <p className="text-center text-xs text-muted-foreground">{t("Tip: attaching the Arrissa EA in MT5 also adds the account automatically.")} <Link to="/settings" className="text-primary-glow underline">{t("EA setup")}</Link> · <Link to="/accounts/add-tradelocker" className="underline">{t("TradeLocker")}</Link></p>

      <div>
        <p className="mb-3 text-sm font-semibold tracking-widest text-muted-foreground">{t("CONNECTED MT5 ACCOUNTS")}</p>
        {mt5.length === 0 ? <p className="text-sm text-muted-foreground">{t("No MT5 accounts connected yet.")}</p> : (
          <div className="grid gap-4 sm:grid-cols-2">
            {mt5.map((a) => {
              const b = brokers.data?.find((x) => x.name.toLowerCase() === (a.broker_name ?? "").toLowerCase());
              return (
                <div key={a.id} className="rounded-3xl bg-card p-5">
                  <div className="flex items-center gap-3">
                    <BrokerLogo name={a.broker_name} color={b?.brand_color} />
                    <div><p className="text-sm font-semibold uppercase tracking-wider">{a.broker_name ?? "MT5"}</p><p className="text-sm text-muted-foreground">{t("Account #")}{a.login}</p></div>
                  </div>
                  <p className="mt-3 text-lg font-bold">{a.label || "MT5 Account"}</p>
                  <p className="text-xs text-muted-foreground">{user?.email} · {new Date(a.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs"><Monitor className="h-3 w-3" />  {t("MT5 Terminal")}</span>
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs", isOnline(a) ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground")}>{isOnline(a) ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{isOnline(a) ? t("EA connected") : t("EA offline")}</span>
                  </div>
                  <button onClick={() => disconnect(a.id)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-destructive/10 py-2 text-sm font-semibold text-destructive hover:bg-destructive/20"><Unplug className="h-4 w-4" />  {t("Disconnect")}</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader><DialogTitle className="text-center">{t("Connect")} {chosen?.name}  {t("MT5 account")}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="login">{t("MT5 account number")}</Label><Input id="login" name="login" inputMode="numeric" required className="rounded-full" /></div>
            <div className="space-y-2"><Label htmlFor="server">{t("Server")}</Label><Input id="server" name="server" required placeholder={chosen?.name === "FxPro" ? "FxPro-MT5 Live01" : "Exness-MT5Real8"} className="rounded-full" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="label">{t("Nickname")}</Label><Input id="label" name="label" placeholder={t("MT5 Account")} className="rounded-full" /></div>
              <div className="space-y-2"><Label htmlFor="lot_size">{t("Default lot")}</Label><Input id="lot_size" name="lot_size" defaultValue={String(DEFAULT_TRADE_LOT)} inputMode="decimal" className="rounded-full" /></div>
            </div>
            <p className="text-xs text-muted-foreground">{t("Your MT5 password is never needed. Trades run through the Arrissa EA inside your own MT5.")}</p>
            <Button type="submit" variant="hero" className="h-11 w-full rounded-full" disabled={busy}>{busy ? t("Adding…") : t("Add account")}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
