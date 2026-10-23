import { createFileRoute, Link } from "@tanstack/react-router";
import { Monitor, Lock, Bitcoin } from "lucide-react";
import { Page } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { fmt, isOnline, useAccounts } from "@/lib/trading";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/platforms")({
  head: () => ({ meta: [{ title: "Connected Platforms | Arrissa AI" }, { name: "description", content: "One AI brain for MT5, TradeLocker and crypto platforms." }, { property: "og:title", content: "Connected Platforms | Arrissa AI" }, { property: "og:description", content: "One AI brain for MT5, TradeLocker and crypto platforms." }] }),
  component: Platforms,
});

function Platforms() {
  const t = useT();
  const accounts = useAccounts();
  const mt5 = (accounts.data ?? []).filter((a) => a.platform === "mt5");
  const online = mt5.filter((a) => isOnline(a));
  return (
    <Page title={t("Connected Platforms")} subtitle={t("One AI brain and the same safety rules on every platform.")}>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-primary/50 bg-card/60 p-5">
          <div className="flex items-center gap-3"><Monitor className="h-6 w-6 text-primary" /><p className="flex-1 font-semibold">MetaTrader 5</p>
            <span className={cn("rounded-full px-2 py-0.5 text-xs", online.length ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{online.length ? t("Connected") : t("Not connected")}</span></div>
          <p className="mt-4 text-sm text-muted-foreground">{mt5.length} {t("accounts")} · {online.length} {t("online")}</p>
          <p className="mt-1 text-lg font-bold">{fmt(mt5.reduce((s, a) => s + Number(a.balance ?? 0), 0))}</p>
          <Button asChild size="sm" variant="secondary" className="mt-4 rounded-full"><Link to="/autopilot">{t("Auto-Pilot")}</Link></Button>
        </div>
        {[{ n: "TradeLocker", i: Lock, d: "Needs your TradeLocker API details to connect." }, { n: "Hyperliquid", i: Bitcoin, d: "Crypto 24/7. Starts on the free test network first." }].map((p) => (
          <div key={p.n} className="rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="flex items-center gap-3"><p.i className="h-6 w-6 text-muted-foreground" /><p className="flex-1 font-semibold">{p.n}</p><span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t("Coming soon")}</span></div>
            <p className="mt-4 text-sm text-muted-foreground">{t(p.d)}</p>
          </div>
        ))}
      </div>
    </Page>
  );
}
