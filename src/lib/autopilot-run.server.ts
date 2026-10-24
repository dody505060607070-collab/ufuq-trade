import { skipReason } from "@/lib/autopilot";
import { pauseReason } from "@/lib/profitlock";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** One Auto-Pilot cycle: analyses each enabled symbol once and queues trades. Pass onlyUser to run for a single user. */
export async function runAutopilot(db: SupabaseClient<Database>, onlyUser?: string) {
  // Only one cycle at a time (cron + restart button can overlap).
  const { data: got } = await db.rpc("acquire_autopilot_lease", { _seconds: 240 });
  if (!got) return { ok: true, users: 0, queued: 0, busy: true };
  try { return await cycle(db, onlyUser); } finally { await db.rpc("release_autopilot_lease"); }
}

async function cycle(db: SupabaseClient<Database>, onlyUser?: string) {
  const { getCached, runAI, newsNearby, brokerCandles } = await import("@/lib/analysis.server");
  if (!onlyUser) {
    const b = await import("@/lib/brain.server");
    await b.processLessons(db).catch((e) => console.error("lessons", e));
    if (new Date().getUTCDay() === 1) await b.weeklyReviews(db).catch((e) => console.error("weekly", e));
    await b.refreshCot(db).catch((e) => console.error("cot", e));
  }
  // Forex/gold markets are closed Fri 21:00 → Sun 22:00 UTC: skip paid AI analysis then.
  const n = new Date(), d = n.getUTCDay(), h = n.getUTCHours();
  if ((d === 5 && h >= 21) || d === 6 || (d === 0 && h < 22)) return { ok: true, users: 0, queued: 0, closed: true };
  let sq = db.from("autopilot_settings").select("*").eq("enabled", true);
  if (onlyUser) sq = sq.eq("user_id", onlyUser);
  const { data: users } = await sq;
  if (!users?.length) return { ok: true, users: 0, queued: 0 };
  // One market-only analysis per symbol/timeframe, shared by all users (no personal trades or rules inside).
  const pairs = [...new Set(users.flatMap((u) => u.symbols.map((s) => `${s}|${u.timeframe}`)))].slice(0, 12);
  const results = new Map<string, Awaited<ReturnType<typeof runAI>> | null>();
  const news = new Map<string, boolean>();
  const owner = users[0]!.user_id;
  await Promise.all(pairs.map(async (k) => {
    const [sym = "", tf = "H1"] = k.split("|");
    try {
      let r = await getCached(db, sym, tf);
      if (!r) {
        r = await runAI(db, sym, tf, null, null);
        await db.from("analyses").insert({ user_id: owner, symbol: sym, timeframe: tf, direction: r.direction, confidence: Math.round(r.confidence), entry: r.entry, stop_loss: r.stop_loss, take_profit: r.take_profit, summary: r.summary, shared: true });
      }
      results.set(k, r);
    } catch (e) { console.error("autopilot analysis", k, e); results.set(k, null); }
    if (!news.has(sym)) news.set(sym, await newsNearby(sym));
  }));

  const { riskCheck, brokerDollarsPerPrice } = await import("@/lib/risk-engine");
  const atrOf = (bc: { h: number; l: number; c: number }[] | null) => {
    if (!bc || bc.length < 2) return null;
    let t = 0; for (let i = 1; i < bc.length; i++) t += Math.max(bc[i]!.h - bc[i]!.l, Math.abs(bc[i]!.h - bc[i - 1]!.c), Math.abs(bc[i]!.l - bc[i - 1]!.c));
    return t / (bc.length - 1);
  };
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  let queued = 0;
  for (const u of users) {
    const log = (symbol: string, action: string, detail: string) => db.from("autopilot_events").insert({ user_id: u.user_id, symbol, action, detail });
    const { data: accounts } = await db.from("trading_accounts").select("id,last_seen_at,balance").eq("user_id", u.user_id).eq("auto_trading", true);
    const live = (accounts ?? []).filter((a) => a.last_seen_at && Date.now() - new Date(a.last_seen_at).getTime() < 5 * 60_000);
    if (!live.length) { await log("-", "skipped", "No connected account with auto trading on"); continue; }
    const ids = live.map((a) => a.id);
    const [{ data: open }, { data: cmds }, { data: closedToday }, { data: qrows }] = await Promise.all([
      db.from("trades").select("account_id,symbol").in("account_id", ids).eq("status", "open"),
      db.from("trade_commands").select("account_id,payload,created_at,status").in("account_id", ids).eq("command", "open_trade").gte("created_at", dayStart.toISOString()),
      db.from("trades").select("account_id,profit,closed_at").in("account_id", ids).eq("status", "closed").gte("closed_at", dayStart.toISOString()).order("closed_at", { ascending: false }),
      db.from("broker_quotes").select("*").in("account_id", ids),
    ]);
    const lastClose = closedToday?.[0]?.closed_at;
    const userPnl = (closedToday ?? []).reduce((a, t) => a + Number(t.profit ?? 0), 0);
    const pause = pauseReason(lastClose ? (Date.now() - new Date(lastClose).getTime()) / 60_000 : null, Number(u.cooldown_minutes ?? 0), userPnl, Number(u.daily_target_usd ?? 0));
    if (pause) { await log("-", "skipped", pause); continue; }
    const quotes = qrows ?? [];
    // Commands still waiting for the EA count as open trades so limits hold across symbols and overlapping cycles.
    const pending = (cmds ?? []).filter((c) => c.status === "queued" || c.status === "sent");
    const auto = (cmds ?? []).filter((c) => (c.payload as { autopilot?: boolean })?.autopilot && c.status !== "failed");
    const added = new Map<string, { total: number; syms: Set<string> }>();
    for (const sym of u.symbols) {
      const r = results.get(`${sym}|${u.timeframe}`);
      if (!r) { await log(sym, "error", "Analysis unavailable"); continue; }
      const rows = [];
      let reason = "";
      for (const acc of live) {
        const mine = added.get(acc.id) ?? { total: 0, syms: new Set<string>() };
        const pend = pending.filter((c) => c.account_id === acc.id);
        const st = {
          openTotal: (open ?? []).filter((t) => t.account_id === acc.id).length + pend.length + mine.total,
          openOnSymbol: (open ?? []).filter((t) => t.account_id === acc.id && t.symbol.toUpperCase().startsWith(sym.toUpperCase())).length
            + pend.filter((c) => (c.payload as { symbol?: string }).symbol === sym).length + (mine.syms.has(sym) ? 1 : 0),
          todayCount: auto.filter((c) => c.account_id === acc.id).length + mine.total,
          recentOnSymbol: auto.some((c) => c.account_id === acc.id && c.created_at >= hourAgo && (c.payload as { symbol?: string }).symbol === sym),
          newsNearby: !!news.get(sym), avoidNews: u.avoid_news,
        };
        const why = skipReason(r, u, st);
        const q = quotes.find((x) => x.account_id === acc.id && x.symbol === sym);
        const bc = await brokerCandles(db, sym, u.timeframe, 40, acc.id).catch(() => null);
        const accPnl = (closedToday ?? []).filter((t) => t.account_id === acc.id).reduce((s2, t) => s2 + Number(t.profit ?? 0), 0);
        const verdict = why ? { allow: false, reason: why } : riskCheck(r, {
          price: q?.bid ?? null, priceAgeSec: q?.updated_at ? (Date.now() - new Date(q.updated_at).getTime()) / 1000 : null,
          spreadPrice: q?.bid != null && q?.ask != null ? q.ask - q.bid : null, atr: atrOf(bc),
          balance: acc.balance ?? null, lot: Number(u.lot_size), dollarsPerPricePerLot: brokerDollarsPerPrice(q?.tick_value, q?.point),
          dayPnl: accPnl, maxDailyLossPct: Number(u.max_daily_loss_pct ?? 5), maxRiskPct: Number(u.max_risk_pct ?? 5), requireFreshPrice: true,
        });
        await db.from("decision_log").insert({ user_id: u.user_id, account_id: acc.id, symbol: sym, timeframe: u.timeframe, data_source: bc ? "broker" : "yahoo", ai_direction: r.direction, ai_confidence: Math.round(r.confidence), entry: r.entry, stop_loss: r.stop_loss, take_profit: r.take_profit, risk_verdict: verdict.allow ? "approved" : "rejected", risk_reason: verdict.reason });
        if (!verdict.allow) { reason = verdict.reason; continue; }
        mine.total++; mine.syms.add(sym); added.set(acc.id, mine);
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
