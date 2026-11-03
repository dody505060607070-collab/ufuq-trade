import { SINGLE_AI_CALL } from "@/lib/autopilot";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  ASSETS, EXCLUDED_ASSETS, trendOf, SCAN_MIN_SCORE, alignToFill, assetSpec, exitOnBars, fillPrice, group, liquidated, pnl, quoteToUsd, rollovers, scanAsset, supervise,
  type AssetSpec, type Bar, type OpenPos, type ScanResult, type ScanTf, type SimTrade,
} from "@/lib/challenge";

import { STRATEGY_VERSION, buildEvidence, checklistVerdict, preTradeChecklist, reviewTrade, thesisBroken, type Checklist } from "@/lib/evidence";
import { gradePath } from "@/lib/hindsight";
import { timeMachine, tmBlocks, tmLine } from "@/lib/timemachine";

/**
 * Free demo challenge cycle (paper only): writes sim_* tables, never trade_commands or real accounts.
 * Agent 1 Scanner (code multi-timeframe scan + Gemini proposal) → Agent 2 Reviewer (separate Gemini call)
 * → Agent 3 Supervisor (deterministic risk code, final veto) → simulator fill.
 */
type DB = SupabaseClient<Database>;
type Market = { spec: AssetSpec; mid: number | null; fresh: boolean; src: string; ageMin: number | null; tf: Partial<Record<ScanTf | "M1", Bar[]>>; m5: Bar[]; error?: string };
type TradeRow = Database["public"]["Tables"]["sim_trades"]["Row"];

const AI_CANDIDATES_PER_CYCLE = 1; // one AI analysis per cycle to save credits
const LOCK_MIN = 4;

function byDay(bars: Bar[]): Bar[] {
  const m = new Map<number, Bar[]>();
  for (const b of bars) { const d = Math.floor(b.t / 86400); (m.get(d) ?? m.set(d, []).get(d)!).push(b); }
  return [...m.values()].map((g) => ({ t: g[0]!.t, o: g[0]!.o, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)), c: g[g.length - 1]!.c }));
}

async function loadMarket(db: DB, spec: AssetSpec): Promise<Market> {
  const { fetchChart } = await import("@/lib/market.server");
  try {
    // One bounded retry per source call; a second failure excludes the asset for this cycle only.
    const get = (i: string, r: string) => fetchChart(spec.yahoo, i, r).catch(async () => { await new Promise((ok) => setTimeout(ok, 800)); return fetchChart(spec.yahoo, i, r); });
    const [m5, h1] = await Promise.all([get("5m", "5d"), get("60m", "6mo")]);
    const tf: Market["tf"] = { M5: m5.bars.slice(-120), M15: group(m5.bars, 3).slice(-120), M30: group(m5.bars, 6).slice(-120), H1: h1.bars.slice(-200), H4: group(h1.bars, 4).slice(-120), D1: byDay(h1.bars).slice(-120) };
    let mid: number | null = null, src = "none", ageMin: number | null = null;
    const { data: bq } = await db.from("broker_quotes").select("bid,ask,updated_at").eq("symbol", spec.symbol).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (bq?.bid && bq?.ask && Date.now() - new Date(bq.updated_at).getTime() < 3 * 60_000) { mid = (Number(bq.bid) + Number(bq.ask)) / 2; src = "broker live quote"; ageMin = (Date.now() - new Date(bq.updated_at).getTime()) / 60_000; }
    else if (m5.price && m5.time) { ageMin = (Date.now() / 1000 - m5.time) / 60; mid = m5.price; src = `Yahoo (${Math.round(ageMin)} min old)`; }
    const fresh = mid != null && ageMin != null && ageMin < 20;
    return { spec, mid, fresh, src, ageMin, tf, m5: m5.bars };
  } catch (e) {
    return { spec, mid: null, fresh: false, src: "none", ageMin: null, tf: {}, m5: [], error: (e as Error).message.slice(0, 120) };
  }
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]!); } }));
  return out;
}

