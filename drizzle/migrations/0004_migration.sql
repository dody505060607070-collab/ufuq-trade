alter table public.profiles add column if not exists approval_status text not null default 'pending';
update public.profiles set approval_status = 'approved';

create or replace function public.is_approved(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = _user_id and approval_status = 'approved')
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
begin
  insert into public.profiles(id, email, full_name, username, approval_status)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), public.make_username(new.email),
    case when exists (select 1 from public.user_roles where role = 'admin') then 'pending' else 'approved' end);
  insert into public.ea_credentials(user_id) values (new.id) on conflict do nothing;
  insert into public.user_roles(user_id, role) values (new.id, 'user');
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $function$;

-- Users must not approve themselves
create or replace function public.guard_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.approval_status is distinct from old.approval_status
     and auth.uid() is not null and not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only an admin can change approval';
  end if;
  return new;
end $$;
drop trigger if exists guard_approval on public.profiles;
create trigger guard_approval before update on public.profiles for each row execute function public.guard_approval();

do $$ declare t text; begin
  foreach t in array array['trading_accounts','trade_commands','autopilot_settings','analyses','hedge_plans'] loop
    execute format('drop policy if exists "Approved users only" on public.%I', t);
    execute format('create policy "Approved users only" on public.%I as restrictive for all to authenticated using (public.is_approved(auth.uid())) with check (public.is_approved(auth.uid()))', t);
  end loop;
end $$;

drop policy if exists "Admins update profiles" on public.profiles;
create policy "Admins update profiles" on public.profiles for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
drop policy if exists "Admins read profiles" on public.profiles;
create policy "Admins read profiles" on public.profiles for select to authenticated using (public.has_role(auth.uid(),'admin'));