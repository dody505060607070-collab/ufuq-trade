import { skipReason } from "@/lib/autopilot";
import { pauseReason } from "@/lib/profitlock";
import { executionsOf, reservedExecutions, marketClosed, dayPnlFromDeals, sessionBlocked, MIN_PROTOCOL_FOR_AUTOPILOT } from "@/lib/execution";
import { GEMINI_MODEL } from "@/lib/signal-guard";
import { selectAutopilotAnalysis } from "@/lib/autopilot-analysis";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const PROMPT_VERSION = "analysis-v4-personal";
const LEASE_SEC = 240;

/** One Auto-Pilot cycle: analyses each enabled symbol once and queues trades. Pass onlyUser to run for a single user. */
export async function runAutopilot(db: SupabaseClient<Database>, onlyUser?: string) {
  // Owner-token lease: cron and the restart button can overlap; only the owner may renew or release it.
  const token = crypto.randomUUID();
  const { data: got, error } = await db.rpc("acquire_autopilot_lease_v2", { _token: token, _seconds: LEASE_SEC });
  if (error) return { ok: false, users: 0, queued: 0, error: "lease unavailable" };
  if (!got) return { ok: true, users: 0, queued: 0, busy: true };
  const holds = async () => !!(await db.rpc("renew_autopilot_lease", { _token: token, _seconds: LEASE_SEC })).data;
  try { return await cycle(db, holds, onlyUser); } finally { await db.rpc("release_autopilot_lease_v2", { _token: token }); }
}

