import { BrandMark } from "@/components/site/Logo";
const logoIcon = "/favicon.png";
import { useT, HelpNote, LanguageToggle } from "@/lib/i18n";
import { Link, useNavigate, useRouter, useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, type ReactNode } from "react";
import {
  LayoutGrid, Landmark, Monitor, SlidersHorizontal, KeyRound, ArrowRightLeft, BarChart3, User, ShieldCheck, LogOut, FileText, ArrowLeft, Bot, Brain, Radar, Layers,
  FlaskConical,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { isOnline, useAccounts, useProfile } from "@/lib/trading";
import { alertUser } from "@/lib/alerts";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { to: "/autopilot", label: "Auto-Pilot", icon: Bot },
  { to: "/brain", label: "AI Brain", icon: Brain },
  { to: "/whales", label: "Whale Radar", icon: Radar },
  { to: "/decisions", label: "Decisions & Backtest", icon: FlaskConical },
  { to: "/platforms", label: "Connected Platforms", icon: Layers },
  { to: "/brokers", label: "Brokers", icon: Landmark },
  { to: "/accounts/add-mt5", label: "Add MT5 Account", icon: Monitor },
  { to: "/settings/preferences", label: "Settings", icon: SlidersHorizontal },
  { to: "/settings", label: "MT5 EA Configuration", icon: KeyRound },
  { to: "/hedge", label: "Hedge", icon: ArrowRightLeft },
  { to: "/performance", label: "Performance", icon: BarChart3 },
  { to: "/settings/profile", label: "Personal Profile", icon: User },
] as const;

export function Tip({ label, children, side = "right" }: { label: string; children: ReactNode; side?: "right" | "top" | "bottom" | "left" }) {
  const t = useT();
  const profile = useProfile();
  if (profile.data && !profile.data.show_tooltips) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{t(label)}</TooltipContent>
    </Tooltip>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const { user, isAdmin } = useAuth();
  const profile = useProfile();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/login", replace: true });
  };

  const p = profile.data;
  const initials = ((p?.first_name?.[0] ?? p?.full_name?.[0] ?? user?.email?.[0] ?? "A") + (p?.last_name?.[0] ?? p?.full_name?.split(" ")[1]?.[0] ?? "")).toUpperCase();
  const railBtn = "flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

  return (
    <TooltipProvider delayDuration={2000}>
      <LiveAlerts />
      <div className="flex min-h-screen">
        <aside className="sticky top-0 z-40 hidden h-screen w-[60px] shrink-0 flex-col items-center border-e border-sidebar-border bg-sidebar py-4 md:flex">
          <Link to="/dashboard" aria-label={t("Ufuq Trade home")} className="mb-6"><img src={logoIcon} alt="Ufuq Trade" className="h-9 w-9 object-contain" /></Link>
          <nav className="flex flex-1 flex-col items-center gap-1">
            {nav.map((n) => {
              const active = pathname === n.to;
              return (
                <Tip key={n.to} label={t(n.label)}>
                  <Link to={n.to} aria-label={t(n.label)} className={cn(railBtn, active && "bg-secondary text-foreground")}>
                    <n.icon className="h-[18px] w-[18px]" />
                  </Link>
                </Tip>
              );
            })}
            {isAdmin && (
              <Tip label={t("Admin panel")}>
                <Link to="/admin/overview" aria-label={t("Admin panel")} className={cn(railBtn, "text-primary-glow", pathname.startsWith("/admin") && "bg-secondary")}>
                  <ShieldCheck className="h-[18px] w-[18px]" />
                </Link>
              </Tip>
            )}
          </nav>
          <div className="flex flex-col items-center gap-2 border-t border-sidebar-border pt-3">
            <Tip label={user?.email ?? t("Personal Profile")}>
              <Link to="/settings/profile" className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground ring-4 ring-primary/25">{initials}</Link>
            </Tip>
            <LanguageToggle className="rounded-full border border-border px-2 py-1 text-xs" />
            <Tip label={t("Sign out")}><button onClick={signOut} aria-label={t("Sign out")} className={railBtn}><LogOut className="h-[18px] w-[18px]" /></button></Tip>
            <Tip label={t("Terms")}><Link to="/terms" aria-label={t("Terms")} className={railBtn}><FileText className="h-[18px] w-[18px]" /></Link></Tip>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-40 flex items-center justify-between border-b border-sidebar-border bg-sidebar/95 px-4 py-2 backdrop-blur md:hidden">
            <Link to="/dashboard" aria-label={t("Ufuq Trade home")} className="flex items-center"><BrandMark className="h-8 w-auto" /></Link>
            <div className="flex items-center gap-2">
              <LanguageToggle className="rounded-full border border-border px-2 py-1 text-xs" />
              {isAdmin && <Link to="/admin/overview" aria-label={t("Admin panel")} className={cn(railBtn, "h-9 w-9 text-primary-glow")}><ShieldCheck className="h-4 w-4" /></Link>}
              <Link to="/settings/profile" className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{initials}</Link>
              <button onClick={signOut} aria-label={t("Sign out")} className={cn(railBtn, "h-9 w-9")}><LogOut className="h-4 w-4" /></button>
            </div>
          </header>
          <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
        </div>
        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-sidebar-border bg-sidebar/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {nav.map((n) => {
            const active = pathname === n.to;
            return (
              <Link key={n.to} to={n.to} className={cn("flex min-w-[68px] flex-1 flex-col items-center gap-1 px-1 py-2 text-[10px] text-muted-foreground", active && "text-primary-glow")}>
                <n.icon className="h-5 w-5" />
                <span className="truncate">{t(n.label)}</span>
              </Link>
            );
          })}
        </nav>
      </div>

    </TooltipProvider>
  );
}


