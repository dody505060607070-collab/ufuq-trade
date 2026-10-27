CREATE TABLE public.challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'demo' CHECK (mode IN ('demo','live')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','paused','stopped','failed','completed')),
  start_balance numeric NOT NULL,
  target_balance numeric NOT NULL DEFAULT 1000000,
  peak_balance numeric NOT NULL,
  floor_balance numeric NOT NULL DEFAULT 10,
  max_risk_pct numeric NOT NULL DEFAULT 10 CHECK (max_risk_pct > 0 AND max_risk_pct <= 20),
  max_daily_loss_pct numeric NOT NULL DEFAULT 20 CHECK (max_daily_loss_pct > 0 AND max_daily_loss_pct <= 50),
  stop_reason text,
  last_cycle_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenges TO authenticated;
GRANT ALL ON public.challenges TO service_role;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX challenges_one_active ON public.challenges(account_id) WHERE status IN ('running','paused');
CREATE POLICY "own challenges" ON public.challenges FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_approved(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_approved(auth.uid()) AND EXISTS (SELECT 1 FROM public.trading_accounts a WHERE a.id = account_id AND a.user_id = auth.uid()));