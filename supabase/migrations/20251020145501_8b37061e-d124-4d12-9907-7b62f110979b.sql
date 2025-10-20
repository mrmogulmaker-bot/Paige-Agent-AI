-- Owner safeguard to prevent lockout and ensure permanent admin access for platform owner

-- 1) Store platform owner email
create table if not exists public.app_settings_owner (
  owner_email text primary key
);

insert into public.app_settings_owner (owner_email)
values ('mrmogulmaker@gmail.com')
on conflict (owner_email) do update set owner_email = excluded.owner_email;

-- 2) Helper: identify platform owner from JWT email
create or replace function public.is_platform_owner()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims json;
  email text;
  owner text;
begin
  select current_setting('request.jwt.claims', true)::json into claims;
  email := coalesce(claims->>'email','');
  select owner_email into owner from public.app_settings_owner limit 1;
  return email = owner;
end;
$$;

-- 3) Ensure RLS on user_roles and grant owner full management rights there
alter table public.user_roles enable row level security;

drop policy if exists "Owner can select user_roles" on public.user_roles;
create policy "Owner can select user_roles"
  on public.user_roles
  for select
  to authenticated
  using (public.is_platform_owner());

drop policy if exists "Owner can insert user_roles" on public.user_roles;
create policy "Owner can insert user_roles"
  on public.user_roles
  for insert
  to authenticated
  with check (public.is_platform_owner());

drop policy if exists "Owner can update user_roles" on public.user_roles;
create policy "Owner can update user_roles"
  on public.user_roles
  for update
  to authenticated
  using (public.is_platform_owner());

drop policy if exists "Owner can delete user_roles" on public.user_roles;
create policy "Owner can delete user_roles"
  on public.user_roles
  for delete
  to authenticated
  using (public.is_platform_owner());

-- 4) Function to guarantee owner has admin role
create or replace function public.ensure_owner_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_email text;
  uid uuid;
begin
  select o.owner_email into owner_email from public.app_settings_owner o limit 1;
  if owner_email is null then
    return;
  end if;

  select id into uid from auth.users where email = owner_email limit 1;
  if uid is null then
    return;
  end if;

  -- assumes public.app_role enum with value 'admin' exists
  insert into public.user_roles (user_id, role)
  values (uid, 'admin'::public.app_role)
  on conflict (user_id, role) do nothing;
end;
$$;

-- 5) Prevent accidental removal of owner's admin role
create or replace function public.prevent_owner_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_email text;
  owner_id uuid;
begin
  select o.owner_email into owner_email from public.app_settings_owner o limit 1;
  if owner_email is null then
    return coalesce(new, old);
  end if;

  select id into owner_id from auth.users where email = owner_email limit 1;

  if tg_op in ('DELETE','UPDATE')
     and old.role = 'admin'::public.app_role
     and old.user_id = owner_id then
    raise exception 'Cannot remove admin role from platform owner';
  end if;

  return coalesce(new, old);
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'protect_owner_admin'
  ) then
    create trigger protect_owner_admin
    before update or delete on public.user_roles
    for each row
    execute function public.prevent_owner_admin_removal();
  end if;
end;
$$;

-- 6) Enforce now
select public.ensure_owner_admin();