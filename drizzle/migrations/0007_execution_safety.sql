ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS realized_profit numeric NOT NULL DEFAULT 0;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS closed_volume numeric NOT NULL DEFAULT 0;
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS shared boolean NOT NULL DEFAULT false;
ALTER TABLE public.autopilot_settings ADD COLUMN IF NOT EXISTS max_risk_pct numeric NOT NULL DEFAULT 5;
ALTER TABLE public.autopilot_settings ADD COLUMN IF NOT EXISTS max_daily_loss_pct numeric NOT NULL DEFAULT 5;

CREATE TABLE public.trade_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  deal_ticket text NOT NULL,
  position_ticket text NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL,
  volume numeric NOT NULL,
  price numeric,
  profit numeric NOT NULL DEFAULT 0,
  closed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, deal_ticket)
);
CREATE INDEX trade_deals_position_idx ON public.trade_deals(account_id, position_ticket);
GRANT SELECT ON public.trade_deals TO authenticated;
GRANT ALL ON public.trade_deals TO service_role;
ALTER TABLE public.trade_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own deals" ON public.trade_deals FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Atomically hands queued commands to one EA request; stale 'sent' commands (no result after 90s) are re-offered so the EA can verify them at the broker.
CREATE OR REPLACE FUNCTION public.claim_commands(_account uuid, _limit int DEFAULT 50)
RETURNS SETOF public.trade_commands
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.trade_commands c SET status = 'sent', executed_at = now()
  WHERE c.id IN (
    SELECT id FROM public.trade_commands
    WHERE account_id = _account
      AND (status = 'queued' OR (status = 'sent' AND result IS NULL AND executed_at < now() - interval '90 seconds'))
    ORDER BY created_at
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING c.*;
$$;
REVOKE ALL ON FUNCTION public.claim_commands(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_commands(uuid, int) TO service_role;

-- Lease so two Auto-Pilot cycles never run at the same time.
CREATE OR REPLACE FUNCTION public.acquire_autopilot_lease(_seconds int DEFAULT 240)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.app_settings(key, value, updated_at)
  VALUES ('autopilot_lease', jsonb_build_object('until', now() + make_interval(secs => _seconds)), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  WHERE (public.app_settings.value->>'until')::timestamptz < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;
CREATE OR REPLACE FUNCTION public.release_autopilot_lease()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.app_settings WHERE key = 'autopilot_lease';
$$;
REVOKE ALL ON FUNCTION public.acquire_autopilot_lease(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_autopilot_lease() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_autopilot_lease(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_autopilot_lease() TO service_role;