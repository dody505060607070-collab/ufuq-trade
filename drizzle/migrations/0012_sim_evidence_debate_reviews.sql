ALTER TABLE public.sim_challenges ADD COLUMN use_evidence boolean NOT NULL DEFAULT true;
ALTER TABLE public.sim_decisions
  ADD COLUMN evidence jsonb, ADD COLUMN checklist jsonb, ADD COLUMN debate jsonb,
  ADD COLUMN strategy_version text, ADD COLUMN plan_entry numeric, ADD COLUMN plan_sl numeric, ADD COLUMN plan_tp numeric,
  ADD COLUMN hindsight text, ADD COLUMN graded_at timestamptz;
ALTER TABLE public.sim_decisions DROP CONSTRAINT IF EXISTS sim_decisions_outcome_check;
ALTER TABLE public.sim_decisions ADD CONSTRAINT sim_decisions_outcome_check CHECK (outcome IN ('opened','rejected_scanner','rejected_reviewer','rejected_supervisor','rejected_checklist','waiting','error'));
ALTER TABLE public.sim_trades ADD COLUMN strategy_version text, ADD COLUMN last_check text;

CREATE TABLE public.sim_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.sim_challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  trade_id uuid NOT NULL UNIQUE REFERENCES public.sim_trades(id) ON DELETE CASCADE,
  symbol text NOT NULL, timeframe text, strategy_version text,
  profit numeric NOT NULL, r_multiple numeric NOT NULL, followed_plan boolean NOT NULL,
  process_score integer NOT NULL, outcome_class text NOT NULL, lessons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sim_reviews TO authenticated;
GRANT ALL ON public.sim_reviews TO service_role;
ALTER TABLE public.sim_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sim reviews" ON public.sim_reviews FOR SELECT TO authenticated USING (user_id = auth.uid());