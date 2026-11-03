import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LAB_SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD"] as const;

/** Evolution Lab run: 7 days of 1-minute bars, evolve on train, choose on validation, test once vs random policies. */
export const runLab = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ symbol: z.enum(LAB_SYMBOLS) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: recent } = await sb.from("lab_runs").select("id").eq("user_id", context.userId).gte("created_at", new Date(Date.now() - 2 * 60_000).toISOString()).limit(1);
    if (recent?.length) throw new Error("One lab run every 2 minutes.");
    const seed = Math.floor(Math.random() * 1_000_000);
    const { data: run, error } = await sb.from("lab_runs").insert({ user_id: context.userId, symbol: data.symbol, seed }).select("id").single();
    if (error || !run) throw new Error("Could not start the run (account approval required).");
    // Results are written by the server only (users can't edit a run), so every number shown is a real run.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const { data: inst } = await sb.from("instruments").select("yahoo_symbol").eq("symbol", data.symbol).maybeSingle();
      if (!inst?.yahoo_symbol) throw new Error("No price source for this market");
      const { fetchChart } = await import("./market.server");
      const { bars } = await fetchChart(inst.yahoo_symbol, "1m", "7d");
      const done = bars.slice(0, -1);
      if (done.length < 1500) throw new Error(`Only ${done.length} one-minute bars available — market closed too long`);
      const { evolve, fallbackSpread } = await import("./scalp");
      const { data: q } = await sb.from("broker_quotes").select("spread_points,point").eq("symbol", data.symbol).limit(5);
      const sp = (q ?? []).map((x) => Number(x.spread_points ?? 0) * Number(x.point ?? 0)).filter((x) => x > 0);
      const spread = sp.length ? sp.reduce((a, b) => a + b, 0) / sp.length : fallbackSpread(data.symbol, done[done.length - 1]!.c);
      const { scalpParams } = await import("./scalp-sync.server");
      const current = await scalpParams(supabaseAdmin);
      const result = evolve(done, spread, { seed, current });
      await supabaseAdmin.from("lab_runs").update({ status: "completed", result: { ...result, spread_source: sp.length ? "broker" : "estimate", data_source: "Yahoo 1m (research only)" } as never, finished_at: new Date().toISOString() }).eq("id", run.id);
      return { id: run.id };
    } catch (e) {
      await supabaseAdmin.from("lab_runs").update({ status: "failed", error: e instanceof Error ? e.message : String(e), finished_at: new Date().toISOString() }).eq("id", run.id);
      throw e;
    }
  });

/** Admin-only: use a completed run's parameters for Fast Scalping on every account that has it switched on. */
export const applyLab = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: admin } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Only the owner can change the scalping settings.");
    const { data: run } = await sb.from("lab_runs").select("id,status,result").eq("id", data.id).maybeSingle();
    const chosen = (run?.result as { chosen?: unknown } | null)?.chosen;
    if (run?.status !== "completed" || !chosen) throw new Error("Run not completed.");
    const { clampParams, SCALP_DEFAULTS } = await import("./scalp");
    const params = clampParams({ ...SCALP_DEFAULTS, ...(chosen as object) });
    const { error } = await sb.from("app_settings").upsert({ key: "scalp_params", value: params as never, updated_at: new Date().toISOString() });
    if (error) throw new Error("Could not save the settings.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("lab_runs").update({ applied: true }).eq("id", run.id);
    return { params };
  });

/** Admin-only: back to the default scalping settings (rollback). */
export const resetScalpParams = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Only the owner can change the scalping settings.");
    await context.supabase.from("app_settings").delete().eq("key", "scalp_params");
    return { ok: true };
  });
