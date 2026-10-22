import { skipReason } from "@/lib/autopilot";
import { pauseReason } from "@/lib/profitlock";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** One Auto-Pilot cycle: analyses each enabled symbol once and queues trades. Pass onlyUser to run for a single user. */
export async function runAutopilot(db: SupabaseClient<Database>, onlyUser?: string) {
  const { getCached, runAI, newsNearby } = await import("@/lib/analysis.server");
  // Forex/gold markets are closed Fri 21:00 → Sun 22:00 UTC: skip paid AI analysis then.
  const n = new Date(), d = n.getUTCDay(), h = n.getUTCHours();
  if ((d === 5 && h >= 21) || d === 6 || (d === 0 && h < 22)) return { ok: true, users: 0, queued: 0, closed: true };
  let sq = db.from("autopilot_settings").select("*").eq("enabled", true);
  if (onlyUser) sq = sq.eq("user_id", onlyUser);
  const { data: users } = await sq;
  if (!users?.length) return { ok: true, users: 0, queued: 0 };
  // One analysis per symbol/timeframe, shared by all users.
  const pairs = [...new Set(users.flatMap((u) => u.symbols.map((s) => `${s}|${u.timeframe}`)))].slice(0, 12);
  const results = new Map<string, Awaited<ReturnType<typeof runAI>> | null>();
  const news = new Map<string, boolean>();
  const owner = users[0]!.user_id;
  await Promise.all(pairs.map(async (k) => {
    const [sym = "", tf = "H1"] = k.split("|");
    try {
      let r = await getCached(db, sym, tf);
      if (!r) {
        r = await runAI(db, sym, tf, null);
        await db.from("analyses").insert({ user_id: owner, symbol: sym, timeframe: tf, direction: r.direction, confidence: Math.round(r.confidence), entry: r.entry, stop_loss: r.stop_loss, take_profit: r.take_profit, summary: r.summary });
      }
      results.set(k, r);
    } catch (e) { console.error("autopilot analysis", k, e); results.set(k, null); }
    if (!news.has(sym)) news.set(sym, await newsNearby(sym));
  }));

  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  let queued = 0;
  for (const u of users) {
    const log = (symbol: string, action: string, detail: string) => db.from("autopilot_events").insert({ user_id: u.user_id, symbol, action, detail });
    const { data: accounts } = await db.from("trading_accounts").select("id,last_seen_at").eq("user_id", u.user_id).eq("auto_trading", true);
    const live = (accounts ?? []).filter((a) => a.last_seen_at && Date.now() - new Date(a.last_seen_at).getTime() < 5 * 60_000);
    if (!live.length) { await log("-", "skipped", "No connected account with auto trading on"); continue; }
    const ids = live.map((a) => a.id);
    const [{ data: open }, { data: cmds }] = await Promise.all([
      db.from("trades").select("account_id,symbol").in("account_id", ids).eq("status", "open"),
      db.from("trade_commands").select("account_id,payload,created_at").in("account_id", ids).eq("command", "open_trade").gte("created_at", dayStart.toISOString()),
    ]);
    const { data: closedToday } = await db.from("trades").select("profit,closed_at").in("account_id", ids).eq("status", "closed").gte("closed_at", dayStart.toISOString()).order("closed_at", { ascending: false });
    const ext = u as unknown as { cooldown_minutes?: number; daily_target_usd?: number };
    const lastClose = closedToday?.[0]?.closed_at;
    const pause = pauseReason(lastClose ? (Date.now() - new Date(lastClose).getTime()) / 60_000 : null, Number(ext.cooldown_minutes ?? 0), (closedToday ?? []).reduce((a, t) => a + Number(t.profit ?? 0), 0), Number(ext.daily_target_usd ?? 0));
    if (pause) { await log("-", "skipped", pause); continue; }
    const auto = (cmds ?? []).filter((c) => (c.payload as { autopilot?: boolean })?.autopilot);
    for (const sym of u.symbols) {
      const r = results.get(`${sym}|${u.timeframe}`);
      if (!r) { await log(sym, "error", "Analysis unavailable"); continue; }
      const rows = [];
      let reason = "";
      for (const acc of live) {
        const st = {
          openTotal: (open ?? []).filter((t) => t.account_id === acc.id).length,
          openOnSymbol: (open ?? []).filter((t) => t.account_id === acc.id && t.symbol.toUpperCase().startsWith(sym.toUpperCase())).length,
          todayCount: auto.filter((c) => c.account_id === acc.id).length,
          recentOnSymbol: auto.some((c) => c.account_id === acc.id && c.created_at >= hourAgo && (c.payload as { symbol?: string }).symbol === sym),
          newsNearby: !!news.get(sym), avoidNews: u.avoid_news,
        };
        const why = skipReason(r, u, st);
        if (why) { reason = why; continue; }
        rows.push({ user_id: u.user_id, account_id: acc.id, command: "open_trade", payload: { symbol: sym, side: r.direction, order_type: "market", lot: Number(u.lot_size), sl: r.stop_loss, tp: r.take_profit, count: 1, delay_seconds: 0, autopilot: true } });
      }
      if (rows.length) {
        await db.from("trade_commands").insert(rows);
        queued += rows.length;
        await log(sym, "opened", `${r.direction.toUpperCase()} ${u.lot_size} lot · ${r.confidence}% · SL ${r.stop_loss} · TP ${r.take_profit}`);
      } else await log(sym, "skipped", `${r.direction.toUpperCase()} ${r.confidence}% — ${reason}`);
    }
  }
  return { ok: true, users: users.length, queued };
}
