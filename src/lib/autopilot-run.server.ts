import { skipReason, tradeLot, REAL_SECOND_CHECK, LOSS_LOCK_MINUTES, isSameSetup, inQuietHours, QUIET_REASON } from "@/lib/autopilot";
import { pauseReason, adaptiveCooldown } from "@/lib/profitlock";
import { toArabic, firstSentence } from "@/lib/msg-ar";
import { providerOf, analysisKey, providerLabel, OPENAI_MIN_CONFIDENCE } from "@/lib/ai-provider";
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
    ? await db.from("trading_accounts").select("id,user_id,ai_provider").in("user_id", all.map((u) => u.user_id)).eq("auto_trading", true).gte("last_seen_at", liveSince)
    : { data: [] as { id: string; user_id: string; ai_provider: string }[] };
  const liveUsers = new Set((liveAccs ?? []).map((a) => a.user_id));
  const users = (all ?? []).filter((u) => liveUsers.has(u.user_id));
  if (!users.length) return { ok: true, users: 0, queued: 0 };
  // Thin-liquidity hours: no new trades, so skip the paid AI analysis too.
  if (inQuietHours(new Date())) {
    await db.from("autopilot_events").insert(users.map((u) => ({ user_id: u.user_id, symbol: "-", action: "skipped", detail: QUIET_REASON, detail_ar: toArabic(QUIET_REASON) })));
    return { ok: true, users: users.length, queued: 0, quiet: true };
  }
  // One analysis per symbol/timeframe/AI provider, shared by all accounts using that provider.
  const provsOf = (uid: string) => [...new Set((liveAccs ?? []).filter((a) => a.user_id === uid).map((a) => providerOf(a.ai_provider)))];
  const allPairs = [...new Set(users.flatMap((u) => provsOf(u.user_id).flatMap((p) => u.symbols.map((s) => analysisKey(s, u.timeframe, p)))))];
  // Real trades need the broker's own live price; markets the EA doesn't price yet are not analysed (no AI cost).
  const { MAX_QUOTE_AGE_SEC } = await import("@/lib/risk-engine");
  const { data: freshQ } = await db.from("broker_quotes").select("account_id,symbol,updated_at").in("account_id", (liveAccs ?? []).map((a) => a.id)).gte("updated_at", new Date(Date.now() - MAX_QUOTE_AGE_SEC * 1000).toISOString());
  const priced = new Set((freshQ ?? []).flatMap((q) => { const a = (liveAccs ?? []).find((x) => x.id === q.account_id); return a ? [`${q.symbol}|${providerOf(a.ai_provider)}`] : []; }));
  const pairs = allPairs.filter((k) => { const [s, , p] = k.split("|"); return priced.has(`${s}|${p}`); }).slice(0, 16);
  const results = new Map<string, Awaited<ReturnType<typeof runAI>> | null>();
  const errors = new Map<string, string>();
  const waits = new Map<string, string>();
  const unpricedPairs = allPairs.filter((k) => { const [s, , p] = k.split("|"); return !priced.has(`${s}|${p}`); });
  for (const k of unpricedPairs) waits.set(k, "Waiting: no live broker price for this market yet (real trades use the broker's own price)");
  const news = new Map<string, boolean>();
  const owner = users[0]!.user_id;
  // Slow mode: once today's Gemini budget is used, analyse one Gemini symbol per SLOW_MODE_MINUTES (oldest analysis first) instead of stopping.
  const { geminiBudgetUsed } = await import("@/lib/ai-budget.server");
  const { pickSlowPair, SLOW_MODE_MINUTES } = await import("@/lib/signal-guard");
  const slow = pairs.some((k) => k.endsWith("|gemini")) && (await geminiBudgetUsed());
  let slowPick: string | null = null;
  if (slow) {
    const gem = pairs.filter((k) => k.endsWith("|gemini"));
    const { data: recent } = await db.from("analyses").select("symbol,timeframe,created_at").eq("provider", "gemini").gte("created_at", new Date(Date.now() - 86400_000).toISOString()).order("created_at", { ascending: false }).limit(200);
    const lastAt: Record<string, number> = {};
    for (const a of recent ?? []) { const k = analysisKey(a.symbol, a.timeframe ?? "H1", "gemini"); lastAt[k] ??= new Date(a.created_at).getTime(); }
    slowPick = pickSlowPair(gem, lastAt);
  }
  await Promise.all(pairs.map(async (k) => {
    const [sym = "", tf = "H1", pv] = k.split("|");
    const prov = providerOf(pv);
    try {
      let r = await getCached(db, sym, tf, prov);
      if (!r && slow && prov === "gemini" && k !== slowPick) { waits.set(k, `Daily Gemini budget used — slow mode: one analysis every ${SLOW_MODE_MINUTES} min, ${slowPick?.split("|")[0] ?? "another symbol"} goes first`); return; }
      if (!r) {
        r = await runAI(db, sym, tf, null, prov, { slow: slow && prov === "gemini" });
        await db.from("analyses").insert({ user_id: owner, symbol: sym, timeframe: tf, provider: prov, direction: r.direction, confidence: Math.round(r.confidence), entry: r.entry, stop_loss: r.stop_loss, take_profit: r.take_profit, summary: r.summary, summary_ar: r.summary_ar ?? null });
      }
      results.set(k, r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.set(k, null);
      if (msg.includes("slow mode")) waits.set(k, msg); else { console.error("autopilot analysis", k, e); errors.set(k, msg); }
    }
    if (!news.has(sym)) news.set(sym, !!(await newsNearby(sym)));
  }));

  const { riskCheck, dollarsPerPrice, reanchor, brokerGate, effectiveLot } = await import("@/lib/risk-engine");
  const { brokerCandles } = await import("@/lib/analysis.server");
  const atrs = new Map<string, number>(); const sources = new Map<string, string>();
  for (const k of results.keys()) {
    const [sym, tf] = k.split("|") as [string, string];
    if (sources.has(sym)) continue;
    const bc = await brokerCandles(db, sym, tf, 20).catch(() => null);
    sources.set(sym, bc ? "broker" : "yahoo");
    if (bc) { let t = 0; for (let i = 1; i < bc.length; i++) t += Math.max(bc[i]!.h - bc[i]!.l, Math.abs(bc[i]!.h - bc[i - 1]!.c), Math.abs(bc[i]!.l - bc[i - 1]!.c)); atrs.set(sym, t / (bc.length - 1)); }
  }
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  let queued = 0;
  for (const u of users) {
    // detail_ar: Arabic copy; the AI's own Arabic sentence replaces its English one when available.
    const log = (symbol: string, action: string, detail: string, aiAr?: string | null) => {
      const m = detail.match(/^(.*?)Waiting: (.*)$/);
      const detail_ar = m && aiAr ? `${toArabic(m[1])}انتظار: ${firstSentence(aiAr)}` : toArabic(detail);
      return db.from("autopilot_events").insert({ user_id: u.user_id, symbol, action, detail, detail_ar });
    };
    const { data: accounts } = await db.from("trading_accounts").select("id,last_seen_at,balance,equity,ai_provider,lot_size").eq("user_id", u.user_id).eq("auto_trading", true);
    const live = (accounts ?? []).filter((a) => a.last_seen_at && Date.now() - new Date(a.last_seen_at).getTime() < 5 * 60_000);
    if (!live.length) { await log("-", "skipped", "No connected account with auto trading on"); continue; }
    const ids = live.map((a) => a.id);
    const [{ data: open }, { data: cmds }] = await Promise.all([
      db.from("trades").select("account_id,symbol").in("account_id", ids).eq("status", "open"),
      db.from("trade_commands").select("account_id,payload,created_at").in("account_id", ids).eq("command", "open_trade").gte("created_at", dayStart.toISOString()),
    ]);
    const { data: closedToday } = await db.from("trades").select("account_id,symbol,side,profit,closed_at").in("account_id", ids).eq("status", "closed").gte("closed_at", dayStart.toISOString()).order("closed_at", { ascending: false });
    const ext = u as unknown as { cooldown_minutes?: number; daily_target_usd?: number };
    const lastClose = closedToday?.[0]?.closed_at;
    const pause = pauseReason(lastClose ? (Date.now() - new Date(lastClose).getTime()) / 60_000 : null, adaptiveCooldown(Number(ext.cooldown_minutes ?? 0), (closedToday ?? []).map((t) => Number(t.profit ?? 0))), (closedToday ?? []).reduce((a, t) => a + Number(t.profit ?? 0), 0), Number(ext.daily_target_usd ?? 0));
    if (pause) { await log("-", "skipped", pause); continue; }
    const { data: qrows } = await db.from("broker_quotes").select("*").in("account_id", ids);
    const quotes = qrows ?? [];
    const auto = (cmds ?? []).filter((c) => (c.payload as { autopilot?: boolean })?.autopilot);
    // Each account trades on the analysis of its own AI (Gemini or ChatGPT).
    const groups = [...new Set(live.map((a) => providerOf(a.ai_provider)))].map((p) => ({ prov: p, accs: live.filter((a) => providerOf(a.ai_provider) === p) }));
    for (const sym of u.symbols) for (const { prov, accs } of groups) {
      const key = analysisKey(sym, u.timeframe, prov);
      const tag = `[${providerLabel(prov)}] `;
      const r = results.get(key);
      if (!r && waits.has(key)) { await log(sym, "skipped", `${tag}${waits.get(key)}`); continue; }
      if (!r) { await log(sym, "error", `${tag}Analysis unavailable: ${errors.get(key) ?? "unknown error"}`); continue; }
      const rows = [];
      let reason = "";
      for (const acc of accs) {
        const st = {
          openTotal: (open ?? []).filter((t) => t.account_id === acc.id).length,
          openOnSymbol: (open ?? []).filter((t) => t.account_id === acc.id && t.symbol.toUpperCase().startsWith(sym.toUpperCase())).length,
          todayCount: auto.filter((c) => c.account_id === acc.id).length,
          // Only the same setup (same side, nearby stop, < REPEAT_WINDOW_MINUTES) counts as a repeat; a new setup on the symbol may trade.
          recentOnSymbol: isSameSetup(auto.filter((c) => c.account_id === acc.id && c.created_at >= hourAgo && (c.payload as { symbol?: string }).symbol === sym).map((c) => { const p = c.payload as { side?: string; sl?: number | null }; return { side: String(p.side ?? ""), sl: p.sl ?? null, ageMin: (Date.now() - new Date(c.created_at).getTime()) / 60_000 }; }), r),
          newsNearby: !!news.get(sym), avoidNews: u.avoid_news,
          quietHours: inQuietHours(new Date()),
          lostSameSide: (() => { const t = (closedToday ?? []).find((x) => x.account_id === acc.id && String(x.symbol).toUpperCase().startsWith(sym.toUpperCase())); return !!t && Number(t.profit ?? 0) < 0 && t.side === r.direction && Date.now() - new Date(t.closed_at as string).getTime() < LOSS_LOCK_MINUTES * 60_000; })(),
        };
        const why = skipReason(r, prov === "openai" ? { ...u, min_confidence: Math.min(Number(u.min_confidence), OPENAI_MIN_CONFIDENCE) } : u, st);
        const q = quotes.find((x) => x.account_id === acc.id && x.symbol === sym);
        const a = acc as { id: string; balance?: number | null };
        // Market orders fill at the broker price: shift entry/SL/TP to it, keeping the same distances (same risk & RR).
        const live0 = q ? (r.direction === "buy" ? q.ask ?? q.bid : q.bid) : null;
        const gate = brokerGate(r, live0 ?? null);
        const r2 = reanchor(r, live0 ?? null, q?.point);
        // Strong setups (>= STRONG_CONFIDENCE) use STRONG_LOT_MULT x lot; the risk engine still caps the dollar risk
        // on the volume the broker will really fill (its minimum lot can be larger).
        // Each account uses its own lot when set (so a smaller account risks the same share of its balance), else the Auto-Pilot lot.
        const accLot = Number((acc as { lot_size?: number | null }).lot_size ?? 0);
        const lot = tradeLot(accLot > 0 ? accLot : Number(u.lot_size), r.confidence);
        const verdict = why ? { allow: false, reason: why } : gate ? { allow: false, reason: gate } : riskCheck(r2, {
          price: live0 ?? r2.entry, spreadPrice: q?.bid != null && q?.ask != null ? q.ask - q.bid : null, atr: atrs.get(sym) ?? null,
          balance: a.balance ?? null, lot: effectiveLot(lot, q?.min_lot), dollarsPerPricePerLot: dollarsPerPrice(sym, q?.tick_value, q?.point),
          dayPnl: (closedToday ?? []).reduce((s2, t) => s2 + Number(t.profit ?? 0), 0),
          maxDailyLossPct: Number(u.max_daily_loss_pct ?? 5), maxRiskPct: Number(u.max_risk_pct ?? 5),
          quoteAgeSec: q?.updated_at ? (Date.now() - new Date(q.updated_at).getTime()) / 1000 : null,
        });
        if (!verdict.allow) await db.from("decision_log").insert({ user_id: u.user_id, account_id: acc.id, symbol: sym, timeframe: u.timeframe, data_source: sources.get(sym) ?? "yahoo", ai_provider: prov, ai_direction: r.direction, ai_confidence: Math.round(r.confidence), entry: r2.entry, stop_loss: r2.stop_loss, take_profit: r2.take_profit, risk_verdict: verdict.allow ? "approved" : "rejected", risk_reason: verdict.reason });
        if (!verdict.allow) { reason = verdict.reason; continue; }
        // Second opinion (off by default): an independent AI check must agree, and the average confidence must stay above the floor.
        let v = checks.get(key);
        if (!v) { v = REAL_SECOND_CHECK && prov === "gemini" ? await verifyTrade(sym, u.timeframe, r, live0 ?? null) : { agree: true, confidence: r.confidence, reason: "single analysis" }; checks.set(key, v); }
        const combined = Math.round((r.confidence + v.confidence) / 2);
        if (!v.agree || combined < Math.max(MIN_CONFIDENCE_FLOOR, prov === "openai" ? Math.min(Number(u.min_confidence), OPENAI_MIN_CONFIDENCE) : Number(u.min_confidence))) {
          reason = `Second AI check said no (${v.confidence}%, combined ${combined}%): ${v.reason}`;
          await db.from("decision_log").insert({ user_id: u.user_id, account_id: acc.id, symbol: sym, timeframe: u.timeframe, data_source: sources.get(sym) ?? "yahoo", ai_provider: prov, ai_direction: r.direction, ai_confidence: combined, entry: r2.entry, stop_loss: r2.stop_loss, take_profit: r2.take_profit, risk_verdict: "rejected", risk_reason: reason.slice(0, 300) });
          continue;
        }
        await db.from("decision_log").insert({ user_id: u.user_id, account_id: acc.id, symbol: sym, timeframe: u.timeframe, data_source: sources.get(sym) ?? "yahoo", ai_provider: prov, ai_direction: r.direction, ai_confidence: combined, entry: r2.entry, stop_loss: r2.stop_loss, take_profit: r2.take_profit, risk_verdict: "approved", risk_reason: v.reason.startsWith("skipped") || v.reason === "single analysis" ? `Approved by ${providerLabel(prov)} ${r.confidence}% + code risk checks (${v.reason})` : `Both AI checks agree (${r.confidence}% + ${v.confidence}%)` });
        rows.push({ user_id: u.user_id, account_id: acc.id, command: "open_trade", payload: { symbol: sym, side: r.direction, order_type: "market", lot, sl: r2.stop_loss, tp: r2.take_profit, count: 1, delay_seconds: 0, autopilot: true, ai_provider: prov } });
      }
      if (rows.length) {
        await db.from("trade_commands").insert(rows);
        queued += rows.length;
        await log(sym, "opened", `${tag}${r.direction.toUpperCase()} ${(rows[0]!.payload as { lot: number }).lot} lot · ${r.confidence}% · SL ${r.stop_loss} · TP ${r.take_profit}`);
      } else await log(sym, "skipped", `${tag}${r.direction.toUpperCase()} ${r.confidence}% — ${reason}`, r.summary_ar);
    }
  }
  return { ok: true, users: users.length, queued };
}
