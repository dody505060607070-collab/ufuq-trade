ALTER TABLE public.trade_commands ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.trade_commands ADD COLUMN IF NOT EXISTS executor_id text;
ALTER TABLE public.trade_commands ADD COLUMN IF NOT EXISTS requested_count int;
ALTER TABLE public.trade_commands ADD COLUMN IF NOT EXISTS filled_count int;
ALTER TABLE public.trade_commands ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS trade_commands_account_status_idx ON public.trade_commands(account_id, status, created_at);

ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS executor_id text;
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS executor_seen_at timestamptz;
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS ea_version text;
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS protocol_version int;
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS capabilities text[];
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS margin_mode text;
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS last_snapshot_at timestamptz;

ALTER TABLE public.autopilot_settings ADD COLUMN IF NOT EXISTS shadow_mode boolean NOT NULL DEFAULT false;

ALTER TABLE public.broker_quotes ADD COLUMN IF NOT EXISTS max_lot numeric;
ALTER TABLE public.broker_quotes ADD COLUMN IF NOT EXISTS lot_step numeric;
ALTER TABLE public.broker_quotes ADD COLUMN IF NOT EXISTS quote_time timestamptz;

ALTER TABLE public.decision_log ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE public.decision_log ADD COLUMN IF NOT EXISTS prompt_version text;
ALTER TABLE public.decision_log ADD COLUMN IF NOT EXISTS exec_price numeric;
ALTER TABLE public.decision_log ADD COLUMN IF NOT EXISTS mode text;

CREATE INDEX IF NOT EXISTS trade_deals_account_time_idx ON public.trade_deals(account_id, closed_at);

-- Market orders go stale: they must not run after a long disconnect or at the next market open.
CREATE OR REPLACE FUNCTION public.set_command_expiry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.expires_at IS NULL AND NEW.command = 'open_trade' AND coalesce(NEW.payload->>'order_type', 'market') = 'market' THEN
    NEW.expires_at := now() + interval '10 minutes';
  END IF;
  IF NEW.requested_count IS NULL AND NEW.command = 'open_trade' THEN
    NEW.requested_count := greatest(1, least(50, coalesce((NEW.payload->>'count')::int, 1)));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trade_commands_expiry ON public.trade_commands;
CREATE TRIGGER trade_commands_expiry BEFORE INSERT ON public.trade_commands FOR EACH ROW EXECUTE FUNCTION public.set_command_expiry();

-- One EA instance owns an account; another instance may take over only after 60s of silence.
CREATE OR REPLACE FUNCTION public.claim_executor(_account uuid, _executor text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.trading_accounts SET executor_id = _executor, executor_seen_at = now()
  WHERE id = _account AND (executor_id IS NULL OR executor_id = _executor OR executor_seen_at IS NULL OR executor_seen_at < now() - interval '60 seconds');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;

-- Claim v2: expires stale market orders, turns long-unanswered deliveries into 'unknown', and re-offers
-- an unanswered delivery only to the same EA instance (whose journal can verify it).
CREATE OR REPLACE FUNCTION public.claim_commands_v2(_account uuid, _executor text, _limit int DEFAULT 50)
RETURNS SETOF public.trade_commands LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.trade_commands SET status = 'expired', result = 'Expired before the EA received it', updated_at = now()
  WHERE account_id = _account AND status = 'queued' AND expires_at IS NOT NULL AND expires_at < now();
  UPDATE public.trade_commands SET status = 'unknown', result = 'No confirmation from the EA - check the broker', updated_at = now()
  WHERE account_id = _account AND status = 'sent' AND result IS NULL AND executed_at < now() - interval '10 minutes';
  RETURN QUERY
  UPDATE public.trade_commands c SET status = 'sent', executed_at = now(), executor_id = _executor, updated_at = now()
  WHERE c.id IN (
    SELECT id FROM public.trade_commands
    WHERE account_id = _account
      AND (expires_at IS NULL OR expires_at > now())
      AND (status = 'queued' OR (status = 'sent' AND result IS NULL AND executor_id = _executor AND executed_at < now() - interval '90 seconds'))
    ORDER BY created_at
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING c.*;
END $$;

-- Owner-token lease: only the owner can renew or release; a lost lease stops new orders.
CREATE OR REPLACE FUNCTION public.acquire_autopilot_lease_v2(_token uuid, _seconds int DEFAULT 240)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.app_settings(key, value, updated_at)
  VALUES ('autopilot_lease', jsonb_build_object('until', now() + make_interval(secs => _seconds), 'owner', _token), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  WHERE (public.app_settings.value->>'until')::timestamptz < now() OR public.app_settings.value->>'owner' = _token::text;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;
CREATE OR REPLACE FUNCTION public.renew_autopilot_lease(_token uuid, _seconds int DEFAULT 240)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.app_settings SET value = jsonb_build_object('until', now() + make_interval(secs => _seconds), 'owner', _token), updated_at = now()
  WHERE key = 'autopilot_lease' AND value->>'owner' = _token::text AND (value->>'until')::timestamptz > now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;
CREATE OR REPLACE FUNCTION public.release_autopilot_lease_v2(_token uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.app_settings WHERE key = 'autopilot_lease' AND value->>'owner' = _token::text;
$$;

REVOKE ALL ON FUNCTION public.claim_executor(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_commands_v2(uuid, text, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.acquire_autopilot_lease_v2(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_autopilot_lease(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_autopilot_lease_v2(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_executor(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_commands_v2(uuid, text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.acquire_autopilot_lease_v2(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_autopilot_lease(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_autopilot_lease_v2(uuid) TO service_role;