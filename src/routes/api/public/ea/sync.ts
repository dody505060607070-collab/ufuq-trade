import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-EA-Key",
};

const position = z.object({
  ticket: z.union([z.string(), z.number()]).transform(String),
  symbol: z.string().max(30),
  side: z.enum(["buy", "sell"]),
  volume: z.number().positive(),
  open_price: z.number().nullable().optional(),
  close_price: z.number().nullable().optional(),
  stop_loss: z.number().nullable().optional(),
  take_profit: z.number().nullable().optional(),
  profit: z.number().optional(),
  opened_at: z.string().nullable().optional(),
  closed_at: z.string().nullable().optional(),
});

const body = z.object({
  account: z.object({
    balance: z.number().optional(),
    equity: z.number().optional(),
    free_margin: z.number().optional(),
    leverage: z.number().int().optional(),
    currency: z.string().max(10).optional(),
  }).optional(),
  positions: z.array(position).max(500).optional(),
  closed: z.array(position).max(500).optional(),
  results: z.array(z.object({ id: z.string().uuid(), status: z.enum(["done", "failed"]), result: z.string().max(500).optional() })).max(200).optional(),
  hedge_fired: z.array(z.string().uuid()).max(50).optional(),
});

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: cors });

export const Route = createFileRoute("/api/public/ea/sync")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const key = request.headers.get("x-ea-key") ?? "";
        if (!z.string().uuid().safeParse(key).success) return json({ error: "invalid key" }, 401);
        const parsed = body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "invalid body" }, 400);
        const p = parsed.data;

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { data: acc } = await db.from("trading_accounts").select("id,user_id").eq("ea_key", key).maybeSingle();
        if (!acc) return json({ error: "unknown key" }, 401);
        const now = new Date().toISOString();

        await db.from("trading_accounts").update({ ...(p.account ?? {}), last_seen_at: now }).eq("id", acc.id);

        if (p.positions) {
          const tickets = p.positions.map((x) => x.ticket);
          if (tickets.length)
            await db.from("trades").upsert(p.positions.map((x) => ({ ...x, account_id: acc.id, user_id: acc.user_id, status: "open" })), { onConflict: "account_id,ticket" });
          // Any previously open trade not reported anymore and not in `closed` is left for the closed sync.
        }
        if (p.closed?.length) {
          await db.from("trades").upsert(p.closed.map((x) => ({ ...x, account_id: acc.id, user_id: acc.user_id, status: "closed", closed_at: x.closed_at ?? now })), { onConflict: "account_id,ticket" });
        }
        for (const r of p.results ?? []) {
          await db.from("trade_commands").update({ status: r.status, result: r.result ?? null, executed_at: now }).eq("id", r.id).eq("account_id", acc.id);
        }

        // Hedge plans involving this account
        const { data: plans } = await db.from("hedge_plans").select("*").eq("user_id", acc.user_id).eq("status", "armed");
        const mine = (plans ?? []).filter((h) => h.group_a.includes(acc.id) || h.group_b.includes(acc.id));
        const fireIds = new Set(p.hedge_fired ?? []);
        for (const h of mine) {
          const due = h.trigger_type === "time" ? !!h.trigger_at && new Date(h.trigger_at) <= new Date() : fireIds.has(h.id);
          if (!due) continue;
          const sideB = h.side_a === "buy" ? "sell" : "buy";
          const rows = [...h.group_a.map((id) => ({ id, side: h.side_a })), ...h.group_b.map((id) => ({ id, side: sideB }))].map((g) => ({
            user_id: h.user_id, account_id: g.id, command: "open_trade",
            payload: { symbol: h.symbol, side: g.side, order_type: "market", lot: Number(h.lot_size), count: h.trades_per_account ?? 1, until_no_margin: h.until_no_margin, delay_seconds: 0, hedge_id: h.id },
          }));
          const { data: claimed } = await db.from("hedge_plans").update({ status: "executed" }).eq("id", h.id).eq("status", "armed").select("id");
          if (claimed?.length) await db.from("trade_commands").insert(rows);
        }

        const { data: cmds } = await db.from("trade_commands").select("id,command,payload,created_at").eq("account_id", acc.id).eq("status", "queued").order("created_at").limit(50);
        if (cmds?.length) await db.from("trade_commands").update({ status: "sent" }).in("id", cmds.map((c) => c.id));

        const watch = mine.filter((h) => h.trigger_type === "price").map((h) => ({ id: h.id, symbol: h.symbol, price: h.trigger_price }));
        return json({ commands: cmds ?? [], watch_prices: watch, server_time: now });
      },
    },
  },
});
