import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Account = Database["public"]["Tables"]["trading_accounts"]["Row"];
export type Json = Database["public"]["Tables"]["trade_commands"]["Insert"]["payload"];

export const COMMANDS = {
  open_trade: "Open trade",
  close_all: "Close all trades",
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
  });
}

export function isOnline(a: Pick<Account, "last_seen_at">) {
  return !!a.last_seen_at && Date.now() - new Date(a.last_seen_at).getTime() < 2 * 60_000;
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
  toast.success(`${COMMANDS[command]} queued for ${accounts.length} account(s).`, {
    description: offline ? `${offline} account(s) EA offline — will run when the EA reconnects.` : undefined,
  });
  return true;
}

export const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
