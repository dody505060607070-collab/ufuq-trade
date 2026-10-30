ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS ai_provider text NOT NULL DEFAULT 'gemini';
ALTER TABLE public.trading_accounts DROP CONSTRAINT IF EXISTS trading_accounts_ai_provider_check;
ALTER TABLE public.trading_accounts ADD CONSTRAINT trading_accounts_ai_provider_check CHECK (ai_provider IN ('gemini','openai'));
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'gemini';
ALTER TABLE public.decision_log ADD COLUMN IF NOT EXISTS ai_provider text;
UPDATE public.trading_accounts SET ai_provider = 'openai' WHERE id = 'db22be8e-3a6b-41d1-94f6-bb948c8557f6';