async function cycle(db: SupabaseClient<Database>, holds: () => Promise<boolean>, onlyUser?: string) {
  const { getCached, getPersonalCached, runAI, newsNearby, brokerCandles } = await import("@/lib/analysis.server");
  if (!onlyUser) {
    const b = await import("@/lib/brain.server");
    await b.processLessons(db).catch((e) => console.error("lessons", e));
    if (new Date().getUTCDay() === 1) await b.weeklyReviews(db).catch((e) => console.error("weekly", e));
    await b.refreshCot(db).catch((e) => console.error("cot", e));
  }
  let sq = db.from("autopilot_settings").select("*").eq("enabled", true);
  if (onlyUser) sq = sq.eq("user_id", onlyUser);
  const { data: users } = await sq;
  if (!users?.length) return { ok: true, users: 0, queued: 0 };
  const [{ data: knownLessons, error: lessonError }, { data: knownRules, error: ruleError }] = await Promise.all([
    db.from("trade_lessons").select("user_id").in("user_id", users.map((u) => u.user_id)),
    db.from("learned_rules").select("user_id").in("user_id", users.map((u) => u.user_id)).eq("is_active", true).eq("status", "approved"),
  ]);
  if (lessonError || ruleError) return { ok: false, users: users.length, queued: 0, error: "Learning context unavailable" };
  const personalOwners = new Set([...(knownLessons ?? []), ...(knownRules ?? [])].map((row) => row.user_id));
  // Market hours are per symbol: weekend close stops FX/metals but not crypto.
  const now = new Date();
  const pairs = [...new Set(users.flatMap((u) => u.symbols.filter((s) => !marketClosed(s, now)).map((s) => `${s}|${u.timeframe}`)))].slice(0, 12);
  if (!pairs.length) {
    // Say why nothing happens (once every 6 hours per user) instead of staying silent all weekend.
    const since = new Date(Date.now() - 6 * 3600_000).toISOString();
    for (const u of users) {
      const { data: last } = await db.from("autopilot_events").select("id").eq("user_id", u.user_id).eq("action", "skipped").like("detail", "Market closed%").gte("created_at", since).limit(1);
      if (!last?.length) await db.from("autopilot_events").insert({ user_id: u.user_id, symbol: "-", action: "skipped", detail: "Market closed - Auto-Pilot resumes when gold/FX reopen (Sunday 22:00 UTC)" });
    }
    return { ok: true, users: 0, queued: 0, closed: true };
  }
  const results = new Map<string, Awaited<ReturnType<typeof runAI>> | null>();
  const news = new Map<string, boolean>();
  const firstUser = users[0];
  if (!firstUser) return { ok: true, users: 0, queued: 0 };
  const owner = firstUser.user_id;
  await Promise.all(pairs.map(async (k) => {
    const [sym = "", tf = "H1"] = k.split("|");
    try {
      if (users.some((u) => !personalOwners.has(u.user_id) && u.symbols.includes(sym) && u.timeframe === tf)) {
        let r = await getCached(db, sym, tf);
        if (!r) {
          r = await runAI(db, sym, tf, null, null);
          await db.from("analyses").insert({ user_id: owner, symbol: sym, timeframe: tf, direction: r.direction, confidence: Math.round(r.confidence), entry: r.entry, stop_loss: r.stop_loss, take_profit: r.take_profit, summary: r.summary, shared: true });
        }
        results.set(k, r);
      }
    } catch (e) { console.error("autopilot analysis", k, e); results.set(k, null); }
    // Calendar failure must not read as "no news": treat it as news nearby (blocks when avoid_news is on).
    if (!news.has(sym)) news.set(sym, await newsNearby(sym).catch(() => true));
  }));

  const { riskCheck, brokerDollarsPerPrice } = await import("@/lib/risk-engine");
  const atrOf = (bc: { h: number; l: number; c: number }[] | null) => {
    if (!bc || bc.length < 2) return null;
    let t = 0; for (let i = 1; i < bc.length; i++) t += Math.max(bc[i]!.h - bc[i]!.l, Math.abs(bc[i]!.h - bc[i - 1]!.c), Math.abs(bc[i]!.l - bc[i - 1]!.c));
    return t / (bc.length - 1);
  };
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const dayIso = dayStart.toISOString();
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  let queued = 0, lost = false;
  for (const u of users) {
    if (lost) break;
    const log = (symbol: string, action: string, detail: string) => db.from("autopilot_events").insert({ user_id: u.user_id, symbol, action, detail });
    const { data: accounts } = await db.from("trading_accounts").select("id,last_seen_at,balance,protocol_version,margin_mode").eq("user_id", u.user_id).eq("auto_trading", true);
    const live = (accounts ?? []).filter((a) => a.last_seen_at && Date.now() - new Date(a.last_seen_at).getTime() < 5 * 60_000);
    if (!live.length) { await log("-", "skipped", "No connected account with auto trading on"); continue; }
    const ids = live.map((a) => a.id);
    const [{ data: open }, { data: cmds }, { data: deals }, { data: qrows }] = await Promise.all([
      db.from("trades").select("account_id,symbol,closed_at").in("account_id", ids).eq("status", "open"),
      // Every unfinished command counts, including ones queued on a previous day.
      db.from("trade_commands").select("account_id,payload,created_at,status,filled_count").in("account_id", ids).eq("command", "open_trade").or(`created_at.gte.${dayIso},status.in.(queued,sent,unknown)`),
      db.from("trade_deals").select("account_id,profit,closed_at,kind").in("account_id", ids).gte("closed_at", dayIso).order("closed_at", { ascending: false }),
      db.from("broker_quotes").select("*").in("account_id", ids),
    ]);
    const lastClose = deals?.find((d) => d.kind !== "entry_fee")?.closed_at;
    const userPnl = dayPnlFromDeals(deals ?? [], dayIso);
    const pause = pauseReason(lastClose ? (Date.now() - new Date(lastClose).getTime()) / 60_000 : null, Number(u.cooldown_minutes ?? 0), userPnl, Number(u.daily_target_usd ?? 0));
    if (pause) { await log("-", "skipped", pause); continue; }
    const quotes = qrows ?? [];
    const pending = (cmds ?? []).filter((c) => ["queued", "sent", "unknown"].includes(c.status));
    const autoToday = (cmds ?? []).filter((c) => (c.payload as { autopilot?: boolean })?.autopilot && c.created_at >= dayIso && !["failed", "expired"].includes(c.status));
    const personal = personalOwners.has(u.user_id);
    const added = new Map<string, { total: number; syms: Set<string> }>();
    for (const sym of u.symbols) {
      if (marketClosed(sym, now)) { await log(sym, "skipped", "Market closed for this symbol"); continue; }
      let r: Awaited<ReturnType<typeof runAI>> | null = null;
      try {
        r = await selectAutopilotAnalysis(u.user_id, personal, {
          shared: async () => results.get(`${sym}|${u.timeframe}`) ?? null,
          cachedPersonal: (uid) => getPersonalCached(db, sym, u.timeframe, uid),
          freshPersonal: async (uid) => {
            const value = await runAI(db, sym, u.timeframe, null, uid, live[0]?.id);
            const { error } = await db.from("analyses").insert({ user_id: uid, symbol: sym, timeframe: u.timeframe, ...value, confidence: Math.round(value.confidence), shared: false });
            if (error) throw error;
            return value;
          },
        });
      } catch (e) { console.error("personal autopilot analysis", e); }
      if (!r) { await log(sym, "error", "Analysis unavailable"); continue; }
      const rows: Database["public"]["Tables"]["trade_commands"]["Insert"][] = [];
      const decisionIds: string[] = [];
      let reason = "";
      for (const acc of live) {
        const mine = added.get(acc.id) ?? { total: 0, syms: new Set<string>() };
        const pend = pending.filter((c) => c.account_id === acc.id);
        const symPend = pend.filter((c) => (c.payload as { symbol?: string }).symbol === sym);
        const st = {
          openTotal: (open ?? []).filter((t) => t.account_id === acc.id).length + reservedExecutions(pend) + mine.total,
          openOnSymbol: (open ?? []).filter((t) => t.account_id === acc.id && t.symbol.toUpperCase().startsWith(sym.toUpperCase())).length + reservedExecutions(symPend) + (mine.syms.has(sym) ? 1 : 0),
          todayCount: autoToday.filter((c) => c.account_id === acc.id).reduce((s, c) => s + executionsOf(c.payload), 0) + mine.total,
          recentOnSymbol: autoToday.some((c) => c.account_id === acc.id && c.created_at >= hourAgo && (c.payload as { symbol?: string }).symbol === sym),
          newsNearby: !!news.get(sym), avoidNews: u.avoid_news,
        };
        let why = skipReason(r, u, st);
        if (!why && (acc.protocol_version ?? 0) < MIN_PROTOCOL_FOR_AUTOPILOT) why = "EA is too old for automatic trading - install EA 1.40";
        if (!why && acc.margin_mode === "netting") why = "Netting accounts are not supported for automatic trading";
        const q = quotes.find((x) => x.account_id === acc.id && x.symbol === sym);
        if (!why && sessionBlocked(q, Date.now())) why = "Broker trading session is closed for this symbol";
        const bc = await brokerCandles(db, sym, u.timeframe, 40, acc.id).catch(() => null);
        const accPnl = dayPnlFromDeals((deals ?? []).filter((t) => t.account_id === acc.id), dayIso);
        const priceAt = q?.quote_time ?? q?.updated_at;
        const verdict = why ? { allow: false, reason: why, execPrice: null as number | null } : riskCheck(r, {
          price: q?.bid ?? null, ask: q?.ask ?? null, priceAgeSec: priceAt ? (Date.now() - new Date(priceAt).getTime()) / 1000 : null,
          spreadPrice: q?.bid != null && q?.ask != null ? q.ask - q.bid : null, atr: atrOf(bc),
          balance: acc.balance ?? null, lot: Number(u.lot_size), dollarsPerPricePerLot: brokerDollarsPerPrice(q?.tick_value, q?.point),
          dayPnl: accPnl, maxDailyLossPct: Number(u.max_daily_loss_pct ?? 5), maxRiskPct: Number(u.max_risk_pct ?? 5), requireFreshPrice: true,
          lotSpec: { min: q?.min_lot ?? null, max: q?.max_lot ?? null, step: q?.lot_step ?? null },
        });
        const mode = u.shadow_mode ? "shadow" : "live";
        const { data: dec } = await db.from("decision_log").insert({ user_id: u.user_id, account_id: acc.id, symbol: sym, timeframe: u.timeframe, data_source: bc ? "broker" : "yahoo", ai_direction: r.direction, ai_confidence: Math.round(r.confidence), entry: r.entry, stop_loss: r.stop_loss, take_profit: r.take_profit, risk_verdict: verdict.allow ? "approved" : "rejected", risk_reason: verdict.reason, model: GEMINI_MODEL, prompt_version: PROMPT_VERSION, exec_price: verdict.execPrice ?? null, mode }).select("id").single();
        if (!verdict.allow) { reason = verdict.reason; continue; }
        mine.total++; mine.syms.add(sym); added.set(acc.id, mine);
        if (u.shadow_mode) { reason = "Shadow mode: decision recorded, no order sent"; continue; }
        if (dec?.id) decisionIds.push(dec.id);
        rows.push({ user_id: u.user_id, account_id: acc.id, command: "open_trade", payload: { symbol: sym, side: r.direction, order_type: "market", lot: Number(u.lot_size), sl: r.stop_loss, tp: r.take_profit, count: 1, delay_seconds: 0, autopilot: true, guard: true, decision_id: dec?.id ?? null } });
      }
      if (rows.length) {
        // Never create orders after losing the lease: another cycle may already be acting.
        if (!(await holds())) { lost = true; await log(sym, "error", "Cycle lost its lock - no orders created"); break; }
        const { data: ins, error } = await db.from("trade_commands").insert(rows).select("id,payload");
        if (error) { await log(sym, "error", "Could not queue the order - nothing was sent"); continue; }
        queued += ins?.length ?? 0;
        for (const c of ins ?? []) {
          const did = (c.payload as { decision_id?: string }).decision_id;
          if (did) await db.from("decision_log").update({ command_id: c.id }).eq("id", did);
        }
        await log(sym, "queued", `${r.direction.toUpperCase()} ${u.lot_size} lot · ${r.confidence}% · SL ${r.stop_loss} · TP ${r.take_profit} — waiting for broker confirmation`);
      } else await log(sym, u.shadow_mode && reason.startsWith("Shadow") ? "shadow" : "skipped", `${r.direction.toUpperCase()} ${r.confidence}% — ${reason}`);
    }
  }
  return { ok: true, users: users.length, queued, lostLease: lost };
}
