import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { defined } from "@/lib/utils";
import { fallbackDealId, summarizeDeals } from "@/lib/deals";
import { canApplyResult, mapEaStatus, snapshotUsable } from "@/lib/execution";
import { MIN_RR } from "@/lib/signal-guard";

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
  deal: z.union([z.string(), z.number()]).transform(String).optional(),
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
  results: z.array(z.object({ id: z.string().uuid(), status: z.enum(["done", "failed", "partial", "unknown", "expired"]), result: z.string().max(500).optional(), filled: z.number().int().min(0).max(200).optional() })).max(200).optional(),
  // EA 1.40+: identity, protocol and snapshot metadata. Older EAs omit it and keep the legacy behaviour.
  meta: z.object({
    ea_version: z.string().max(20).optional(), protocol: z.number().int().optional(), capabilities: z.array(z.string().max(30)).max(30).optional(),
    executor: z.string().max(64).optional(), snapshot_at: z.number().optional(), positions_ok: z.boolean().optional(), margin_mode: z.enum(["hedging", "netting", "exchange"]).optional(),
  }).optional(),
  hedge_fired: z.array(z.string().uuid()).max(50).optional(),
  market: z.array(z.object({
    symbol: z.string().max(20),
    broker_symbol: z.string().max(30).optional(),
    bid: z.number().optional(), ask: z.number().optional(), spread: z.number().int().optional(),
    point: z.number().optional(), tick_value: z.number().optional(), contract_size: z.number().optional(), min_lot: z.number().optional(), max_lot: z.number().optional(), lot_step: z.number().optional(), quote_time: z.number().optional(),
    candles: z.record(z.enum(["M5", "M15", "H1", "H4", "D1"]), z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()])).max(300)).optional(),
  })).max(5).optional(),
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
        const meta = p.meta;
        const { data: prevAcc } = await db.from("trading_accounts").select("last_snapshot_at").eq("id", acc.id).maybeSingle();
        const snap = snapshotUsable({ positionsOk: meta?.positions_ok, snapshotAt: meta?.snapshot_at ?? null, lastSnapshotAt: prevAcc?.last_snapshot_at ? new Date(prevAcc.last_snapshot_at).getTime() : null });
        const { error: accErr } = await db.from("trading_accounts").update(defined({
          ...accFields, last_seen_at: now,
          ea_version: meta?.ea_version, protocol_version: meta?.protocol ?? (meta ? undefined : 1), capabilities: meta?.capabilities, margin_mode: meta?.margin_mode,
          last_snapshot_at: snap.use && meta?.snapshot_at ? new Date(meta.snapshot_at).toISOString() : undefined,
        })).eq("id", acc.id);
        if (accErr) return fail("could not save account state", 500);

        for (const m of p.market ?? []) {
          const sym = m.symbol.toUpperCase();
          await db.from("broker_quotes").upsert({ account_id: acc.id, user_id: acc.user_id, symbol: sym, broker_symbol: m.broker_symbol ?? null, bid: m.bid ?? null, ask: m.ask ?? null, spread_points: m.spread ?? null, point: m.point ?? null, tick_value: m.tick_value ?? null, contract_size: m.contract_size ?? null, min_lot: m.min_lot ?? null, max_lot: m.max_lot ?? null, lot_step: m.lot_step ?? null, quote_time: m.quote_time ? new Date(m.quote_time).toISOString() : null, updated_at: now }, { onConflict: "account_id,symbol" });
          for (const [tf, rows] of Object.entries(m.candles ?? {})) {
            if (rows?.length) await db.from("broker_candles").upsert(rows.map(([t, o, h, l, c, sp]) => ({ account_id: acc.id, user_id: acc.user_id, symbol: sym, timeframe: tf, t, o, h, l, c, spread: Math.round(sp) })), { onConflict: "account_id,symbol,timeframe,t" });
          }
        }

        // Exit deals (executions) are stored once per broker deal ticket; a partial close never closes the position.
        const affected = new Set<string>();
        const dealSide = new Map<string, { symbol: string; side: string }>();
        if (p.closed?.length) {
          const rows = p.closed.map((x) => ({ account_id: acc.id, user_id: acc.user_id, deal_ticket: x.deal ?? fallbackDealId(x.ticket, x.closed_at, x.volume, x.close_price), position_ticket: x.ticket, symbol: x.symbol, side: x.side, volume: x.volume, price: x.close_price ?? null, profit: x.profit ?? 0, closed_at: x.closed_at ?? now }));
          const { error: dErr } = await db.from("trade_deals").upsert(rows, { onConflict: "account_id,deal_ticket", ignoreDuplicates: true });
          if (dErr) return fail("could not save deals", 500);
          for (const r of rows) { affected.add(r.position_ticket); dealSide.set(r.position_ticket, { symbol: r.symbol, side: r.side }); }
        }
        const live = new Set((p.positions ?? []).map((x) => x.ticket));
        // A late (older) snapshot must not overwrite newer state; a partial one must not close positions.
        if (!snap.use) p.positions = undefined;
        if (p.positions?.length) {
          await db.from("trades").upsert(p.positions.map(({ deal: _d, ...x }) => defined({ ...x, account_id: acc.id, user_id: acc.user_id, status: "open" })), { onConflict: "account_id,ticket" });
        }
        if (p.positions && snap.closeMissing) {
          // Positions no longer reported by a complete snapshot are fully closed.
          const { data: openRows } = await db.from("trades").select("ticket").eq("account_id", acc.id).eq("status", "open");
          for (const r of openRows ?? []) if (!live.has(r.ticket)) affected.add(r.ticket);
        }
        if (affected.size) {
          const tickets = [...affected];
          const [{ data: deals }, { data: existing }] = await Promise.all([
            db.from("trade_deals").select("deal_ticket,position_ticket,volume,price,profit,closed_at").eq("account_id", acc.id).in("position_ticket", tickets),
            db.from("trades").select("id,ticket,status").eq("account_id", acc.id).in("ticket", tickets),
          ]);
          for (const tk of tickets) {
            const sum = summarizeDeals((deals ?? []).filter((d) => d.position_ticket === tk).map((d) => ({ ...d, volume: Number(d.volume), profit: Number(d.profit), price: d.price == null ? null : Number(d.price) })));
            const row = (existing ?? []).find((r) => r.ticket === tk);
            const hasDeals = sum.lastAt != null;
            const isOpen = p.positions && snap.closeMissing ? live.has(tk) : row?.status === "open" || live.has(tk);
            const patch = isOpen
              ? { realized_profit: sum.realized, closed_volume: sum.closedVolume }
              : defined({ status: "closed", realized_profit: sum.realized, closed_volume: sum.closedVolume, profit: hasDeals ? sum.realized : undefined, close_price: sum.lastPrice ?? undefined, closed_at: sum.lastAt ?? now });
            if (row) await db.from("trades").update(patch).eq("id", row.id);
            else if (hasDeals) {
              const ds = dealSide.get(tk);
              if (ds) await db.from("trades").insert({ ...patch, account_id: acc.id, user_id: acc.user_id, ticket: tk, symbol: ds.symbol, side: ds.side, volume: sum.closedVolume, status: isOpen ? "open" : "closed" });
            }
          }
        }
        if (p.positions) await lockProfits(db, acc, p.positions);
        // Results only move a command forward (sent/unknown → final); a late duplicate never wipes a newer outcome.
        for (const r of p.results ?? []) {
          const next = mapEaStatus(r.status);
          const { data: cur, error: cErr } = await db.from("trade_commands").select("status").eq("id", r.id).eq("account_id", acc.id).maybeSingle();
          if (cErr) return fail("could not read command", 500);
          if (!cur || !canApplyResult(cur.status, next)) continue;
          const { error: uErr } = await db.from("trade_commands").update(defined({ status: next, result: r.result ?? null, filled_count: r.filled, updated_at: now })).eq("id", r.id).eq("account_id", acc.id).eq("status", cur.status);
          if (uErr) return fail("could not save command result", 500); // EA keeps the result and resends it
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

        // Atomic claim: concurrent syncs can never receive the same command; unanswered ones are re-offered for broker-side verification.
        // Only one EA instance may execute for an account; another instance is refused until the owner is silent for 60s.
        const executor = meta?.executor ?? `legacy:${acc.id}`;
        const { data: owns } = await db.rpc("claim_executor", { _account: acc.id, _executor: executor });
        const { data: cmds, error: claimErr } = owns ? await db.rpc("claim_commands_v2", { _account: acc.id, _executor: executor, _limit: 50 }) : { data: [], error: null };
        if (claimErr) return fail("could not claim commands", 500);

        const watch = mine.filter((h) => h.trigger_type === "price").map((h) => ({ id: h.id, symbol: h.symbol, price: h.trigger_price }));
        if (asText) {
          const v = (x: unknown) => (x == null ? "" : String(x).replace(/[|\n\r]/g, " "));
          const lines = [`OK|${now}`];
          if (!owns) lines.push("E|Another EA instance is active on this account - this one will not execute commands");
          for (const c of cmds ?? []) {
            const pl = (c.payload ?? {}) as { symbol?: unknown; side?: unknown; order_type?: unknown; lot?: unknown; sl?: unknown; tp?: unknown; price?: unknown; count?: unknown; delay_seconds?: unknown; threshold?: unknown; ticket?: unknown; until_no_margin?: unknown; guard?: unknown };
            // Fields 15-17 (EA 1.40+): expiry (unix sec), re-check risk at live price (1/0), minimum R/R. Older EAs ignore them.
            const exp = c.expires_at ? Math.floor(new Date(c.expires_at).getTime() / 1000) : "";
            lines.push(["C", c.id, c.command, v(pl.symbol), v(pl.side), v(pl.order_type ?? "market"), v(pl.lot), v(pl.sl), v(pl.tp), v(pl.price), v(pl.count ?? 1), v(pl.delay_seconds ?? 0), v(pl.threshold), v(pl.ticket), pl.until_no_margin ? "1" : "0", v(exp), pl.guard ? "1" : "0", v(MIN_RR)].join("|"));
          }
          for (const w of watch) lines.push(["W", w.id, v(w.symbol), v(w.price)].join("|"));
          return new Response(lines.join("\n") + "\n", { headers: { ...cors, "Content-Type": "text/plain" } });
        }
        return json({ commands: cmds ?? [], watch_prices: watch, server_time: now, executor_ok: !!owns });
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
