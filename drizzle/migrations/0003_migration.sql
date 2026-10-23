CREATE TABLE public.trade_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trade_id uuid NOT NULL UNIQUE,
  symbol text NOT NULL,
  side text NOT NULL,
  profit numeric NOT NULL DEFAULT 0,
  outcome text NOT NULL,
  reason text,
  lesson text,
  rule text,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trade_lessons TO authenticated;
GRANT ALL ON public.trade_lessons TO service_role;
ALTER TABLE public.trade_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lessons read" ON public.trade_lessons FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.learned_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text,
  rule text NOT NULL,
  hits integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.learned_rules TO authenticated;
GRANT ALL ON public.learned_rules TO service_role;
ALTER TABLE public.learned_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rules read" ON public.learned_rules FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own rules update" ON public.learned_rules FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own rules delete" ON public.learned_rules FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.weekly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  week_start date NOT NULL,
  summary text NOT NULL,
  trades integer NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);
GRANT SELECT ON public.weekly_reviews TO authenticated;
GRANT ALL ON public.weekly_reviews TO service_role;
ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reviews read" ON public.weekly_reviews FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.whale_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  source text NOT NULL,
  report_date date NOT NULL,
  long_pos numeric NOT NULL,
  short_pos numeric NOT NULL,
  change_long numeric NOT NULL DEFAULT 0,
  change_short numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, source, report_date)
);
GRANT SELECT ON public.whale_signals TO authenticated;
GRANT ALL ON public.whale_signals TO service_role;
ALTER TABLE public.whale_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read whale signals" ON public.whale_signals FOR SELECT TO authenticated USING (true);