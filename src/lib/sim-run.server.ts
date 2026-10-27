import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  ASSETS, EXCLUDED_ASSETS, SCAN_MIN_SCORE, assetSpec, exitOnBars, fillPrice, group, liquidated, pnl, quoteToUsd, rollovers, scanAsset, supervise,
  type AssetSpec, type Bar, type OpenPos, type ScanResult, type ScanTf, type SimTrade,
} from "@/lib/challenge";

/**
 * Free demo challenge cycle (paper only): writes sim_* tables, never trade_commands or real accounts.
 * Agent 1 Scanner (code multi-timeframe scan + Gemini proposal) → Agent 2 Reviewer (separate Gemini call)
 * → Agent 3 Supervisor (deterministic risk code, final veto) → simulator fill.
 */
type DB = SupabaseClient<Database>;
type Market = { spec: AssetSpec; mid: number | null; fresh: boolean; src: string; ageMin: number | null; tf: Partial<Record<ScanTf | "M1", Bar[]>>; m5: Bar[]; error?: string };
type TradeRow = Database["public"]["Tables"]["sim_trades"]["Row"];

const AI_CANDIDATES_PER_CYCLE = 2;
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
    if (c.status === "stopped") await close(t, fillPrice(t.side as "buy" | "sell", m.mid, spec, true), "emergency stop", conv);
    else if (hit) await close(t, hit.price, hit.reason, conv);
    else {
      const float = pnl(t as unknown as SimTrade, fillPrice(t.side as "buy" | "sell", m.mid, spec, true), spec, conv) - Number(t.swap);
      await db.from("sim_trades").update({ float_pnl: Math.round(float * 100) / 100, last_price: m.mid, swap: t.swap }).eq("id", t.id);
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
    const { getCached, runAI, verifyTrade } = await import("@/lib/analysis.server");
    const { MIN_CONFIDENCE_FLOOR } = await import("@/lib/autopilot");
    const floor = Math.max(MIN_CONFIDENCE_FLOOR, 65);
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const { data: today } = await db.from("sim_trades").select("profit").eq("challenge_id", c.id).eq("status", "closed").gte("closed_at", startOfDay.toISOString());
    const dayPnl = (today ?? []).reduce((s, x) => s + Number(x.profit ?? 0), 0);

    for (const r of cands) {
      const m = M.get(r.symbol)!, spec = m.spec, mid = m.mid!;
      const scanner: { ai?: unknown; [k: string]: unknown } = { score: r.score, trends: r.trends, reason: r.reason, atr: r.atr, rsi: r.rsi, tradeTf: r.tradeTf, price: mid, src: m.src };
      const record = (outcome: Database["public"]["Tables"]["sim_decisions"]["Insert"]["outcome"], extra: { reviewer?: unknown; supervisor?: unknown }) =>
        db.from("sim_decisions").insert({ challenge_id: c.id, user_id: c.user_id, symbol: r.symbol, timeframe: r.tradeTf, direction: r.direction!, scanner_score: r.score, scanner: scanner as Json, reviewer: (extra.reviewer ?? null) as Json, supervisor: (extra.supervisor ?? null) as Json, outcome }).select("id").single();
      // Agent 1 (AI part): Gemini must propose the same direction with levels.
      let ai = await getCached(db, r.symbol, r.tradeTf).catch(() => null);
      if (!ai) {
        try { ai = await runAI(db, r.symbol, r.tradeTf, null); await db.from("analyses").insert({ user_id: c.user_id, symbol: r.symbol, timeframe: r.tradeTf, direction: ai.direction, confidence: Math.round(ai.confidence), entry: ai.entry, stop_loss: ai.stop_loss, take_profit: ai.take_profit, summary: ai.summary }); }
        catch (e) { scanner.ai = `unavailable: ${(e as Error).message}`; agents.scanner = "AI unavailable"; await record("error", {}); await log("error", `${r.symbol}: scanner AI unavailable — ${(e as Error).message}`); continue; }
      }
      scanner.ai = { direction: ai.direction, confidence: ai.confidence, entry: ai.entry, stop: ai.stop_loss, target: ai.take_profit, summary: ai.summary.slice(0, 400) };
      if (ai.direction !== r.direction || ai.confidence < floor || ai.entry == null || ai.stop_loss == null || ai.take_profit == null) {
        await record("rejected_scanner", {}); await log("rejected", `Scanner · ${r.symbol} ${r.direction!.toUpperCase()} score ${r.score} · AI says ${ai.direction.toUpperCase()} ${ai.confidence}% — not proposed`); continue;
      }
      const shift = mid - ai.entry;
      const prop = { ...ai, entry: mid, stop_loss: ai.stop_loss + shift, take_profit: ai.take_profit + shift };
      // Agent 2: independent review (separate Gemini call with the scanner's data, costs and current exposure).
      agents.reviewer = "reviewing";
      const exposure = remaining.map((x) => `${x.t.symbol} ${x.t.side}`).join(", ") || "none";
      const brief = `${ai.summary}\n\nScanner data — trends ${JSON.stringify(r.trends)}, score ${r.score}, RSI ${r.rsi?.toFixed(0)}, ATR ${r.atr}. Price source ${m.src}. Costs: spread ${spec.spread}, slippage ${spec.slippage}, commission $${spec.commissionPerLot}/lot. Max leverage 1:${spec.maxLeverage}. Open demo positions: ${exposure}. Reject if data is stale, the signal is late or weak, or exposure is correlated.`;
      const v = await verifyTrade(r.symbol, r.tradeTf, { ...prop, summary: brief }, mid);
      const reviewer = { decision: v.confidence === 0 && !v.agree ? "needs_info" : v.agree ? "approve" : "reject", confidence: v.confidence, reason: v.reason };
      agents.reviewer = reviewer.decision;
      const combined = Math.round((ai.confidence + v.confidence) / 2);
      if (!v.agree || combined < floor) { await record("rejected_reviewer", { reviewer }); await log("rejected", `Reviewer · ${r.symbol} ${r.direction!.toUpperCase()} — ${reviewer.decision} (${v.confidence}%): ${v.reason}`); continue; }
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
        margin: sup.margin!, fees: sup.fees!, confidence: combined, reason: ai.summary.slice(0, 500), timeframe: r.tradeTf, leverage: sup.leverage!, risk_usd: sup.risk_usd!, last_price: mid, float_pnl: 0, decision_id: dec.data?.id ?? null,
      }).select("*").single();
      if (row) remaining.push({ t: row, float: 0 });
      await log("opened", `${r.symbol} ${r.direction!.toUpperCase()} ${sup.lot} @ ${sup.entry} · SL ${prop.stop_loss.toFixed(5)} · TP ${prop.take_profit.toFixed(5)} · 1:${sup.leverage} · risk $${sup.risk_usd!.toFixed(2)} · ${combined}% · ${m.src}`);
      opened++;
    }
  }

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
