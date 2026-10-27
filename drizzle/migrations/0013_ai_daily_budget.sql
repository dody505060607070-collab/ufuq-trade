CREATE TABLE public.ai_usage (day date PRIMARY KEY, calls integer NOT NULL DEFAULT 0);
GRANT ALL ON public.ai_usage TO service_role;
GRANT SELECT ON public.ai_usage TO authenticated;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ai usage" ON public.ai_usage FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE OR REPLACE FUNCTION public.take_ai_call(_cap integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO public.ai_usage(day, calls) VALUES (current_date, 1)
  ON CONFLICT (day) DO UPDATE SET calls = ai_usage.calls + 1 WHERE ai_usage.calls < _cap
  RETURNING calls INTO n;
  RETURN n IS NOT NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.take_ai_call(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_ai_call(integer) TO service_role;