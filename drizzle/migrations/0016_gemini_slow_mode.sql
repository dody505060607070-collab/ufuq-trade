ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS slow_last timestamptz, ADD COLUMN IF NOT EXISTS slow_calls integer NOT NULL DEFAULT 0;

-- After the daily cap: one extra Gemini call per _gap_min minutes (atomic, shared by all cycles).
CREATE OR REPLACE FUNCTION public.take_slow_ai_call(_gap_min integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  INSERT INTO public.ai_usage(day, calls) VALUES (current_date, 0) ON CONFLICT (day) DO NOTHING;
  UPDATE public.ai_usage SET slow_last = now(), slow_calls = slow_calls + 1
   WHERE day = current_date AND (slow_last IS NULL OR slow_last <= now() - make_interval(mins => _gap_min) + interval '30 seconds')
  RETURNING slow_calls INTO n;
  RETURN n IS NOT NULL;
END $$;

REVOKE ALL ON FUNCTION public.take_slow_ai_call(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_slow_ai_call(integer) TO service_role;

UPDATE public.instruments SET yahoo_symbol = 'YM=F' WHERE symbol = 'US30' AND yahoo_symbol = '^DJI';