ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS fast_scalp boolean NOT NULL DEFAULT false;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS strategy text, ADD COLUMN IF NOT EXISTS exit_reason text;

-- Execution timings reported by the EA (open/close requests, confirmations, sync round trips).
CREATE TABLE public.ea_exec_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  symbol text,
  ticket text,
  ms integer,
  ok boolean NOT NULL DEFAULT true,
  reason text,
  spread integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ea_exec_events TO authenticated;
GRANT ALL ON public.ea_exec_events TO service_role;
ALTER TABLE public.ea_exec_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own exec events" ON public.ea_exec_events FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE INDEX ea_exec_events_acc_time ON public.ea_exec_events(account_id, created_at DESC);

-- Evolution Lab research runs (real results only).
CREATE TABLE public.lab_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  seed integer NOT NULL DEFAULT 7,
  result jsonb,
  error text,
  applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.lab_runs TO authenticated;
GRANT ALL ON public.lab_runs TO service_role;
ALTER TABLE public.lab_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lab runs read" ON public.lab_runs FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own lab runs add" ON public.lab_runs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_approved(auth.uid()));
CREATE POLICY "own lab runs update" ON public.lab_runs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX lab_runs_user_time ON public.lab_runs(user_id, created_at DESC);