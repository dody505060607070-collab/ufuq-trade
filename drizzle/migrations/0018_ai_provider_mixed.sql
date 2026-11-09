DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'public.trading_accounts'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%ai_provider%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.trading_accounts DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE public.trading_accounts ADD CONSTRAINT trading_accounts_ai_provider_check CHECK (ai_provider IN ('gemini','openai','mixed'));
UPDATE public.trading_accounts SET ai_provider = 'mixed' WHERE login = '474793452';