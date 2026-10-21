ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS default_account_id uuid,
  ADD COLUMN IF NOT EXISTS favorite_instruments text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS push_notifications boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_tooltips boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS copy_tp boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS copy_sl boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles (lower(username));

ALTER TABLE public.instruments
  ADD COLUMN IF NOT EXISTS flag text,
  ADD COLUMN IF NOT EXISTS yahoo_symbol text;

ALTER TABLE public.brokers
  ADD COLUMN IF NOT EXISTS regulation text,
  ADD COLUMN IF NOT EXISTS features text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS brand_color text;

ALTER TABLE public.trading_accounts
  ADD COLUMN IF NOT EXISTS connection_type text NOT NULL DEFAULT 'terminal';

CREATE TABLE IF NOT EXISTS public.ea_credentials (
  user_id uuid PRIMARY KEY,
  api_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.ea_credentials TO authenticated;
GRANT ALL ON public.ea_credentials TO service_role;
ALTER TABLE public.ea_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ea credentials read" ON public.ea_credentials FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own ea credentials update" ON public.ea_credentials FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.make_username(_email text)
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
declare
  base text := left(regexp_replace(lower(coalesce(split_part(_email, '@', 1), 'trader')), '[^a-z0-9]', '', 'g'), 20);
  candidate text;
begin
  if base = '' then base := 'trader'; end if;
  loop
    candidate := base || floor(random() * 90 + 10)::int::text;
    exit when not exists (select 1 from public.profiles where lower(username) = candidate);
  end loop;
  return candidate;
end $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  insert into public.profiles(id, email, full_name, username)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), public.make_username(new.email));
  insert into public.ea_credentials(user_id) values (new.id) on conflict do nothing;
  insert into public.user_roles(user_id, role) values (new.id, 'user');
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $function$;

UPDATE public.profiles SET username = public.make_username(email) WHERE username IS NULL;
UPDATE public.profiles SET
  first_name = coalesce(first_name, split_part(full_name, ' ', 1)),
  last_name = coalesce(last_name, nullif(substr(full_name, length(split_part(full_name, ' ', 1)) + 2), ''))
WHERE full_name IS NOT NULL;
INSERT INTO public.ea_credentials(user_id) SELECT id FROM public.profiles ON CONFLICT DO NOTHING;