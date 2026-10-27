import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { costsFor, openSim, pnl, exitHit, liquidated, fillPrice, type SimTrade } from "@/lib/challenge";

/** One cycle of the free demo challenge. Paper only: writes sim_* tables, never trade_commands or real accounts. */
export async function runSimChallenges(db: SupabaseClient<Database>) {
  const { data: chs } = await db.from("sim_challenges").select("*").in("status", ["running", "paused", "stopped"]);
  const list = (chs ?? []).filter((c) => c.status !== "stopped" || !c.ended_at);
  if (!list.length) return { sims: 0 };
  const { fetchQuote } = await import("@/lib/market.server");
  const { getCached, runAI, verifyTrade, brokerCandles } = await import("@/lib/analysis.server");
  const { riskCheck } = await import("@/lib/risk-engine");
  const { MIN_CONFIDENCE_FLOOR } = await import("@/lib/autopilot");
  const now = new Date().toISOString();
  let opened = 0;
  const bySym = new Map<string, { mid: number | null; fresh: boolean; src: string; high: number; low: number }>();

  for (const c of list) {
    const log = (action: string, detail: string) => db.from("sim_events").insert({ challenge_id: c.id, user_id: c.user_id, action, detail });
    const costs = costsFor(c.symbol);
    if (!bySym.has(c.symbol)) {
      // Prefer the live broker quote the EA reports (read-only market data); else Yahoo, which is ~10 min delayed.
      const { data: bq } = await db.from("broker_quotes").select("bid,ask,updated_at").eq("symbol", c.symbol).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      let mid: number | null = null, fresh = false, src = "none";
      if (bq?.bid && bq?.ask && Date.now() - new Date(bq.updated_at).getTime() < 3 * 60_000) { mid = (Number(bq.bid) + Number(bq.ask)) / 2; fresh = true; src = "broker live quote"; }
      else {
        const { data: ins } = await db.from("instruments").select("yahoo_symbol").eq("symbol", c.symbol).maybeSingle();
        const q = await fetchQuote(c.symbol, ins?.yahoo_symbol ?? "GC=F");
        if (q.price && q.time && Date.now() / 1000 - q.time < 20 * 60) { mid = q.price; fresh = true; src = `Yahoo (delayed ${Math.round((Date.now() / 1000 - q.time) / 60)} min)`; }
      }
      const bars = fresh ? await brokerCandles(db, c.symbol, "M15", 2).catch(() => null) : null;
      const prev = c.last_price != null ? Number(c.last_price) : mid ?? 0;
      bySym.set(c.symbol, { mid, fresh, src, high: Math.max(mid ?? 0, prev, ...(bars ?? []).slice(-1).map((b) => b.h)), low: Math.min(mid ?? Infinity, prev, ...(bars ?? []).slice(-1).map((b) => b.l)) });
    }
    const m = bySym.get(c.symbol)!;
    if (!m.fresh || m.mid == null) { await log("waiting", "No live price (market closed or source down) — nothing simulated this cycle"); await db.from("sim_challenges").update({ last_cycle_at: now }).eq("id", c.id); continue; }
    const mid = m.mid;
    let balance = Number(c.balance), fees = Number(c.fees_paid);
    const { data: openRows } = await db.from("sim_trades").select("*").eq("challenge_id", c.id).eq("status", "open");
    const close = async (t: (typeof openRows extends (infer R)[] | null ? R : never), price: number, reason: string) => {
      const p = pnl(t as unknown as SimTrade, price, costs);
      balance += p; fees += Number(t.fees);
      await db.from("sim_trades").update({ status: "closed", exit_price: price, profit: Math.round(p * 100) / 100, close_reason: reason, closed_at: now }).eq("id", t.id);
      await log("closed", `${t.side.toUpperCase()} ${t.lot} @ ${price.toFixed(2)} · ${reason} · ${p >= 0 ? "+" : ""}$${p.toFixed(2)}`);
    };
    let remaining = [] as NonNullable<typeof openRows>;
    for (const t of openRows ?? []) {
      const hit = exitHit(t as unknown as SimTrade, m.high, m.low);
      if (c.status === "stopped") await close(t, fillPrice(t.side as "buy" | "sell", mid, costs, true), "emergency stop");
      else if (hit) await close(t, hit.price, hit.reason);
      else remaining.push(t);
    }
    const floating = remaining.reduce((s, t) => s + pnl(t as unknown as SimTrade, fillPrice(t.side as "buy" | "sell", mid, costs, true), costs), 0);
    const used = remaining.reduce((s, t) => s + Number(t.margin), 0);
    if (remaining.length && liquidated(balance + floating, used)) {
      for (const t of remaining) await close(t, fillPrice(t.side as "buy" | "sell", mid, costs, true), "margin stop-out");
      remaining = [];
    }
    const equity = balance + remaining.reduce((s, t) => s + pnl(t as unknown as SimTrade, fillPrice(t.side as "buy" | "sell", mid, costs, true), costs), 0);
    const upd: Database["public"]["Tables"]["sim_challenges"]["Update"] = { balance: Math.round(balance * 100) / 100, fees_paid: fees, peak_equity: Math.max(Number(c.peak_equity), equity), last_price: mid, last_price_at: now, last_cycle_at: now, updated_at: now };
    if (c.status === "stopped") { upd.ended_at = now; upd.stop_reason = c.stop_reason ?? "Stopped by user"; }
    else if (equity < 1) { upd.status = "failed"; upd.ended_at = now; upd.stop_reason = "Demo balance wiped out"; await log("failed", "Demo balance wiped out"); }
    else if (equity >= Number(c.target_balance)) { upd.status = "completed"; upd.ended_at = now; upd.stop_reason = "Target reached"; await log("completed", "Demo target reached"); }
    await db.from("sim_challenges").update(upd).eq("id", c.id);
    if (c.status !== "running" || upd.status || remaining.length) continue;

    // Look for a new trade using the shared analysis + the same risk engine and second AI check as Auto-Pilot.
    let r = await getCached(db, c.symbol, c.timeframe).catch(() => null);
    if (!r) {
      try { r = await runAI(db, c.symbol, c.timeframe, null); await db.from("analyses").insert({ user_id: c.user_id, symbol: c.symbol, timeframe: c.timeframe, direction: r.direction, confidence: Math.round(r.confidence), entry: r.entry, stop_loss: r.stop_loss, take_profit: r.take_profit, summary: r.summary }); }
      catch (e) { await log("error", `Analysis unavailable: ${(e as Error).message}`.slice(0, 200)); continue; }
    }
    const floor = Math.max(MIN_CONFIDENCE_FLOOR, 65);
    if (r.direction === "neutral" || r.confidence < floor || r.entry == null || r.stop_loss == null || r.take_profit == null) { await log("waiting", `Price ${mid.toFixed(2)} (${m.src}) · AI ${r.direction.toUpperCase()} ${r.confidence}% — no qualifying setup`); continue; }
    const shift = mid - r.entry;
    const prop = { ...r, entry: mid, stop_loss: r.stop_loss + shift, take_profit: r.take_profit + shift };
    const v0 = riskCheck(prop, { price: mid, spreadPrice: costs.spread, atr: null, balance, lot: 0.01, dollarsPerPricePerLot: costs.contract, dayPnl: 0, maxDailyLossPct: 100, maxRiskPct: Number(c.max_risk_pct) });
    if (!v0.allow) { await log("rejected", `${r.direction.toUpperCase()} ${r.confidence}% — ${v0.reason}`); continue; }
    const v = await verifyTrade(c.symbol, c.timeframe, prop, mid);
    const combined = Math.round((r.confidence + v.confidence) / 2);
    if (!v.agree || combined < floor) { await log("rejected", `AI ${r.direction.toUpperCase()} ${r.confidence}% · second AI check said no (${v.confidence}%): ${v.reason}`.slice(0, 300)); continue; }
    const t = openSim({ side: r.direction as "buy" | "sell", mid, sl: prop.stop_loss, tp: prop.take_profit, equity, freeMargin: equity, riskPct: Number(c.max_risk_pct), leverage: Number(c.leverage), costs });
    if ("error" in t) { await log("rejected", t.error); continue; }
    await db.from("sim_trades").insert({ challenge_id: c.id, user_id: c.user_id, symbol: c.symbol, ...t, confidence: combined, reason: r.summary.slice(0, 500) });
    await log("opened", `${t.side.toUpperCase()} ${t.lot} @ ${t.entry.toFixed(2)} · SL ${t.stop_loss.toFixed(2)} · TP ${t.take_profit.toFixed(2)} · ${combined}% · price ${m.src}`);
    opened++;
  }
  return { sims: list.length, opened };
}
