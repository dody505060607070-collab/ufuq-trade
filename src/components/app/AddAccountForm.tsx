import { useT, HelpNote, LanguageToggle } from "@/lib/i18n";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Panel } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { defined } from "@/lib/utils";
import { DEFAULT_TRADE_LOT } from "@/lib/lot-settings";

const schema = z.object({
  label: z.string().trim().max(60).optional(),
  login: z.string().trim().min(3).max(30),
  server: z.string().trim().min(2).max(100),
  broker_name: z.string().trim().max(100).optional(),
  lot_size: z.coerce.number().min(0.01).max(100),
});

export function AddAccountForm({ platform }: { platform: "mt5" | "tradelocker" }) {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const brokers = useQuery({ queryKey: ["brokers"], queryFn: async () => (await supabase.from("brokers").select("name").eq("is_active", true)).data ?? [] });

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) return toast.error(t("Check the account number, server and lot size."));
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("trading_accounts").insert(defined({ ...parsed.data, platform, user_id: u.user!.id }));
    setBusy(false);
    if (error) return toast.error(t("Could not add account."));
    toast.success(t("Account added. Copy its EA key from Settings."));
    await qc.invalidateQueries({ queryKey: ["accounts"] });
    void navigate({ to: "/settings" });
  };

  return (
    <Panel>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="label">{t("Nickname")}</Label><Input id="label" name="label" placeholder={t("Main account")} /></div>
        <div className="space-y-2"><Label htmlFor="login">{platform === "mt5" ? t("MT5 login number") : t("TradeLocker account ID")}</Label><Input id="login" name="login" required /></div>
        <div className="space-y-2"><Label htmlFor="server">{t("Server")}</Label><Input id="server" name="server" required placeholder={platform === "mt5" ? "Exness-MT5Real8" : "live.tradelocker.com"} /></div>
        <div className="space-y-2"><Label htmlFor="broker_name">{t("Broker")}</Label>
          <Input id="broker_name" name="broker_name" list="brokers" />
          <datalist id="brokers">{(brokers.data ?? []).map((b) => <option key={b.name} value={b.name} />)}</datalist>
        </div>
        <div className="space-y-2"><Label htmlFor="lot_size">{t("Default lot size")}</Label><Input id="lot_size" name="lot_size" defaultValue={String(DEFAULT_TRADE_LOT)} inputMode="decimal" /></div>
        <div className="sm:col-span-2"><Button type="submit" variant="hero" disabled={busy}>{busy ? t("Adding…") : t("Add account")}</Button></div>
      </form>
    </Panel>
  );
}
