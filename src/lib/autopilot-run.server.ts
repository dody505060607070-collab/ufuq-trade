import { skipReason, tradeLot, SINGLE_AI_CALL } from "@/lib/autopilot";
import { pauseReason, adaptiveCooldown } from "@/lib/profitlock";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** One Auto-Pilot cycle: analyses each enabled symbol once and queues trades. Pass onlyUser to run for a single user. */
export async function runAutopilot(db: SupabaseClient<Database>, onlyUser?: string) {
  const { getCached, runAI, newsNearby, verifyTrade } = await import("@/lib/analysis.server");
  const { MIN_CONFIDENCE_FLOOR } = await import("@/lib/autopilot");
  const checks = new Map<string, Awaited<ReturnType<typeof verifyTrade>>>();
  if (!onlyUser) {
    const b = await import("@/lib/brain.server");
    await b.processLessons(db).catch((e) => console.error("lessons", e));
    await b.gradeDecisions(db).catch((e) => console.error("hindsight", e));
    if (new Date().getUTCDay() === 1) await b.weeklyReviews(db).catch((e) => console.error("weekly", e));
    await b.refreshCot(db).catch((e) => console.error("cot", e));
  }
  // Forex/gold markets are closed Fri 21:00 → Sun 22:00 UTC: skip paid AI analysis then.
  const n = new Date(), d = n.getUTCDay(), h = n.getUTCHours();
  if ((d === 5 && h >= 21) || d === 6 || (d === 0 && h < 22)) return { ok: true, users: 0, queued: 0, closed: true };
  let sq = db.from("autopilot_settings").select("*").eq("enabled", true);
  if (onlyUser) sq = sq.eq("user_id", onlyUser);
  const { data: all } = await sq;
  // Only analyse for users with a live MT5 account (seen in the last 5 min) and auto trading on — saves AI calls.
  const liveSince = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: liveAccs } = all?.length
    ? await db.from("trading_accounts").select("user_id").in("user_id", all.map((u) => u.user_id)).eq("auto_trading", true).gte("last_seen_at", liveSince)
    : { data: [] as { user_id: string }[] };
  const liveUsers = new Set((liveAccs ?? []).map((a) => a.user_id));
  const users = (all ?? []).filter((u) => liveUsers.has(u.user_id));
  if (!users.length) return { ok: true, users: 0, queued: 0 };
  // One analysis per symbol/timeframe, shared by all users.
  const pairs = [...new Set(users.flatMap((u) => u.symbols.map((s) => `${s}|${u.timeframe}`)))].slice(0, 12);
  const results = new Map<string, Awaited<ReturnType<typeof runAI>> | null>();
  const errors = new Map<string, string>();
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
    } catch (e) { console.error("autopilot analysis", k, e); results.set(k, null); errors.set(k, e instanceof Error ? e.message : String(e)); }
    if (!news.has(sym)) news.set(sym, await newsNearby(sym));
  }));

  const { riskCheck, dollarsPerPrice, reanchor } = await import("@/lib/risk-engine");
  const { brokerCandles } = await import("@/lib/analysis.server");
  const atrs = new Map<string, number>(); const sources = new Map<string, string>();
  for (const k of results.keys()) {
    const [sym, tf] = k.split("|") as [string, string];
    const bc = await brokerCandles(db, sym, tf, 20).catch(() => null);
    sources.set(sym, bc ? "broker" : "yahoo");
    if (bc) { let t = 0; for (let i = 1; i < bc.length; i++) t += Math.max(bc[i]!.h - bc[i]!.l, Math.abs(bc[i]!.h - bc[i - 1]!.c), Math.abs(bc[i]!.l - bc[i - 1]!.c)); atrs.set(sym, t / (bc.length - 1)); }
  }
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  let queued = 0;
  for (const u of users) {
    const log = (symbol: string, action: string, detail: string) => db.from("autopilot_events").insert({ user_id: u.user_id, symbol, action, detail });
    const { data: accounts } = await db.from("trading_accounts").select("id,last_seen_at,balance,equity").eq("user_id", u.user_id).eq("auto_trading", true);
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
    const pause = pauseReason(lastClose ? (Date.now() - new Date(lastClose).getTime()) / 60_000 : null, adaptiveCooldown(Number(ext.cooldown_minutes ?? 0), (closedToday ?? []).map((t) => Number(t.profit ?? 0))), (closedToday ?? []).reduce((a, t) => a + Number(t.profit ?? 0), 0), Number(ext.daily_target_usd ?? 0));
    if (pause) { await log("-", "skipped", pause); continue; }
    const { data: qrows } = await db.from("broker_quotes").select("*").in("account_id", ids);
    const quotes = qrows ?? [];
    const auto = (cmds ?? []).filter((c) => (c.payload as { autopilot?: boolean })?.autopilot);
    for (const sym of u.symbols) {
      const r = results.get(`${sym}|${u.timeframe}`);
      if (!r) { await log(sym, "error", `Analysis unavailable: ${errors.get(`${sym}|${u.timeframe}`) ?? "unknown error"}`); continue; }
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
        const q = quotes.find((x) => x.account_id === acc.id && x.symbol === sym);
        const a = acc as { id: string; balance?: number | null };
        // Market orders fill at the broker price: shift entry/SL/TP to it, keeping the same distances (same risk & RR).
        const live0 = q ? (r.direction === "buy" ? q.ask ?? q.bid : q.bid) : null;
        const r2 = reanchor(r, live0 ?? null);
        // Strong setups (>= STRONG_CONFIDENCE) use STRONG_LOT_MULT x lot; the risk engine still caps the dollar risk.
        const lot = tradeLot(Number(u.lot_size), r.confidence);
        const verdict = why ? { allow: false, reason: why } : riskCheck(r2, {
          price: live0 ?? r2.entry, spreadPrice: q?.bid != null && q?.ask != null ? q.ask - q.bid : null, atr: atrs.get(sym) ?? null,
          balance: a.balance ?? null, lot, dollarsPerPricePerLot: dollarsPerPrice(sym, q?.tick_value, q?.point),
          dayPnl: (closedToday ?? []).reduce((s2, t) => s2 + Number(t.profit ?? 0), 0),
          maxDailyLossPct: 5, maxRiskPct: 5,
        });
        if (!verdict.allow) await db.from("decision_log").insert({ user_id: u.user_id, account_id: acc.id, symbol: sym, timeframe: u.timeframe, data_source: sources.get(sym) ?? "yahoo", ai_direction: r.direction, ai_confidence: Math.round(r.confidence), entry: r2.entry, stop_loss: r2.stop_loss, take_profit: r2.take_profit, risk_verdict: verdict.allow ? "approved" : "rejected", risk_reason: verdict.reason });
        if (!verdict.allow) { reason = verdict.reason; continue; }
        // Second opinion: an independent AI check must agree, and the average confidence must stay above the floor.
        let v = checks.get(sym);
        if (!v) { v = SINGLE_AI_CALL ? { agree: true, confidence: r.confidence, reason: "single analysis (credit saver)" } : await verifyTrade(sym, u.timeframe, r, live0 ?? null); checks.set(sym, v); }
        const combined = Math.round((r.confidence + v.confidence) / 2);
        if (!v.agree || combined < Math.max(MIN_CONFIDENCE_FLOOR, Number(u.min_confidence))) {
          reason = `Second AI check said no (${v.confidence}%, combined ${combined}%): ${v.reason}`;
          await db.from("decision_log").insert({ user_id: u.user_id, account_id: acc.id, symbol: sym, timeframe: u.timeframe, data_source: sources.get(sym) ?? "yahoo", ai_direction: r.direction, ai_confidence: combined, entry: r2.entry, stop_loss: r2.stop_loss, take_profit: r2.take_profit, risk_verdict: "rejected", risk_reason: reason.slice(0, 300) });
          continue;
        }
        await db.from("decision_log").insert({ user_id: u.user_id, account_id: acc.id, symbol: sym, timeframe: u.timeframe, data_source: sources.get(sym) ?? "yahoo", ai_direction: r.direction, ai_confidence: combined, entry: r2.entry, stop_loss: r2.stop_loss, take_profit: r2.take_profit, risk_verdict: "approved", risk_reason: `Both AI checks agree (${r.confidence}% + ${v.confidence}%)` });
        rows.push({ user_id: u.user_id, account_id: acc.id, command: "open_trade", payload: { symbol: sym, side: r.direction, order_type: "market", lot, sl: r2.stop_loss, tp: r2.take_profit, count: 1, delay_seconds: 0, autopilot: true } });
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
