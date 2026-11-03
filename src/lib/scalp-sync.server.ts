// Builds the fast-scalping lines the website sends to the EA on each sync (S = settings, B = per-symbol bias/block).
// Slow context (AI analysis, news, quiet hours, daily loss) is decided here; entries/exits happen locally in the EA.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SCALP_DEFAULTS, clampParams, scalpLine, type ScalpParams } from "./scalp";
import { inQuietHours, QUIET_REASON } from "./autopilot";

type Db = SupabaseClient<Database>;
const cache = new Map<string, { at: number; lines: string[] }>();
const CACHE_MS = 15_000;

export async function scalpParams(db: Db): Promise<ScalpParams> {
  const { data } = await db.from("app_settings").select("value").eq("key", "scalp_params").maybeSingle();
  const v = (data?.value ?? null) as Partial<ScalpParams> | null;
  return v ? clampParams({ ...SCALP_DEFAULTS, ...v }) : SCALP_DEFAULTS;
}

export async function scalpLines(db: Db, accountId: string): Promise<string[]> {
  const hit = cache.get(accountId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.lines;
  const lines = await build(db, accountId).catch((e) => { console.error("scalp lines", e); return ["S|0||0|0|0|0|0|0|0|0|0|settings unavailable"]; });
  cache.set(accountId, { at: Date.now(), lines });
  return lines;
}

async function build(db: Db, accountId: string): Promise<string[]> {
  const { data: a } = await db.from("trading_accounts").select("id,user_id,fast_scalp,lot_size,balance,ai_provider").eq("id", accountId).maybeSingle();
  if (!a?.fast_scalp) return ["S|0||0|0|0|0|0|0|0|0|0|off"];
  const [{ data: s }, params] = await Promise.all([
    db.from("autopilot_settings").select("symbols,max_daily_loss_pct").eq("user_id", a.user_id).maybeSingle(),
    scalpParams(db),
  ]);
  const symbols = (s?.symbols?.length ? s.symbols : ["XAUUSD"]).slice(0, 6);
  const dayLossUsd = Number(a.balance ?? 0) * Number(s?.max_daily_loss_pct ?? 5) / 100;
  let reason = "";
  if (inQuietHours(new Date())) reason = QUIET_REASON;
  if (!reason && dayLossUsd > 0) {
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    const { data: closed } = await db.from("trades").select("profit").eq("account_id", a.id).eq("status", "closed").gte("closed_at", day.toISOString());
    const pl = (closed ?? []).reduce((x, t) => x + Number(t.profit ?? 0), 0);
    if (pl <= -dayLossUsd) reason = `Daily loss limit reached (${pl.toFixed(2)})`;
  }
  const lines = [scalpLine(!reason, symbols, params, Number(a.lot_size ?? 0.01), dayLossUsd, reason)];
  // Per symbol: AI bias from the account's own AI (last 60 min) and the shared news guard.
  const { newsNearby } = await import("./analysis.server");
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: an } = await db.from("analyses").select("symbol,direction,confidence,provider,created_at").in("symbol", symbols).gte("created_at", since).order("created_at", { ascending: false }).limit(60);
  const prov = a.ai_provider ?? "gemini";
  for (const sym of symbols) {
    const ev = await newsNearby(sym).catch(() => null);
    const last = (an ?? []).find((x) => x.symbol === sym && (x.provider ?? "gemini") === prov);
    const bias = last && (last.direction === "buy" || last.direction === "sell") && Number(last.confidence) >= 60 ? last.direction : "none";
    lines.push(["B", sym, ev ? "block" : bias, ev ? `News: ${String((ev as { title?: string }).title ?? "event").replace(/[|\n\r]/g, " ")}` : ""].join("|"));
  }
  return lines;
}
