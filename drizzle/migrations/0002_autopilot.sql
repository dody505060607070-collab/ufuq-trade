CREATE TABLE public.autopilot_settings (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  symbols text[] NOT NULL DEFAULT '{XAUUSD,EURUSD}'::text[],
  timeframe text NOT NULL DEFAULT 'H1',
  min_confidence integer NOT NULL DEFAULT 75,
  lot_size numeric NOT NULL DEFAULT 0.01,
  max_open integer NOT NULL DEFAULT 2,
  max_daily integer NOT NULL DEFAULT 4,
  avoid_news boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autopilot_settings TO authenticated;
GRANT ALL ON public.autopilot_settings TO service_role;
ALTER TABLE public.autopilot_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own autopilot" ON public.autopilot_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.autopilot_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  action text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.autopilot_events TO authenticated;
GRANT ALL ON public.autopilot_events TO service_role;
ALTER TABLE public.autopilot_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own autopilot events" ON public.autopilot_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX autopilot_events_user_idx ON public.autopilot_events (user_id, created_at DESC);