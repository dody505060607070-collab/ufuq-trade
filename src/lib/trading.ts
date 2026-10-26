import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";

export type Account = Database["public"]["Tables"]["trading_accounts"]["Row"];
export type Instrument = Database["public"]["Tables"]["instruments"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Broker = Database["public"]["Tables"]["brokers"]["Row"];
export type Json = Database["public"]["Tables"]["trade_commands"]["Insert"]["payload"];

export const COMMANDS = {
  open_trade: "Open trade",
  close_all: "Close all trades",
  close_trade: "Close trade",
  break_even: "Break even",
  delete_sl: "Delete SL",
  clear_pending: "Cancel pending orders",
  set_sl_tp: "Set SL/TP",
  trailing_profit: "Trailing profit",
  cap_loss: "Cap loss",
} as const;
export type CommandName = keyof typeof COMMANDS;

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("trading_accounts").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
    refetchInterval: 10_000,
    // New object every poll so "connected/disconnected" is re-evaluated even when the row didn't change.
    structuralSharing: false,
  });
}

export function useInstruments() {
  return useQuery({
    queryKey: ["instruments"],
    staleTime: 10 * 60_000,
    queryFn: async () => (await supabase.from("instruments").select("*").eq("is_active", true).order("sort_order")).data ?? [],
  });
}

export function useBrokers() {
  return useQuery({
    queryKey: ["brokers"],
    staleTime: 10 * 60_000,
    queryFn: async () => (await supabase.from("brokers").select("*").eq("is_active", true).order("sort_order")).data ?? [],
  });
}

export function useProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle()).data,
  });
  const update = async (patch: Database["public"]["Tables"]["profiles"]["Update"], ok?: string) => {
    if (!user) return false;
    qc.setQueryData(["profile", user.id], (p: Profile | null | undefined) => (p ? { ...p, ...patch } : p));
    const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
    if (error) {
      toast.error(error.code === "23505" ? "That username is already taken." : "Could not save.");
      void qc.invalidateQueries({ queryKey: ["profile", user.id] });
      return false;
    }
    if (ok) toast.success(ok);
    return true;
  };
  return { ...q, update };
}

/** The EA syncs every ~2s, so 30s of silence means MT5 is closed or offline. */
export const ONLINE_WINDOW_MS = 30_000;
export function isOnline(a: Pick<Account, "last_seen_at">, now = Date.now()) {
  return !!a.last_seen_at && now - new Date(a.last_seen_at).getTime() < ONLINE_WINDOW_MS;
}

export async function queueCommand(accounts: Account[], command: CommandName, payload: Json = {}) {
  if (!accounts.length) {
    toast.error("Select at least one account.");
    return false;
  }
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return false;
  const { error } = await supabase.from("trade_commands").insert(
    accounts.map((a) => ({ user_id: u.user!.id, account_id: a.id, command, payload })),
  );
  if (error) {
    toast.error(`${COMMANDS[command]} failed.`);
    return false;
  }
  const offline = accounts.filter((a) => !isOnline(a)).length;
  toast.success(`${COMMANDS[command]} sent to ${accounts.length} account(s).`, {
    description: offline ? `${offline} account(s) EA offline — will run when the EA reconnects.` : undefined,
  });
  return true;
}

export const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

export const priceDigits = (p: number | null | undefined) => (p == null ? 2 : p < 5 ? 5 : p < 500 ? 3 : 2);

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Validation for trade inputs, shared by the dashboard. Returns an error message or null. */
export function validateOrder(o: { side: "buy" | "sell"; orderType: string; lot: number; count: number; interval: number; sl: number | null; tp: number | null; price: number | null; ref: number | null }) {
  if (!(o.lot >= 0.01 && o.lot <= 100)) return "Lot size must be between 0.01 and 100.";
  if (!Number.isInteger(o.count) || o.count < 1 || o.count > 50) return "Trades must be a whole number from 1 to 50.";
  if (!(o.interval >= 0 && o.interval <= 3600)) return "Interval must be 0 to 3600 seconds.";
  if (o.orderType !== "market" && !(o.price && o.price > 0)) return "Enter the order price.";
  const ref = o.orderType === "market" ? o.ref : o.price;
  if (ref) {
    if (o.sl != null && (o.side === "buy" ? o.sl >= ref : o.sl <= ref)) return o.side === "buy" ? "Stop loss must be below the price for a BUY." : "Stop loss must be above the price for a SELL.";
    if (o.tp != null && (o.side === "buy" ? o.tp <= ref : o.tp >= ref)) return o.side === "buy" ? "Take profit must be above the price for a BUY." : "Take profit must be below the price for a SELL.";
  }
  return null;
}
