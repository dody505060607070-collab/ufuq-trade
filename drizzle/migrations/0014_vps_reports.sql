CREATE TABLE public.vps_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by uuid NOT NULL DEFAULT auth.uid(),
  hostname text,
  report_time timestamptz,
  overall text NOT NULL CHECK (overall IN ('PASS','FAIL','NOT VERIFIED')),
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.vps_reports TO authenticated;
GRANT ALL ON public.vps_reports TO service_role;
ALTER TABLE public.vps_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read vps reports" ON public.vps_reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins add vps reports" ON public.vps_reports FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') AND submitted_by = auth.uid() AND octet_length(checks::text) < 65536);