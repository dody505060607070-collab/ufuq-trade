-- Quant EA v2 (rules-only portfolio EA). The EA trades on its own; the website only
-- monitors it and can change risk / pause / strategy switches.

-- Which engine drives an account: 'ai' = old AI Auto-Pilot, 'quant' = UfuqQuantEA.
ALTER TABLE public.trading_accounts
  ADD COLUMN IF NOT EXISTS engine text NOT NULL DEFAULT 'ai';
DO $$ BEGIN
  ALTER TABLE public.trading_accounts ADD CONSTRAINT trading_accounts_engine_chk CHECK (engine IN ('ai', 'quant'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Settings the owner edits on the website; the EA pulls them every minute.
CREATE TABLE IF NOT EXISTS public.quant_settings (
  account_id uuid PRIMARY KEY REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  risk_pct numeric NOT NULL DEFAULT 0.75 CHECK (risk_pct > 0 AND risk_pct <= 3),
  daily_loss_pct numeric NOT NULL DEFAULT 3 CHECK (daily_loss_pct > 0 AND daily_loss_pct <= 20),
  paused boolean NOT NULL DEFAULT false,
  strategies jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {"GOLD_TREND": true, "SPX_DIP": false, ...}
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Last status reported by the EA (one row per account).
CREATE TABLE IF NOT EXISTS public.quant_status (
  account_id uuid PRIMARY KEY REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  ea_version text,
  trading boolean,
  reason text,
  risk_pct numeric,
  daily_loss_pct numeric,
  equity numeric,
  peak numeric,
  day_start numeric,
  open_risk numeric,
  strategies jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- EA journal: signals, entries, exits, skips, errors.
CREATE TABLE IF NOT EXISTS public.quant_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  at timestamptz NOT NULL,
  level text NOT NULL,
  strategy text,
  symbol text,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quant_events_account_idx ON public.quant_events (account_id, at DESC);

-- Which strategy opened which position (position identifier = trades.ticket).
CREATE TABLE IF NOT EXISTS public.quant_trade_tags (
  account_id uuid NOT NULL REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  ticket text NOT NULL,
  user_id uuid NOT NULL,
  strategy text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, ticket)
);

GRANT SELECT, INSERT, UPDATE ON public.quant_settings TO authenticated;
GRANT SELECT ON public.quant_status, public.quant_events, public.quant_trade_tags TO authenticated;
GRANT ALL ON public.quant_settings, public.quant_status, public.quant_events, public.quant_trade_tags TO service_role;

ALTER TABLE public.quant_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quant_status     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quant_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quant_trade_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own quant settings read" ON public.quant_settings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own quant settings insert" ON public.quant_settings FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.trading_accounts a WHERE a.id = account_id AND a.user_id = auth.uid()));
CREATE POLICY "own quant settings update" ON public.quant_settings FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.trading_accounts a WHERE a.id = account_id AND a.user_id = auth.uid()));
CREATE POLICY "own quant status" ON public.quant_status FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own quant events" ON public.quant_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own quant tags" ON public.quant_trade_tags FOR SELECT TO authenticated USING (user_id = auth.uid());

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['quant_settings','quant_status','quant_events','quant_trade_tags'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Approved users only" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Approved users only" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_approved(auth.uid())) WITH CHECK (public.is_approved(auth.uid()))', t);
  END LOOP;
END $$;