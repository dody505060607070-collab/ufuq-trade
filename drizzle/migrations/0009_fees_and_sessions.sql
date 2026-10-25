ALTER TABLE public.trade_deals ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'exit';
ALTER TABLE public.trade_deals ADD CONSTRAINT trade_deals_kind_check CHECK (kind IN ('exit','entry_fee'));
ALTER TABLE public.broker_quotes ADD COLUMN IF NOT EXISTS trade_allowed boolean;