/** Centered page layout with a Back link, like the original app. */
export function Page({ title, subtitle, actions, children, wide }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  const t = useT();
  const router = useRouter();
  return (
    <div className="px-4 py-4 md:px-5">
      <button onClick={() => router.history.back()} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />  {t("Back")}</button>
      <div className={cn("mx-auto mt-10 pb-16", wide ? "max-w-3xl" : "max-w-[608px]")}>
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {actions}
        </div>
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: ReactNode; children: ReactNode; className?: string }) {
  const t = useT();
  return (
    <section className={cn("rounded-3xl bg-card p-6", className)}>
      {title && <h2 className="mb-5 text-[15px] font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const t = useT();
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  const t = useT();
  return (
    <section className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      {title && <h2 className="mb-4 text-sm font-medium text-muted-foreground">{title}</h2>}
      {children}
    </section>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  const t = useT();
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

/** Watches trades, commands, EA connection and signals; speaks / notifies on changes. */
function LiveAlerts() {
  const t = useT();
  const accounts = useAccounts();
  const profile = useProfile();
  const trades = useQuery({
    queryKey: ["open-trades"],
    queryFn: async () => (await supabase.from("trades").select("*").eq("status", "open").order("opened_at", { ascending: false })).data ?? [],
    refetchInterval: 5_000,
  });
  const commands = useQuery({
    queryKey: ["commands"],
    queryFn: async () => (await supabase.from("trade_commands").select("*").order("created_at", { ascending: false }).limit(20)).data ?? [],
    refetchInterval: 5_000,
  });
  const signals = useQuery({
    queryKey: ["signals"],
    queryFn: async () => (await supabase.from("signals").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(10)).data ?? [],
    refetchInterval: 30_000,
  });

  const prev = useRef<{ trades?: Map<string, { sl: number | null; tp: number | null; symbol: string }>; cmds?: Map<string, string>; online?: Map<string, boolean>; signals?: Set<string> }>({});

  useEffect(() => {
    if (!trades.data) return;
    const now = new Map(trades.data.map((t) => [t.id, { sl: t.stop_loss, tp: t.take_profit, symbol: t.symbol }]));
    const old = prev.current.trades;
    if (old) {
      for (const [id, trade] of now) if (!old.has(id)) alertUser(t("Trade opened"), t("Trade opened on {symbol}", { symbol: trade.symbol }), "info");
      const closed = [...old.keys()].filter((id) => !now.has(id));
      if (closed.length) void supabase.from("trades").select("id,symbol,profit").in("id", closed).then(({ data }) => {
        for (const c of data ?? []) {
          const p = Number(c.profit ?? 0);
          alertUser(p >= 0 ? t("Profit") : t("Loss"), `${t("Trade closed on {symbol}", { symbol: c.symbol })}: ${p >= 0 ? "+" : ""}${p.toFixed(2)}`, p >= 0 ? "win" : "risk");
        }
      });
      for (const [id, trade] of now) {
        const o = old.get(id);
        if (o && (o.sl !== trade.sl || o.tp !== trade.tp)) alertUser(t("Trade updated"), `${trade.symbol} SL/TP`, "info");
      }
    }
    prev.current.trades = now;
  }, [trades.data]);

  useEffect(() => {
    if (!commands.data) return;
    const now = new Map(commands.data.map((c) => [c.id, c.status]));
    const old = prev.current.cmds;
    if (old) for (const c of commands.data) if (old.get(c.id) && old.get(c.id) !== c.status && c.status === "failed") alertUser(t("Warning"), `Command failed: ${c.command.replace(/_/g, " ")}`, "risk");
    prev.current.cmds = now;
  }, [commands.data]);

  useEffect(() => {
    if (!accounts.data) return;
    const now = new Map(accounts.data.map((a) => [a.id, isOnline(a)]));
    const old = prev.current.online;
    if (old) for (const a of accounts.data) if (old.has(a.id) && old.get(a.id) !== now.get(a.id))
      alertUser(t("Connection"), now.get(a.id) ? `Account ${a.login} connected` : `Account ${a.login} disconnected`, now.get(a.id) ? "info" : "risk");
    prev.current.online = now;
  }, [accounts.data]);

  useEffect(() => {
    if (!signals.data) return;
    const now = new Set(signals.data.map((s) => s.id));
    const old = prev.current.signals;
    if (old) for (const s of signals.data) if (!old.has(s.id))
      alertUser(t("New Ufuq Trade signal"), `${s.direction.toUpperCase()} ${s.symbol}${s.entry ? ` @ ${s.entry}` : ""}`, "win");
    prev.current.signals = now;
  }, [signals.data]);

  return null;
}
