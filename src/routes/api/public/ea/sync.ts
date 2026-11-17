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
  market: z.array(z.object({
    symbol: z.string().max(20),
    broker_symbol: z.string().max(30).optional(),
    bid: z.number().optional(), ask: z.number().optional(), spread: z.number().int().optional(),
    point: z.number().optional(), tick_value: z.number().optional(), contract_size: z.number().optional(), min_lot: z.number().optional(),
    candles: z.record(z.enum(["M5", "M15", "H1", "H4", "D1"]), z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()])).max(300)).optional(),
  })).max(12).optional(),
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
          const { data: prof } = await db.from("profiles").select("username,approval_status").eq("id", cred.user_id).maybeSingle();
          if (!prof?.username || prof.username.toLowerCase() !== username) return fail("username does not match api key", 401);
          if (prof.approval_status !== "approved") return fail("account not approved", 403);
          const login = p.account?.login;
          if (!login || !/^\d{3,20}$/.test(login)) return fail("missing account login", 400);
          acc = (await db.from("trading_accounts").select("id,user_id").eq("user_id", cred.user_id).eq("login", login).maybeSingle()).data;
          if (!acc) {
            const { data: created } = await db.from("trading_accounts").insert({ user_id: cred.user_id, login, platform: "mt5", label: "MT5 Account", server: p.account?.server ?? null, broker_name: p.account?.company?.split(" ")[0] ?? null }).select("id,user_id").single();
            acc = created;
          }
        }
        if (!acc) return fail("unknown key", 401);
        // Access revoked or not yet approved by the owner: no sync, no trading commands.
        const { data: owner } = await db.from("profiles").select("approval_status").eq("id", acc.user_id).maybeSingle();
        if (owner?.approval_status !== "approved") return fail("account not approved", 403);
        const now = new Date().toISOString();

        const { login: _l, company: _c, ...accFields } = p.account ?? {};
        await db.from("trading_accounts").update(defined({ ...accFields, last_seen_at: now })).eq("id", acc.id);

        for (const m of p.market ?? []) {
          const sym = m.symbol.toUpperCase();
          await db.from("broker_quotes").upsert({ account_id: acc.id, user_id: acc.user_id, symbol: sym, broker_symbol: m.broker_symbol ?? null, bid: m.bid ?? null, ask: m.ask ?? null, spread_points: m.spread ?? null, point: m.point ?? null, tick_value: m.tick_value ?? null, contract_size: m.contract_size ?? null, min_lot: m.min_lot ?? null, updated_at: now }, { onConflict: "account_id,symbol" });
          for (const [tf, rows] of Object.entries(m.candles ?? {})) {
            if (rows?.length) await db.from("broker_candles").upsert(rows.map(([t, o, h, l, c, sp]) => ({ account_id: acc.id, user_id: acc.user_id, symbol: sym, timeframe: tf, t, o, h, l, c, spread: Math.round(sp) })), { onConflict: "account_id,symbol,timeframe,t" });
          }
        }

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
          // Quant EA accounts manage their own exits (trailing stops); server profit-lock would cut winners short.
          const { data: eng } = await db.from("trading_accounts").select("engine").eq("id", acc.id).maybeSingle();
          if (eng?.engine !== "quant") await lockProfits(db, acc, p.positions);
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

type Pos = { ticket: string; profit?: number | undefined; symbol: string };
/** Tracks each trade's peak profit and queues close_trade when the user's profit-lock rules fire. */
async function lockProfits(db: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>, acc: { id: string; user_id: string }, positions: Pos[]) {
  if (!positions.length) return;
  const { lockReason } = await import("@/lib/profitlock");
  const { data: s } = await db.from("autopilot_settings").select("*").eq("user_id", acc.user_id).maybeSingle();
  if (!s?.enabled) return;
  const rules = s as unknown as { profit_target_usd?: number; lock_start_usd?: number; giveback_pct?: number };
  const { data: rows } = await db.from("trades").select("*").eq("account_id", acc.id).eq("status", "open");
  const { data: pending } = await db.from("trade_commands").select("payload").eq("account_id", acc.id).eq("command", "close_trade").in("status", ["queued", "sent"]);
  const busy = new Set((pending ?? []).map((c) => String((c.payload as { ticket?: unknown })?.ticket)));
  const { data: recent } = await db.from("analyses").select("symbol,direction,confidence").gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString()).order("created_at", { ascending: false }).limit(20);
  for (const pos of positions) {
    const row = (rows ?? []).find((r) => r.ticket === pos.ticket) as { id: string; side: string; peak_profit?: number | null } | undefined;
    if (!row || pos.profit == null) continue;
    const peak = Math.max(Number(row.peak_profit ?? pos.profit), pos.profit);
    if (peak !== Number(row.peak_profit)) await db.from("trades").update({ peak_profit: peak } as never).eq("id", row.id);
    // Strong trend = newest analysis for this symbol still agrees with the trade at ≥70% confidence.
    const an = (recent ?? []).find((a) => pos.symbol.toUpperCase().startsWith(a.symbol.toUpperCase()));
    const strong = !!an && an.direction === row.side && Number(an.confidence) >= 70;
    const why = lockReason(pos.profit, peak, { profit_target_usd: Number(rules.profit_target_usd ?? 0), lock_start_usd: Number(rules.lock_start_usd ?? 0), giveback_pct: Number(rules.giveback_pct ?? 40) }, strong);
    if (!why || busy.has(pos.ticket)) continue;
    await db.from("trade_commands").insert({ user_id: acc.user_id, account_id: acc.id, command: "close_trade", payload: { ticket: pos.ticket, autopilot: true } });
    await db.from("autopilot_events").insert({ user_id: acc.user_id, symbol: pos.symbol, action: "closed", detail: `#${pos.ticket} — ${why}` });
  }
}
