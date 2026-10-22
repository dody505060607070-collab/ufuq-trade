import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { defined } from "@/lib/utils";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-EA-Key, X-API-Key, X-Username",
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
    login: z.union([z.string(), z.number()]).transform(String).optional(),
    server: z.string().max(100).optional(),
    company: z.string().max(100).optional(),
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
        const asText = new URL(request.url).searchParams.get("format") === "text";
        const fail = (msg: string, status: number) => (asText ? new Response(`ERR|${msg}\n`, { status, headers: { ...cors, "Content-Type": "text/plain" } }) : json({ error: msg }, status));
        const key = request.headers.get("x-ea-key") ?? "";
        const apiKey = request.headers.get("x-api-key") ?? "";
        const username = (request.headers.get("x-username") ?? "").trim().toLowerCase();
        const uuid = z.string().uuid();
        if (!uuid.safeParse(key).success && !uuid.safeParse(apiKey).success) return fail("invalid key", 401);
        const parsed = body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return fail("invalid body", 400);
        const p = parsed.data;

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        let acc: { id: string; user_id: string } | null = null;
        if (uuid.safeParse(key).success) {
          acc = (await db.from("trading_accounts").select("id,user_id").eq("ea_key", key).maybeSingle()).data;
        } else {
          // Username + API key flow: the EA identifies the MT5 account by its login and is auto-registered.
          const { data: cred } = await db.from("ea_credentials").select("user_id").eq("api_key", apiKey).maybeSingle();
          if (!cred) return fail("unknown api key", 401);
          const { data: prof } = await db.from("profiles").select("username").eq("id", cred.user_id).maybeSingle();
          if (!prof?.username || prof.username.toLowerCase() !== username) return fail("username does not match api key", 401);
          const login = p.account?.login;
          if (!login || !/^\d{3,20}$/.test(login)) return fail("missing account login", 400);
          acc = (await db.from("trading_accounts").select("id,user_id").eq("user_id", cred.user_id).eq("login", login).maybeSingle()).data;
          if (!acc) {
            const { data: created } = await db.from("trading_accounts").insert({ user_id: cred.user_id, login, platform: "mt5", label: "MT5 Account", server: p.account?.server ?? null, broker_name: p.account?.company?.split(" ")[0] ?? null }).select("id,user_id").single();
            acc = created;
          }
        }
        if (!acc) return fail("unknown key", 401);
        const now = new Date().toISOString();

        const { login: _l, company: _c, ...accFields } = p.account ?? {};
        await db.from("trading_accounts").update(defined({ ...accFields, last_seen_at: now })).eq("id", acc.id);

        if (p.positions) {
          const tickets = p.positions.map((x) => x.ticket);
          if (tickets.length)
            await db.from("trades").upsert(p.positions.map((x) => defined({ ...x, account_id: acc.id, user_id: acc.user_id, status: "open" })), { onConflict: "account_id,ticket" });
        }
        if (p.closed?.length) {
          await db.from("trades").upsert(p.closed.map((x) => defined({ ...x, account_id: acc.id, user_id: acc.user_id, status: "closed", closed_at: x.closed_at ?? now })), { onConflict: "account_id,ticket" });
        }
        if (p.positions) {
          // Positions no longer reported by the terminal are closed.
          const live = new Set(p.positions.map((x) => x.ticket));
          const { data: openRows } = await db.from("trades").select("id,ticket").eq("account_id", acc.id).eq("status", "open");
          const stale = (openRows ?? []).filter((r) => !live.has(r.ticket)).map((r) => r.id);
          if (stale.length) await db.from("trades").update({ status: "closed", closed_at: now }).in("id", stale);
          await lockProfits(db, acc, p.positions);
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
        if (asText) {
          const v = (x: unknown) => (x == null ? "" : String(x).replace(/[|\n\r]/g, " "));
          const lines = [`OK|${now}`];
          for (const c of cmds ?? []) {
            const pl = (c.payload ?? {}) as { symbol?: unknown; side?: unknown; order_type?: unknown; lot?: unknown; sl?: unknown; tp?: unknown; price?: unknown; count?: unknown; delay_seconds?: unknown; threshold?: unknown; ticket?: unknown; until_no_margin?: unknown };
            lines.push(["C", c.id, c.command, v(pl.symbol), v(pl.side), v(pl.order_type ?? "market"), v(pl.lot), v(pl.sl), v(pl.tp), v(pl.price), v(pl.count ?? 1), v(pl.delay_seconds ?? 0), v(pl.threshold), v(pl.ticket), pl.until_no_margin ? "1" : "0"].join("|"));
          }
          for (const w of watch) lines.push(["W", w.id, v(w.symbol), v(w.price)].join("|"));
          return new Response(lines.join("\n") + "\n", { headers: { ...cors, "Content-Type": "text/plain" } });
        }
        return json({ commands: cmds ?? [], watch_prices: watch, server_time: now });
      },
    },
  },
});