export async function runSimChallenges(db: DB) {
  const { data: chs } = await db.from("sim_challenges").select("*").in("status", ["running", "paused", "stopped"]);
  const list = (chs ?? []).filter((c) => c.status !== "stopped" || !c.ended_at);
  if (!list.length) return { sims: 0 };
  const markets = await pool(ASSETS, 6, (a) => loadMarket(db, a));
  const M = new Map(markets.map((m) => [m.spec.symbol, m]));
  const mids: Record<string, number | undefined> = Object.fromEntries(markets.filter((m) => m.mid != null).map((m) => [m.spec.symbol, m.mid!]));
  let opened = 0;
  console.log(`[sim] cycle start ${new Date().toISOString()} challenges=${list.length} fresh_assets=${markets.filter((m) => m.fresh).length}`);
  for (const c of list) opened += await runOne(db, c, M, mids).catch(async (e) => {
    await db.from("sim_events").insert({ challenge_id: c.id, user_id: c.user_id, action: "error", detail: `Cycle failed: ${(e as Error).message}`.slice(0, 300) });
    await db.from("sim_challenges").update({ lock_until: null, last_error: (e as Error).message.slice(0, 300), last_error_at: new Date().toISOString(), consecutive_failures: c.consecutive_failures + 1 }).eq("id", c.id);
    return 0;
  });
  console.log(`[sim] cycle end ${new Date().toISOString()} opened=${opened}`);
  return { sims: list.length, opened, assets: markets.filter((m) => m.fresh).length };
}

/** Close every open demo trade at the current price immediately (emergency stop; no AI). */
export async function closeAllNow(db: DB, challengeId: string, reason: string) {
  const { data: c } = await db.from("sim_challenges").select("*").eq("id", challengeId).maybeSingle();
  if (!c) return 0;
  const { data: open } = await db.from("sim_trades").select("*").eq("challenge_id", c.id).eq("status", "open");
  const symbols = [...new Set((open ?? []).map((t) => t.symbol)), "USDJPY", "USDCHF", "EURUSD", "GBPUSD"];
  const markets = await pool(symbols.map((s) => assetSpec(s)).filter((x): x is AssetSpec => !!x), 4, (a) => loadMarket(db, a));
  const M = new Map(markets.map((m) => [m.spec.symbol, m]));
  const mids: Record<string, number | undefined> = Object.fromEntries(markets.filter((m) => m.mid != null).map((m) => [m.spec.symbol, m.mid!]));
  let balance = Number(c.balance), fees = Number(c.fees_paid), n = 0;
  const now = new Date().toISOString();
  for (const t of open ?? []) {
    const spec = assetSpec(t.symbol), m = M.get(t.symbol);
    const mid = m?.mid ?? (t.last_price != null ? Number(t.last_price) : null);
    if (!spec || mid == null) continue;
    const price = fillPrice(t.side as "buy" | "sell", mid, spec, true);
    const p = pnl(t as unknown as SimTrade, price, spec, quoteToUsd(spec, mids, mid) ?? 1) - Number(t.swap);
    balance += p; fees += Number(t.fees); n++;
    await db.from("sim_trades").update({ status: "closed", exit_price: price, profit: Math.round(p * 100) / 100, close_reason: reason, closed_at: now, float_pnl: null }).eq("id", t.id);
    await db.from("sim_events").insert({ challenge_id: c.id, user_id: c.user_id, action: "closed", detail: `${t.symbol} ${t.side.toUpperCase()} ${t.lot} @ ${price} · ${reason} · ${p >= 0 ? "+" : ""}$${p.toFixed(2)}${m?.mid == null ? " (last known price)" : ""}` });
  }
  await db.from("sim_challenges").update({ balance: Math.round(balance * 100) / 100, equity: Math.round(balance * 100) / 100, fees_paid: fees, ended_at: c.status === "stopped" ? now : c.ended_at, updated_at: now }).eq("id", c.id);
  return n;
}

