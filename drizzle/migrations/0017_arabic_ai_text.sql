ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS summary_ar text;
ALTER TABLE public.autopilot_events ADD COLUMN IF NOT EXISTS detail_ar text;
ALTER TABLE public.trade_lessons ADD COLUMN IF NOT EXISTS reason_ar text, ADD COLUMN IF NOT EXISTS lesson_ar text;
ALTER TABLE public.learned_rules ADD COLUMN IF NOT EXISTS rule_ar text;
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS summary_ar text;