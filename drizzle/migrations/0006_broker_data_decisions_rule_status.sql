CREATE TABLE public.broker_candles (
  account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  t bigint NOT NULL,
  o double precision NOT NULL, h double precision NOT NULL, l double precision NOT NULL, c double precision NOT NULL,
  spread integer NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, symbol, timeframe, t)
);
GRANT SELECT ON public.broker_candles TO authenticated;
GRANT ALL ON public.broker_candles TO service_role;
ALTER TABLE public.broker_candles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own broker candles" ON public.broker_candles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX broker_candles_sym_idx ON public.broker_candles (symbol, timeframe, t DESC);

CREATE TABLE public.broker_quotes (
  account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  broker_symbol text,
  bid double precision, ask double precision,
  spread_points integer, point double precision, tick_value double precision, contract_size double precision, min_lot double precision,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, symbol)
);
GRANT SELECT ON public.broker_quotes TO authenticated;
GRANT ALL ON public.broker_quotes TO service_role;
ALTER TABLE public.broker_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own broker quotes" ON public.broker_quotes FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid,
  symbol text NOT NULL,
  timeframe text,
  data_source text,
  ai_direction text, ai_confidence integer,
  entry double precision, stop_loss double precision, take_profit double precision,
  risk_verdict text NOT NULL,
  risk_reason text,
  command_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.decision_log TO authenticated;
GRANT ALL ON public.decision_log TO service_role;
ALTER TABLE public.decision_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own decisions" ON public.decision_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX decision_log_user_idx ON public.decision_log (user_id, created_at DESC);

ALTER TABLE public.learned_rules ADD COLUMN status text NOT NULL DEFAULT 'hypothesis';
ALTER TABLE public.learned_rules ADD COLUMN version integer NOT NULL DEFAULT 1;
UPDATE public.learned_rules SET status = CASE WHEN hits >= 3 THEN 'approved' WHEN hits >= 2 THEN 'trial' ELSE 'hypothesis' END;