async function runOne(db: DB, c: Database["public"]["Tables"]["sim_challenges"]["Row"], M: Map<string, Market>, mids: Record<string, number | undefined>): Promise<number> {
  const startedAt = new Date();
  const now = startedAt.toISOString();
  // Concurrency guard: only one cycle per challenge at a time.
  const { data: claimed } = await db.from("sim_challenges").update({ lock_until: new Date(Date.now() + LOCK_MIN * 60_000).toISOString(), cycle_started_at: now })
    .eq("id", c.id).or(`lock_until.is.null,lock_until.lt.${now}`).select("id");
  if (!claimed?.length) return 0;
  const log = (action: string, detail: string) => db.from("sim_events").insert({ challenge_id: c.id, user_id: c.user_id, action, detail: detail.slice(0, 500) });

  let balance = Number(c.balance), fees = Number(c.fees_paid);
  const sinceSec = Math.floor(new Date(c.last_cycle_at ?? c.started_at).getTime() / 1000);
  const { data: openRows } = await db.from("sim_trades").select("*").eq("challenge_id", c.id).eq("status", "open");
  const close = async (t: TradeRow, price: number, reason: string, conv: number) => {
    const p = pnl(t as unknown as SimTrade, price, assetSpec(t.symbol)!, conv) - Number(t.swap);
    balance += p; fees += Number(t.fees);
    await db.from("sim_trades").update({ status: "closed", exit_price: price, profit: Math.round(p * 100) / 100, close_reason: reason, closed_at: now, float_pnl: null }).eq("id", t.id);
    await log("closed", `${t.symbol} ${t.side.toUpperCase()} ${t.lot} @ ${price} · ${reason} · ${p >= 0 ? "+" : ""}$${p.toFixed(2)}`);
    await writeReview(db, t, p, reason);
  };

  // 1) Manage open positions on every asset (stop/target on M5 bars since the last cycle, swap, mark-to-market).
  let remaining: { t: TradeRow; float: number }[] = [];
  for (const t of openRows ?? []) {
    const spec = assetSpec(t.symbol), m = M.get(t.symbol);
    if (!spec || !m?.mid || !m.fresh) {
      if (c.status === "stopped") { await log("waiting", `${t.symbol}: no live price — emergency close waits for the market`); }
      remaining.push({ t, float: Number(t.float_pnl ?? 0) }); continue;
    }
    const conv = quoteToUsd(spec, mids, m.mid) ?? 1;
    const nights = rollovers(new Date(c.last_cycle_at ?? t.opened_at).getTime(), startedAt.getTime());
    if (nights > 0) t.swap = Number(t.swap) + nights * spec.swapPerLotNight * Number(t.lot) * conv;
    const from = Math.max(sinceSec, Math.floor(new Date(t.opened_at).getTime() / 1000)) - 300;
    const hit = exitOnBars(t as unknown as SimTrade, m.m5.filter((b) => b.t >= from));
    const broken = c.use_evidence ? thesisBroken(t.side as "buy" | "sell", { H1: m.tf.H1 ? trendOf(m.tf.H1) : null, H4: m.tf.H4 ? trendOf(m.tf.H4) : null }) : null;
    if (c.status === "stopped") await close(t, fillPrice(t.side as "buy" | "sell", m.mid, spec, true), "emergency stop", conv);
    else if (hit) await close(t, hit.price, hit.reason, conv);
    else if (broken) { await log("thesis", `${t.symbol}: ${broken} — closing early`); await close(t, fillPrice(t.side as "buy" | "sell", m.mid, spec, true), "thesis invalidated", conv); }
    else {
      const float = pnl(t as unknown as SimTrade, fillPrice(t.side as "buy" | "sell", m.mid, spec, true), spec, conv) - Number(t.swap);
      await db.from("sim_trades").update({ float_pnl: Math.round(float * 100) / 100, last_price: m.mid, swap: t.swap, last_check: `${now.slice(11, 16)} UTC · thesis intact · stop/target unchanged` }).eq("id", t.id);
      remaining.push({ t, float });
    }
  }
  const used = () => remaining.reduce((s, r) => s + Number(r.t.margin), 0);
  if (remaining.length && liquidated(balance + remaining.reduce((s, r) => s + r.float, 0), used())) {
    for (const r of remaining) { const spec = assetSpec(r.t.symbol)!, m = M.get(r.t.symbol); const mid = m?.mid ?? Number(r.t.last_price ?? r.t.entry); await close(r.t, fillPrice(r.t.side as "buy" | "sell", mid, spec, true), "margin stop-out", quoteToUsd(spec, mids, mid) ?? 1); }
    remaining = [];
  }
  let equity = balance + remaining.reduce((s, r) => s + r.float, 0);
  const peak = Math.max(Number(c.peak_equity), equity);
  const upd: Database["public"]["Tables"]["sim_challenges"]["Update"] = {};
  if (c.status === "stopped") { upd.ended_at = now; upd.stop_reason = c.stop_reason ?? "Stopped by user"; }
  else if (equity < 1) { upd.status = "failed"; upd.ended_at = now; upd.stop_reason = "Demo balance wiped out"; await log("failed", "Demo balance wiped out"); }
  else if (equity >= Number(c.target_balance)) { upd.status = "completed"; upd.ended_at = now; upd.stop_reason = "Target reached"; await log("completed", "Demo target reached"); }
  else if (c.status === "running" && peak > 0 && ((peak - equity) / peak) * 100 >= Number(c.max_drawdown_pct)) {
    upd.status = "paused"; upd.stop_reason = `Drawdown limit ${c.max_drawdown_pct}% reached — new trades blocked until you review and resume`; await log("halted", upd.stop_reason);
  }

  // 2) Agent 1 scans every asset with a fresh price.
  const scan: { symbol: string; status: string; price: number | null; src: string; score?: number; direction?: string | null; tradeTf?: string; trends?: unknown; reason: string }[] = [];
  const results: ScanResult[] = [];
  for (const m of M.values()) {
    if (!m.fresh || m.mid == null) { scan.push({ symbol: m.spec.symbol, status: "excluded", price: m.mid, src: m.src, reason: m.error ? `Price source error: ${m.error}` : "No fresh price (market closed or delayed)" }); continue; }
    const r = scanAsset(m.spec.symbol, m.mid, m.tf, m.spec);
    results.push(r);
    scan.push({ symbol: m.spec.symbol, status: "scanned", price: m.mid, src: m.src, score: r.score, direction: r.direction, tradeTf: r.tradeTf, trends: r.trends, reason: r.reason });
  }
  for (const [s, why] of Object.entries(EXCLUDED_ASSETS)) scan.push({ symbol: s, status: "excluded", price: null, src: "—", reason: why });
  const agents: { scanner: string; reviewer: string; supervisor: string } = { scanner: "idle", reviewer: "idle", supervisor: "idle" };
  let opened = 0;

  if (c.status === "running" && !upd.status) {
    agents.scanner = `scanned ${results.length} assets`;
    const openSyms = new Set(remaining.map((r) => r.t.symbol));
    const cands = results.filter((r) => r.direction && r.score >= SCAN_MIN_SCORE && !openSyms.has(r.symbol)).sort((a, b) => b.score - a.score).slice(0, AI_CANDIDATES_PER_CYCLE);
    if (!cands.length) await log("waiting", `Scanned ${results.length} assets · no setup with score ≥ ${SCAN_MIN_SCORE} (best: ${results.sort((a, b) => b.score - a.score)[0]?.symbol ?? "—"} ${results[0]?.score ?? 0})`);
    const { getCached, runAI, verifyTrade, debateTrade, newsNearby } = await import("@/lib/analysis.server");
    let headlines: string[] | null = null;
    const { MIN_CONFIDENCE_FLOOR } = await import("@/lib/autopilot");
    const floor = Math.max(MIN_CONFIDENCE_FLOOR, 65);
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const { data: today } = await db.from("sim_trades").select("profit").eq("challenge_id", c.id).eq("status", "closed").gte("closed_at", startOfDay.toISOString());
    const dayPnl = (today ?? []).reduce((s, x) => s + Number(x.profit ?? 0), 0);

    for (const r of cands) {
      const m = M.get(r.symbol)!, spec = m.spec, mid = m.mid!;
      const scanner: { ai?: unknown; [k: string]: unknown } = { score: r.score, trends: r.trends, reason: r.reason, atr: r.atr, rsi: r.rsi, tradeTf: r.tradeTf, price: mid, src: m.src };
      let extraCols: { evidence?: unknown; checklist?: unknown; debate?: unknown; plan?: { e: number; sl: number; tp: number } } = {};
      const record = (outcome: Database["public"]["Tables"]["sim_decisions"]["Insert"]["outcome"], extra: { reviewer?: unknown; supervisor?: unknown }) =>
        db.from("sim_decisions").insert({ challenge_id: c.id, user_id: c.user_id, symbol: r.symbol, timeframe: r.tradeTf, direction: r.direction!, scanner_score: r.score, scanner: scanner as Json, reviewer: (extra.reviewer ?? null) as Json, supervisor: (extra.supervisor ?? null) as Json, outcome,
          evidence: (extraCols.evidence ?? null) as Json, checklist: (extraCols.checklist ?? null) as Json, debate: (extraCols.debate ?? null) as Json, strategy_version: c.use_evidence ? STRATEGY_VERSION : "mtf-v0", plan_entry: extraCols.plan?.e ?? null, plan_sl: extraCols.plan?.sl ?? null, plan_tp: extraCols.plan?.tp ?? null }).select("id").single();
      // News gate (before any AI call): high-impact news for the symbol, or oil's own EIA/OPEC reports.
      const blockEv = await newsNearby(r.symbol).catch(() => null);
      if (blockEv) { await record("waiting", {}); await log("waiting", `News · ${r.symbol} — waiting for "${blockEv.title}" (${blockEv.impact}) at ${blockEv.date.slice(11, 16)} UTC`); continue; }
      // Agent 1 (AI part): Gemini must propose the same direction with levels.
      let ai = await getCached(db, r.symbol, r.tradeTf).catch(() => null);
      if (!ai) {
        try { ai = await runAI(db, r.symbol, r.tradeTf, null); await db.from("analyses").insert({ user_id: c.user_id, symbol: r.symbol, timeframe: r.tradeTf, direction: ai.direction, confidence: Math.round(ai.confidence), entry: ai.entry, stop_loss: ai.stop_loss, take_profit: ai.take_profit, summary: ai.summary, summary_ar: ai.summary_ar ?? null }); }
        catch (e) { scanner.ai = `unavailable: ${(e as Error).message}`; agents.scanner = "AI unavailable"; await record("error", {}); await log("error", `${r.symbol}: scanner AI unavailable — ${(e as Error).message}`); continue; }
      }
      scanner.ai = { direction: ai.direction, confidence: ai.confidence, entry: ai.entry, stop: ai.stop_loss, target: ai.take_profit, summary: ai.summary.slice(0, 400) };
      if (ai.direction !== r.direction || ai.confidence < floor || ai.entry == null || ai.stop_loss == null || ai.take_profit == null) {
        await record("rejected_scanner", {}); await log("rejected", `Scanner · ${r.symbol} ${r.direction!.toUpperCase()} score ${r.score} · AI says ${ai.direction.toUpperCase()} ${ai.confidence}% — not proposed`); continue;
      }
      const prop = { ...ai, ...alignToFill(r.direction!, mid, spec, { entry: ai.entry, stop_loss: ai.stop_loss, take_profit: ai.take_profit }) };
      extraCols.plan = { e: mid, sl: prop.stop_loss, tp: prop.take_profit };
      // Agent 2: independent review (separate Gemini call with the scanner's data, costs and current exposure).
      agents.reviewer = "reviewing";
      const exposure = remaining.map((x) => `${x.t.symbol} ${x.t.side}`).join(", ") || "none";
      const brief = `${ai.summary}\n\nScanner data — trends ${JSON.stringify(r.trends)}, score ${r.score}, RSI ${r.rsi?.toFixed(0)}, ATR ${r.atr}. Price source ${m.src}. Costs: spread ${spec.spread}, slippage ${spec.slippage}, commission $${spec.commissionPerLot}/lot. Max leverage 1:${spec.maxLeverage}. Open demo positions: ${exposure}. Reject if data is stale, the signal is late or weak, or exposure is correlated.`;
      let v: { agree: boolean; confidence: number; reason: string };
      let reviewer: Record<string, unknown>;
      if (SINGLE_AI_CALL) {
        v = { agree: true, confidence: ai.confidence, reason: "single analysis (credit saver)" };
        reviewer = { decision: "approve", confidence: ai.confidence, reason: "Second AI call disabled to save credits; code supervisor still decides", model: "none" };
      } else if (c.use_evidence) {
        // TradingAgents-style: code tools → evidence report → bull/bear/manager debate → code checklist.
        headlines ??= await import("@/lib/market.server").then((x) => x.fetchNews(25)).then((n) => n.map((i) => i.title)).catch(() => []);
        const ev = buildEvidence({ symbol: r.symbol, dir: r.direction!, m15: m.tf.M15 ?? [], h1: m.tf.H1 ?? [], headlines });
        const d = await debateTrade(r.symbol, r.tradeTf, prop, ev.text, brief, mid);
        const rr = Math.abs(prop.take_profit - mid) / Math.abs(mid - prop.stop_loss);
        const cl: Checklist = preTradeChecklist({ trends: r.trends, dir: r.direction!, priceAgeMin: m.ageMin, ev, rr, costShare: r.costShare, debate: d });
        const verdict = checklistVerdict(cl);
        extraCols = { ...extraCols, evidence: ev, checklist: cl, debate: d };
        reviewer = { decision: d.decision, confidence: d.confidence, reason: d.reason, checklist: verdict, model: `Google Gemini ${d.model}`, roles: "bull + bear + research manager in one call" };
        if (verdict.decision !== "accept") { await record(verdict.decision === "wait" ? "waiting" : "rejected_checklist", { reviewer }); await log(verdict.decision === "wait" ? "waiting" : "rejected", `Checklist · ${r.symbol} ${r.direction!.toUpperCase()} — ${verdict.decision}: ${verdict.reason}`); agents.reviewer = `checklist ${verdict.decision}`; continue; }
        v = { agree: d.decision === "accept", confidence: d.confidence, reason: `${d.reason} | Bear: ${d.bear.join("; ")}` };
      } else {
        v = await verifyTrade(r.symbol, r.tradeTf, { ...prop, summary: brief }, mid);
        reviewer = { decision: v.confidence === 0 && !v.agree ? "needs_info" : v.agree ? "approve" : "reject", confidence: v.confidence, reason: v.reason, model: "Google Gemini (second call)" };
      }
      agents.reviewer = String(reviewer["decision"]);
      const combined = Math.round((ai.confidence + v.confidence) / 2);
      if (!v.agree || combined < floor) { await record("rejected_reviewer", { reviewer }); await log("rejected", `Reviewer · ${r.symbol} ${r.direction!.toUpperCase()} — ${String(reviewer["decision"])} (${v.confidence}%): ${v.reason}`.slice(0, 480)); continue; }
      // Time Machine (no AI call): replay the next 4h from 60 days of this asset's own M5 bars; veto only when strongly toward the stop.
      const tm = await import("@/lib/market.server").then((x) => x.fetchM5History(spec.yahoo)).then((bars) => timeMachine({ side: r.direction!, entry: mid, sl: prop.stop_loss, tp: prop.take_profit, bars, now: Math.floor(Date.now() / 1000) })).catch(() => null);
      scanner.timemachine = tm ? { ...tm, line: tmLine(tm) } : "unavailable";
      if (tmBlocks(tm)) { await record("rejected_checklist", { reviewer }); await log("rejected", `${r.symbol} ${r.direction!.toUpperCase()} — replays point strongly to the stop — not opened · ${tmLine(tm!)}`.slice(0, 480)); continue; }
      // Agent 3: deterministic risk & execution supervisor (final veto).
      const conv = quoteToUsd(spec, mids, mid);
      const { data: last } = await db.from("sim_trades").select("opened_at").eq("challenge_id", c.id).eq("symbol", r.symbol).eq("side", r.direction!).order("opened_at", { ascending: false }).limit(1).maybeSingle();
      const sup = conv == null ? { allow: false, reason: `No ${spec.quote}→USD rate to value the trade` } : supervise({
        spec, side: r.direction!, mid, sl: prop.stop_loss, tp: prop.take_profit, conv, equity, balance, peak, dayPnl,
        open: remaining.map((x): OpenPos => ({ symbol: x.t.symbol, side: x.t.side as "buy" | "sell", risk_usd: Number(x.t.risk_usd ?? 0), margin: Number(x.t.margin), opened_at: x.t.opened_at })),
        recentSameSignalMin: last ? (Date.now() - new Date(last.opened_at).getTime()) / 60_000 : null,
        limits: { riskPct: Number(c.max_risk_pct), maxTotalRiskPct: Number(c.max_total_risk_pct), maxDailyLossPct: Number(c.max_daily_loss_pct), maxDrawdownPct: Number(c.max_drawdown_pct), maxOpen: c.max_open_trades },
      });
      agents.supervisor = sup.allow ? "approved" : "rejected";
      if (!sup.allow) { await record("rejected_supervisor", { reviewer, supervisor: sup }); await log("rejected", `Supervisor · ${r.symbol} ${r.direction!.toUpperCase()} — ${sup.reason}`); continue; }
      const dec = await record("opened", { reviewer, supervisor: sup });
      const { data: row } = await db.from("sim_trades").insert({
        challenge_id: c.id, user_id: c.user_id, symbol: r.symbol, side: r.direction!, lot: sup.lot!, entry: sup.entry!, stop_loss: prop.stop_loss, take_profit: prop.take_profit,
        margin: sup.margin!, fees: sup.fees!, confidence: combined, reason: ai.summary.slice(0, 500), timeframe: r.tradeTf, leverage: sup.leverage!, risk_usd: sup.risk_usd!, last_price: mid, float_pnl: 0, decision_id: dec.data?.id ?? null, strategy_version: c.use_evidence ? STRATEGY_VERSION : "mtf-v0",
      }).select("*").single();
      if (row) remaining.push({ t: row, float: 0 });
      await log("opened", `${r.symbol} ${r.direction!.toUpperCase()} ${sup.lot} @ ${sup.entry} · SL ${prop.stop_loss.toFixed(5)} · TP ${prop.take_profit.toFixed(5)} · 1:${sup.leverage} · risk $${sup.risk_usd!.toFixed(2)} · ${combined}% · ${m.src}`);
      opened++;
    }
  }

  await gradeDecisions(db, c.id, M).catch(() => null);
  equity = balance + remaining.reduce((s, r) => s + r.float, 0);
  const ended = new Date().toISOString();
  await db.from("sim_challenges").update({
    ...upd, balance: Math.round(balance * 100) / 100, equity: Math.round(equity * 100) / 100, fees_paid: fees, peak_equity: Math.max(peak, equity),
    last_price: M.get(c.symbol)?.mid ?? c.last_price, last_price_at: now, last_cycle_at: ended, updated_at: ended, lock_until: null,
    ...(results.length ? { last_success_at: ended, consecutive_failures: 0, last_error: null } : { last_error: "No fresh price from any market (source down or all markets closed)", last_error_at: ended, consecutive_failures: c.consecutive_failures + 1 }),
    cycles: c.cycles + 1, scanned: c.scanned + results.length,
    last_scan: { started_at: now, ended_at: ended, assets: scan, agents, ai_candidates_per_cycle: AI_CANDIDATES_PER_CYCLE } as unknown as Json,
  }).eq("id", c.id);
  return opened;
}

