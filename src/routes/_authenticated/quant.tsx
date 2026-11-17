import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Page } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { fmt, queueCommand, useAccounts } from "@/lib/trading";
import { QUANT_STRATEGIES, perStrategy, sanitizeSettings, type QuantSettings } from "@/lib/quant";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/quant")({
  head: () => ({
    meta: [
      { title: "Quant EA | Ufuq Trade" },
      {
        name: "description",
        content: "Rules-only portfolio EA: status, risk settings, strategies and journal.",
      },
    ],
  }),
  component: QuantPage,
});

type StratStatus = {
  name: string;
  symbol: string;
  timeframe: string;
  enabled: boolean;
  weight: number;
  pending: number;
  note: string;
};

// Results of the 2017–2026 study (M1 data, spread charged, stop checked before target). See docs/BACKTEST_REPORT.md.
const BACKTEST = {
  cagr05: 12.6,
  dd05: 13.9,
  cagr1: 25.6,
  dd1: 25.9,
  tradesWeek: 3.4,
  posMonths: 59,
};

function QuantPage() {
  const t = useT();
  const qc = useQueryClient();
  const accounts = useAccounts();
  const list = accounts.data ?? [];
  const [accId, setAccId] = useState<string>("");
  useEffect(() => {
    if (!accId && list.length)
      setAccId((list.find((a) => a.engine === "quant") ?? list[0])?.id ?? "");
  }, [list, accId]);
  const acc = list.find((a) => a.id === accId);

  const status = useQuery({
    queryKey: ["quant_status", accId],
    enabled: !!accId,
    refetchInterval: 15_000,
    queryFn: async () =>
      (await supabase.from("quant_status").select("*").eq("account_id", accId).maybeSingle()).data,
  });
  const settingsQ = useQuery({
    queryKey: ["quant_settings", accId],
    enabled: !!accId,
    queryFn: async () =>
      (await supabase.from("quant_settings").select("*").eq("account_id", accId).maybeSingle())
        .data,
  });
  const events = useQuery({
    queryKey: ["quant_events", accId],
    enabled: !!accId,
    refetchInterval: 30_000,
    queryFn: async () =>
      (
        await supabase
          .from("quant_events")
          .select("*")
          .eq("account_id", accId)
          .order("at", { ascending: false })
          .limit(60)
      ).data ?? [],
  });
  const perf = useQuery({
    queryKey: ["quant_perf", accId],
    enabled: !!accId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [tr, tags] = await Promise.all([
        supabase
          .from("trades")
          .select("ticket,profit,status")
          .eq("account_id", accId)
          .eq("status", "closed")
          .order("closed_at", { ascending: false })
          .limit(1000),
        supabase.from("quant_trade_tags").select("ticket,strategy").eq("account_id", accId),
      ]);
      return perStrategy(tr.data ?? [], tags.data ?? []);
    },
  });

  const [form, setForm] = useState<QuantSettings | null>(null);
  useEffect(() => {
    const r = settingsQ.data;
    setForm(
      r
        ? sanitizeSettings({
            risk_pct: Number(r.risk_pct),
            daily_loss_pct: Number(r.daily_loss_pct),
            paused: r.paused,
            strategies: (r.strategies ?? {}) as Record<string, boolean>,
          })
        : null,
    );
  }, [settingsQ.data]);

  const st = status.data;
  const online = !!st?.updated_at && Date.now() - new Date(st.updated_at).getTime() < 3 * 60_000;
  const strategies = useMemo(
    () => (Array.isArray(st?.strategies) ? (st!.strategies as unknown as StratStatus[]) : []),
    [st],
  );
  const dd = st?.peak && st?.equity ? (1 - Number(st.equity) / Number(st.peak)) * 100 : null;

  const save = async () => {
    if (!form || !acc) return;
    const clean = sanitizeSettings(form);
    const { error } = await supabase.from("quant_settings").upsert(
      {
        account_id: acc.id,
        user_id: acc.user_id,
        ...clean,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" },
    );
    if (error) toast.error(t("Could not save settings."));
    else {
      toast.success(t("Saved. The EA applies it within a minute."));
      qc.invalidateQueries({ queryKey: ["quant_settings", accId] });
    }
  };

  // Pause/resume is stored in quant_settings (the EA re-reads it every minute) AND sent as a command for an immediate effect.
  const setPaused = async (paused: boolean) => {
    if (!acc) return;
    const base = form ?? sanitizeSettings({});
    const { error } = await supabase
      .from("quant_settings")
      .upsert(
        {
          account_id: acc.id,
          user_id: acc.user_id,
          ...sanitizeSettings({ ...base, paused }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id" },
      );
    if (error) return toast.error(t("Could not save settings."));
    await queueCommand([acc], paused ? "quant_pause" : "quant_resume");
    qc.invalidateQueries({ queryKey: ["quant_settings", accId] });
  };

  return (
    <Page
      title={t("Quant EA")}
      subtitle={t(
        "Rules-only portfolio: gold and US indices. The EA trades by itself on the VPS; this page watches it and controls risk.",
      )}
      wide
    >
      <div className="flex flex-wrap gap-2">
        {list.map((a) => (
          <Button
            key={a.id}
            size="sm"
            variant={a.id === accId ? "default" : "outline"}
            onClick={() => setAccId(a.id)}
          >
            #{a.login} {a.engine === "quant" ? "· Quant" : ""}
          </Button>
        ))}
      </div>

      {acc && acc.engine !== "quant" && (
        <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {t(
            "This account is still on the AI Auto-Pilot. Install UfuqQuantEA.mq5 on it (and remove ArrissaEA); it switches to Quant automatically on first connection.",
          )}{" "}
          <a className="underline" href="/ea/UfuqQuantEA.mq5" download>
            {t("Download UfuqQuantEA.mq5")}
          </a>
        </p>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Stat
          label={t("EA")}
          value={online ? t("Online") : t("Offline")}
          tone={online ? "up" : "down"}
        />
        <Stat
          label={t("New entries")}
          value={st?.trading ? t("Allowed") : t("Blocked")}
          tone={st?.trading ? "up" : "down"}
        />
        <Stat label={t("Equity")} value={fmt(st?.equity)} />
        <Stat
          label={t("Drawdown from peak")}
          value={dd == null ? "—" : `${dd.toFixed(1)}%`}
          tone={dd != null && dd > 10 ? "down" : undefined}
        />
      </div>
      {st?.reason && (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Reason")}: {st.reason}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!acc} onClick={() => setPaused(true)}>
          {t("Pause new entries")}
        </Button>
        <Button size="sm" variant="outline" disabled={!acc} onClick={() => setPaused(false)}>
          {t("Resume (resets kill switch)")}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={!acc}
          onClick={() =>
            acc && confirm(t("Close all Quant EA trades now?")) && queueCommand([acc], "close_all")
          }
        >
          {t("Close all EA trades")}
        </Button>
      </div>

      {form && (
        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">{t("Risk settings")}</h2>
          <div className="mt-4 space-y-5">
            <div>
              <div className="flex justify-between text-sm">
                <span>{t("Risk per trade (% of equity)")}</span>
                <b>{form.risk_pct.toFixed(2)}%</b>
              </div>
              <Slider
                className="mt-2"
                min={0.25}
                max={2}
                step={0.05}
                value={[form.risk_pct]}
                onValueChange={([v]) => setForm({ ...form, risk_pct: v ?? form.risk_pct })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "Backtest 2017–2026: 0.5% ≈ {a}%/year with {b}% worst drawdown; 1% ≈ {c}%/year with {d}% worst drawdown.",
                  { a: BACKTEST.cagr05, b: BACKTEST.dd05, c: BACKTEST.cagr1, d: BACKTEST.dd1 },
                )}
              </p>
            </div>
            <div>
              <div className="flex justify-between text-sm">
                <span>{t("Daily loss limit")}</span>
                <b>{form.daily_loss_pct.toFixed(1)}%</b>
              </div>
              <Slider
                className="mt-2"
                min={1}
                max={10}
                step={0.5}
                value={[form.daily_loss_pct]}
                onValueChange={([v]) =>
                  setForm({ ...form, daily_loss_pct: v ?? form.daily_loss_pct })
                }
              />
            </div>
            <label className="flex items-center justify-between text-sm">
              <span>{t("Pause new entries")}</span>
              <Switch
                checked={form.paused}
                onCheckedChange={(v) => setForm({ ...form, paused: v })}
              />
            </label>
            <div className="divide-y divide-border rounded-lg border border-border">
              {QUANT_STRATEGIES.map((s) => {
                const live = strategies.find((x) => x.name === s.name);
                const on = form.strategies[s.name] ?? live?.enabled ?? true;
                const p = perf.data?.get(s.name);
                return (
                  <div key={s.name} className="flex items-start justify-between gap-3 p-3 text-sm">
                    <div>
                      <div className="font-medium">
                        {s.name}{" "}
                        <span className="text-muted-foreground">
                          · {live?.symbol || s.symbol} {s.tf} · ×{s.weight}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">{t(s.desc)}</div>
                      {live?.note && <div className="mt-1 text-xs">{live.note}</div>}
                      {p && (
                        <div
                          className={cn(
                            "mt-1 text-xs",
                            p.net >= 0 ? "text-primary" : "text-destructive",
                          )}
                        >
                          {t("Live")}: {p.trades} {t("trades")} ·{" "}
                          {Math.round((p.wins / p.trades) * 100)}% {t("wins")} · {fmt(p.net)}
                        </div>
                      )}
                    </div>
                    <Switch
                      checked={on}
                      onCheckedChange={(v) =>
                        setForm({ ...form, strategies: { ...form.strategies, [s.name]: v } })
                      }
                    />
                  </div>
                );
              })}
            </div>
            <Button onClick={save}>{t("Save settings")}</Button>
          </div>
        </section>
      )}

      <section className="mt-6 rounded-xl border border-border bg-card p-5 text-sm">
        <h2 className="font-semibold">{t("What to expect (honest numbers)")}</h2>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-muted-foreground">
          <li>
            {t(
              "About {n} trades per week across all strategies. Trend trades last days; most of the profit comes from a few big winners.",
              { n: BACKTEST.tradesWeek },
            )}
          </li>
          <li>
            {t(
              "Win rate of trend trades is only 35–50%. Losing streaks of 6–10 trades are normal and expected.",
            )}
          </li>
          <li>
            {t(
              "Positive months in the backtest: {p}%. 2018 and 2022 were flat or negative years.",
              { p: BACKTEST.posMonths },
            )}
          </li>
          <li>{t("Past results do not guarantee future profit.")}</li>
        </ul>
      </section>

      <section className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
        <h2 className="p-4 font-semibold">{t("EA journal")}</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              {["Time", "Level", "Strategy", "Symbol", "Message"].map((h) => (
                <th key={h} className="p-3 font-medium">
                  {t(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(events.data ?? []).map((e) => (
              <tr key={e.id} className="border-t border-border">
                <td className="whitespace-nowrap p-3">{new Date(e.at).toLocaleString()}</td>
                <td
                  className={cn(
                    "p-3",
                    e.level === "error" && "text-destructive",
                    e.level === "trade" && "text-primary",
                  )}
                >
                  {e.level}
                </td>
                <td className="p-3">{e.strategy ?? ""}</td>
                <td className="p-3">{e.symbol ?? ""}</td>
                <td className="p-3">{e.message}</td>
              </tr>
            ))}
            {!events.data?.length && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={5}>
                  {t("No events yet")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </Page>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | undefined;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold",
          tone === "down" && "text-destructive",
          tone === "up" && "text-primary",
        )}
      >
        {value}
      </div>
    </div>
  );
}
