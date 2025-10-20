-- Add RLS to app_settings_owner table
alter table public.app_settings_owner enable row level security;

-- Only platform owner can view the owner settings
drop policy if exists "Owner can view owner settings" on public.app_settings_owner;
create policy "Owner can view owner settings"
  on public.app_settings_owner
  for select
  to authenticated
  using (public.is_platform_owner());

-- Only platform owner can update owner settings
drop policy if exists "Owner can update owner settings" on public.app_settings_owner;
create policy "Owner can update owner settings"
  on public.app_settings_owner
  for update
  to authenticated
  using (public.is_platform_owner());

-- Prevent deletion of owner settings
drop policy if exists "Prevent owner settings deletion" on public.app_settings_owner;
create policy "Prevent owner settings deletion"
  on public.app_settings_owner
  for delete
  to authenticated
  using (false);