/** Post-trade review linked to the original decision; judges the process separately from the money result. */
async function writeReview(db: DB, t: TradeRow, profit: number, reason: string) {
  const { data: d } = t.decision_id ? await db.from("sim_decisions").select("checklist,evidence").eq("id", t.decision_id).maybeSingle() : { data: null };
  const ev = d?.evidence as { votes?: { for: number; against: number } } | null;
  const rv = reviewTrade({ profit, risk_usd: Number(t.risk_usd ?? 0), close_reason: reason, checklist: (d?.checklist ?? null) as unknown as Checklist | null, votes: ev?.votes ?? null });
  await db.from("sim_reviews").upsert({ challenge_id: t.challenge_id, user_id: t.user_id, trade_id: t.id, symbol: t.symbol, timeframe: t.timeframe, strategy_version: t.strategy_version, profit: Math.round(profit * 100) / 100, r_multiple: rv.r_multiple, followed_plan: rv.followed_plan, process_score: rv.process_score, outcome_class: rv.outcome_class, lessons: rv.lessons as unknown as Json }, { onConflict: "trade_id" });
}

/** Grade rejected/waiting decisions with only the bars AFTER the decision (what would have happened). */
async function gradeDecisions(db: DB, challengeId: string, M: Map<string, Market>) {
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data } = await db.from("sim_decisions").select("id,symbol,direction,plan_entry,plan_sl,plan_tp,created_at,outcome").eq("challenge_id", challengeId).is("graded_at", null).not("plan_sl", "is", null).lt("created_at", cutoff).limit(20);
  for (const d of data ?? []) {
    const m = M.get(d.symbol); if (!m?.m5.length) continue;
    const from = new Date(d.created_at).getTime() / 1000;
    const g = gradePath(d.direction, Number(d.plan_entry), Number(d.plan_sl), Number(d.plan_tp), m.m5.filter((b) => b.t > from));
    const old = Date.now() / 1000 - from > 24 * 3600;
    if (g.outcome !== "open" || old) await db.from("sim_decisions").update({ hindsight: g.outcome === "open" ? "neither hit in 24h" : g.outcome, graded_at: new Date().toISOString() }).eq("id", d.id);
  }
}
