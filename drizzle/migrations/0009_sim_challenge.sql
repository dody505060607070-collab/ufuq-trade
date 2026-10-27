COMMENT ON TABLE public.challenges IS 'DEPRECATED: replaced by sim_challenges (free demo challenge never touches real accounts)';
CREATE TABLE public.sim_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','paused','stopped','failed','completed')),
  symbol text NOT NULL DEFAULT 'XAUUSD',
  timeframe text NOT NULL DEFAULT 'M15',
  start_balance numeric NOT NULL DEFAULT 100,
  balance numeric NOT NULL DEFAULT 100,
  peak_equity numeric NOT NULL DEFAULT 100,
  target_balance numeric NOT NULL DEFAULT 1000000,
  leverage numeric NOT NULL DEFAULT 100,
  max_risk_pct numeric NOT NULL DEFAULT 10,
  fees_paid numeric NOT NULL DEFAULT 0,
  last_price numeric,
  last_price_at timestamptz,
  last_cycle_at timestamptz,
  stop_reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sim_challenges TO authenticated;
GRANT INSERT (user_id) ON public.sim_challenges TO authenticated;
GRANT UPDATE (status, stop_reason, updated_at) ON public.sim_challenges TO authenticated;
GRANT ALL ON public.sim_challenges TO service_role;
ALTER TABLE public.sim_challenges ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX sim_challenges_one_active ON public.sim_challenges(user_id) WHERE status IN ('running','paused');
CREATE POLICY "own sim read" ON public.sim_challenges FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own sim insert" ON public.sim_challenges FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_approved(auth.uid()));
CREATE POLICY "own sim pause" ON public.sim_challenges FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status IN ('running','paused'))
  WITH CHECK (user_id = auth.uid() AND status IN ('running','paused','stopped'));

CREATE TABLE public.sim_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.sim_challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy','sell')),
  lot numeric NOT NULL,
  entry numeric NOT NULL,
  stop_loss numeric NOT NULL,
  take_profit numeric NOT NULL,
  margin numeric NOT NULL,
  fees numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  exit_price numeric,
  profit numeric,
  close_reason text,
  confidence integer,
  reason text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
GRANT SELECT ON public.sim_trades TO authenticated;
GRANT ALL ON public.sim_trades TO service_role;
ALTER TABLE public.sim_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sim trades" ON public.sim_trades FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX sim_trades_ch ON public.sim_trades(challenge_id, status);

CREATE TABLE public.sim_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.sim_challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL,
  detail text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sim_events TO authenticated;
GRANT ALL ON public.sim_events TO service_role;
ALTER TABLE public.sim_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sim events" ON public.sim_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX sim_events_ch ON public.sim_events(challenge_id, created_at DESC);