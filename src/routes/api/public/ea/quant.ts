import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { QUANT_DEFAULTS, sanitizeSettings, settingsLines } from "@/lib/quant";

// UfuqQuantEA v2 reports its state here every minute and receives its remote settings.
// Same credentials as /sync (X-Username + X-API-Key). The account must already exist (created by /sync).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key, X-Username",
};

const body = z.object({
  login: z.string().regex(/^\d{3,20}$/),
  ea_version: z.string().max(20).optional(),
  status: z
    .object({
      trading: z.boolean().optional(),
      paused: z.boolean().optional(),
      reason: z.string().max(500).optional(),
      risk_pct: z.number().optional(),
      daily_loss_pct: z.number().optional(),
      equity: z.number().optional(),
      peak: z.number().optional(),
      day_start: z.number().optional(),
      open_risk: z.number().optional(),
    })
    .optional(),
  strategies: z
    .array(
      z.object({
        name: z.string().max(40),
        symbol: z.string().max(30),
        timeframe: z.string().max(20),
        enabled: z.boolean(),
        weight: z.number(),
        pending: z.number().int(),
        note: z.string().max(500),
        magic: z.number().int(),
      }),
    )
    .max(30)
    .optional(),
  tags: z
    .array(z.object({ ticket: z.string().max(40), strategy: z.string().max(40) }))
    .max(200)
    .optional(),
  events: z
    .array(
      z.object({
        at: z.string().max(40),
        level: z.string().max(20),
        strategy: z.string().max(40),
        symbol: z.string().max(30),
        message: z.string().max(500),
      }),
    )
    .max(100)
    .optional(),
});

export const Route = createFileRoute("/api/public/ea/quant")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const text = (s: string, status = 200) =>
          new Response(s, { status, headers: { ...cors, "Content-Type": "text/plain" } });
        const apiKey = request.headers.get("x-api-key") ?? "";
        const username = (request.headers.get("x-username") ?? "").trim().toLowerCase();
        if (!z.string().uuid().safeParse(apiKey).success) return text("ERR|invalid key\n", 401);
        const parsed = body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return text("ERR|invalid body\n", 400);
        const p = parsed.data;

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { data: cred } = await db
          .from("ea_credentials")
          .select("user_id")
          .eq("api_key", apiKey)
          .maybeSingle();
        if (!cred) return text("ERR|unknown api key\n", 401);
        const { data: prof } = await db
          .from("profiles")
          .select("username,approval_status")
          .eq("id", cred.user_id)
          .maybeSingle();
        if (!prof?.username || prof.username.toLowerCase() !== username)
          return text("ERR|username does not match api key\n", 401);
        if (prof.approval_status !== "approved") return text("ERR|account not approved\n", 403);
        const { data: acc } = await db
          .from("trading_accounts")
          .select("id,user_id,engine")
          .eq("user_id", cred.user_id)
          .eq("login", p.login)
          .maybeSingle();
        if (!acc) return text("ERR|unknown account - let the EA run /sync first\n", 404);
        const now = new Date().toISOString();

        // The Quant EA is now driving this account: the AI Auto-Pilot must not queue trades for it.
        if (acc.engine !== "quant")
          await db
            .from("trading_accounts")
            .update({ engine: "quant", auto_trading: false })
            .eq("id", acc.id);

        const s = p.status ?? {};
        await db
          .from("quant_status")
          .upsert(
            {
              account_id: acc.id,
              user_id: acc.user_id,
              ea_version: p.ea_version ?? null,
              trading: s.trading ?? null,
              reason: s.reason ?? null,
              risk_pct: s.risk_pct ?? null,
              daily_loss_pct: s.daily_loss_pct ?? null,
              equity: s.equity ?? null,
              peak: s.peak ?? null,
              day_start: s.day_start ?? null,
              open_risk: s.open_risk ?? null,
              strategies: p.strategies ?? [],
              updated_at: now,
            },
            { onConflict: "account_id" },
          );
        if (p.tags?.length)
          await db.from("quant_trade_tags").upsert(
            p.tags.map((t) => ({
              account_id: acc.id,
              user_id: acc.user_id,
              ticket: t.ticket,
              strategy: t.strategy,
            })),
            { onConflict: "account_id,ticket", ignoreDuplicates: true },
          );
        if (p.events?.length)
          await db
            .from("quant_events")
            .insert(
              p.events.map((e) => ({
                account_id: acc.id,
                user_id: acc.user_id,
                at: Number.isNaN(Date.parse(e.at)) ? now : e.at,
                level: e.level,
                strategy: e.strategy || null,
                symbol: e.symbol || null,
                message: e.message,
              })),
            );

        let { data: row } = await db
          .from("quant_settings")
          .select("risk_pct,daily_loss_pct,paused,strategies")
          .eq("account_id", acc.id)
          .maybeSingle();
        if (!row) {
          // First contact: start from what the EA is running with, so nothing changes silently.
          const init = sanitizeSettings({
            risk_pct: s.risk_pct ?? QUANT_DEFAULTS.risk_pct,
            daily_loss_pct: s.daily_loss_pct ?? QUANT_DEFAULTS.daily_loss_pct,
            paused: s.paused ?? false,
            strategies: Object.fromEntries((p.strategies ?? []).map((x) => [x.name, x.enabled])),
          });
          await db
            .from("quant_settings")
            .insert({ account_id: acc.id, user_id: acc.user_id, ...init });
          row = init;
        }
        const settings = sanitizeSettings({
          risk_pct: Number(row.risk_pct),
          daily_loss_pct: Number(row.daily_loss_pct),
          paused: row.paused,
          strategies: (row.strategies ?? {}) as Record<string, boolean>,
        });
        return text(settingsLines(settings, now));
      },
    },
  },
});
