DROP POLICY IF EXISTS "own lab runs update" ON public.lab_runs;
REVOKE UPDATE ON public.lab_runs FROM authenticated;
REVOKE INSERT ON public.lab_runs FROM authenticated;
GRANT INSERT (user_id, symbol, seed) ON public.lab_runs TO authenticated;