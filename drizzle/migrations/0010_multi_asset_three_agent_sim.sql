-- Security: market COT data only for approved signed-in users; platform settings only for admins.
DROP POLICY IF EXISTS "read whale signals" ON public.whale_signals;
CREATE POLICY "approved read whale signals" ON public.whale_signals FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
REVOKE SELECT ON public.whale_signals FROM anon;
DROP POLICY IF EXISTS "public read settings" ON public.app_settings;
CREATE POLICY "admin read settings" ON public.app_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
REVOKE SELECT ON public.app_settings FROM anon;

-- Multi-asset portfolio limits (conservative defaults; server-only writes).
ALTER TABLE public.sim_challenges ALTER COLUMN max_risk_pct SET DEFAULT 2;
ALTER TABLE public.sim_challenges
  ADD COLUMN max_total_risk_pct numeric NOT NULL DEFAULT 6,
  ADD COLUMN max_daily_loss_pct numeric NOT NULL DEFAULT 8,
  ADD COLUMN max_drawdown_pct numeric NOT NULL DEFAULT 35,
  ADD COLUMN max_open_trades integer NOT NULL DEFAULT 4,
  ADD COLUMN equity numeric,
  ADD COLUMN lock_until timestamptz,
  ADD COLUMN cycle_started_at timestamptz,
  ADD COLUMN cycles integer NOT NULL DEFAULT 0,
  ADD COLUMN scanned integer NOT NULL DEFAULT 0,
  ADD COLUMN last_scan jsonb;
ALTER TABLE public.sim_trades
  ADD COLUMN timeframe text,
  ADD COLUMN leverage numeric,
  ADD COLUMN risk_usd numeric,
  ADD COLUMN swap numeric NOT NULL DEFAULT 0,
  ADD COLUMN float_pnl numeric,
  ADD COLUMN last_price numeric,
  ADD COLUMN decision_id uuid;

CREATE TABLE public.sim_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.sim_challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  direction text NOT NULL,
  scanner_score numeric,
  scanner jsonb NOT NULL,
  reviewer jsonb,
  supervisor jsonb,
  outcome text NOT NULL CHECK (outcome IN ('opened','rejected_scanner','rejected_reviewer','rejected_supervisor','error')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sim_decisions TO authenticated;
GRANT ALL ON public.sim_decisions TO service_role;
ALTER TABLE public.sim_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sim decisions" ON public.sim_decisions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX sim_decisions_ch ON public.sim_decisions(challenge_id, created_at DESC);