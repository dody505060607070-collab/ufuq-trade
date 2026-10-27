ALTER TABLE public.sim_challenges
  ADD COLUMN last_success_at timestamptz,
  ADD COLUMN last_error text,
  ADD COLUMN last_error_at timestamptz,
  ADD COLUMN consecutive_failures integer NOT NULL DEFAULT 0;