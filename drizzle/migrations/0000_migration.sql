create type public.app_role as enum ('admin','user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, full_name text, phone text, country text,
  default_instrument text default 'XAUUSD',
  notifications_enabled boolean not null default true,
  email_opt_out boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null, unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own roles read" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admin manage roles" on public.user_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'));
  insert into public.user_roles(user_id, role) values (new.id, 'user');
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- public catalog tables
create table public.brokers (
  id uuid primary key default gen_random_uuid(),
  name text not null, description text, logo_url text, partner_url text,
  platforms text[] not null default '{mt5}', is_active boolean not null default true,
  sort_order int not null default 0, created_at timestamptz not null default now()
);
create table public.instruments (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique, name text not null, category text not null default 'forex',
  tv_symbol text not null, is_active boolean not null default true, sort_order int not null default 0
);
create table public.ea_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null, notes text, file_url text, is_latest boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.ai_models (
  id uuid primary key default gen_random_uuid(),
  name text not null, model_id text not null, description text,
  is_active boolean not null default true, is_default boolean not null default false
);
create table public.app_settings (
  key text primary key, value jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);
grant select on public.brokers, public.instruments, public.ea_releases, public.app_settings to anon;
grant select on public.brokers, public.instruments, public.ea_releases, public.ai_models, public.app_settings to authenticated;
grant insert, update, delete on public.brokers, public.instruments, public.ea_releases, public.ai_models, public.app_settings to authenticated;
grant all on public.brokers, public.instruments, public.ea_releases, public.ai_models, public.app_settings to service_role;
alter table public.brokers enable row level security;
alter table public.instruments enable row level security;
alter table public.ea_releases enable row level security;
alter table public.ai_models enable row level security;
alter table public.app_settings enable row level security;
create policy "public read brokers" on public.brokers for select to anon, authenticated using (is_active or public.has_role(auth.uid(),'admin'));
create policy "admin brokers" on public.brokers for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "public read instruments" on public.instruments for select to anon, authenticated using (is_active or public.has_role(auth.uid(),'admin'));
create policy "admin instruments" on public.instruments for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "public read ea" on public.ea_releases for select to anon, authenticated using (true);
create policy "admin ea" on public.ea_releases for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "read models" on public.ai_models for select to authenticated using (true);
create policy "admin models" on public.ai_models for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "public read settings" on public.app_settings for select to anon, authenticated using (true);
create policy "admin settings" on public.app_settings for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- user data
create table public.trading_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  platform text not null default 'mt5' check (platform in ('mt5','tradelocker')),
  label text, login text not null, server text, broker_name text,
  ea_key uuid not null default gen_random_uuid() unique,
  currency text default 'USD', balance numeric default 0, equity numeric default 0, free_margin numeric default 0,
  leverage int, lot_size numeric not null default 0.01,
  auto_trading boolean not null default false,
  last_seen_at timestamptz, created_at timestamptz not null default now()
);
create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  symbol text not null, timeframe text, direction text not null, confidence int,
  entry numeric, stop_loss numeric, take_profit numeric, summary text,
  created_at timestamptz not null default now()
);
create table public.trade_commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  command text not null, payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued', result text,
  created_at timestamptz not null default now(), executed_at timestamptz
);
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  ticket text not null, symbol text not null, side text not null, volume numeric not null,
  open_price numeric, close_price numeric, stop_loss numeric, take_profit numeric, profit numeric default 0,
  status text not null default 'open', opened_at timestamptz, closed_at timestamptz,
  unique(account_id, ticket)
);
create table public.hedge_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  symbol text not null, lot_size numeric not null default 0.01,
  group_a uuid[] not null default '{}', group_b uuid[] not null default '{}',
  side_a text not null default 'buy',
  trades_per_account int, until_no_margin boolean not null default false,
  trigger_type text not null default 'time', trigger_at timestamptz, trigger_price numeric,
  status text not null default 'armed', created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.trading_accounts, public.analyses, public.trade_commands, public.trades, public.hedge_plans to authenticated;
grant all on public.trading_accounts, public.analyses, public.trade_commands, public.trades, public.hedge_plans to service_role;
alter table public.trading_accounts enable row level security;
alter table public.analyses enable row level security;
alter table public.trade_commands enable row level security;
alter table public.trades enable row level security;
alter table public.hedge_plans enable row level security;
create policy "own accounts" on public.trading_accounts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admin read accounts" on public.trading_accounts for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "own analyses" on public.analyses for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own commands" on public.trade_commands for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and exists (select 1 from public.trading_accounts a where a.id = account_id and a.user_id = auth.uid()));
create policy "own trades read" on public.trades for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own hedges" on public.hedge_plans for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- admin/global
create table public.signals (
  id uuid primary key default gen_random_uuid(),
  symbol text not null, direction text not null, entry numeric, stop_loss numeric, take_profit numeric,
  note text, is_active boolean not null default true, created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null, body text not null, status text not null default 'draft',
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid default auth.uid(), action text not null, details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 255),
  message text not null check (char_length(message) between 1 and 2000),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.signals, public.campaigns to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant insert on public.contact_messages to anon, authenticated;
grant select, delete on public.contact_messages to authenticated;
grant all on public.signals, public.campaigns, public.audit_logs, public.contact_messages to service_role;
alter table public.signals enable row level security;
alter table public.campaigns enable row level security;
alter table public.audit_logs enable row level security;
alter table public.contact_messages enable row level security;
create policy "users read signals" on public.signals for select to authenticated using (is_active or public.has_role(auth.uid(),'admin'));
create policy "admin signals" on public.signals for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin campaigns" on public.campaigns for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin audit read" on public.audit_logs for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "audit insert" on public.audit_logs for insert to authenticated with check (actor_id = auth.uid());
create policy "anyone contact" on public.contact_messages for insert to anon, authenticated with check (true);
create policy "admin contact read" on public.contact_messages for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admin contact delete" on public.contact_messages for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- seed
insert into public.instruments(symbol,name,category,tv_symbol,sort_order) values
('XAUUSD','Gold / US Dollar','metals','OANDA:XAUUSD',1),
('EURUSD','Euro / US Dollar','forex','FX:EURUSD',2),
('GBPUSD','British Pound / US Dollar','forex','FX:GBPUSD',3),
('USDJPY','US Dollar / Japanese Yen','forex','FX:USDJPY',4),
('BTCUSD','Bitcoin / US Dollar','crypto','BITSTAMP:BTCUSD',5),
('US30','Dow Jones 30','indices','FOREXCOM:DJI',6),
('NAS100','Nasdaq 100','indices','FOREXCOM:NSXUSD',7);
insert into public.brokers(name,description,partner_url,platforms,sort_order) values
('Exness','Global multi-asset broker with low spreads.','https://www.exness.com','{mt5}',1),
('IC Markets','Raw spread ECN broker.','https://www.icmarkets.com','{mt5}',2),
('FTMO','Prop trading evaluation accounts.','https://ftmo.com','{mt5,tradelocker}',3);
insert into public.ai_models(name,model_id,description,is_default) values
('Arrissa Astra','openai/gpt-6-astra','Deep market reasoning',true);
insert into public.app_settings(key,value) values ('platform','{"maintenance":false,"signup_open":true}');