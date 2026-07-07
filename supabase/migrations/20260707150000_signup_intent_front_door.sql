-- Front-door intent routing at signup (Doctrine §200 — behavior driven by
-- signup metadata, no tenant hardcoded).
--
-- The old handle_new_user() made EVERY signup a consumer: it granted the
-- 'user' role and auto-created a `clients` (CRM contact) row for everyone.
-- That's the "front door only makes consumers" bug.
--
-- New behavior branches on raw_user_meta_data->>'signup_intent':
--   * 'business' → a tenant/coach signing up (main door). We create the
--       profile + base role only. NO consumer client row. Tenant + owner
--       role are granted later when their subscription provisions the tenant.
--   * 'member' (default) → an end-user, usually arriving through a coach's
--       tenant-scoped join link. We keep the consumer behavior and stamp the
--       client row with the JOINING tenant, resolved from
--       raw_user_meta_data->>'join_tenant_slug' when present (else the default
--       stamp trigger / owner tenant applies).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_ref_code   text;
  v_full_name  text;
  v_first      text;
  v_last       text;
  v_owner_id   uuid;
  v_intent     text;
  v_join_slug  text;
  v_tenant_id  uuid;
begin
  v_ref_code  := nullif(upper(trim(new.raw_user_meta_data->>'referral_code')), '');
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', '');
  v_intent    := lower(coalesce(nullif(trim(new.raw_user_meta_data->>'signup_intent'), ''), 'member'));
  v_join_slug := nullif(trim(new.raw_user_meta_data->>'join_tenant_slug'), '');

  insert into public.profiles (user_id, full_name, referral_code)
  values (new.id, nullif(v_full_name, ''), v_ref_code);

  -- Base role for everyone. Elevated roles (tenant owner/admin, coach) are
  -- granted at provisioning/invite time, never implicitly at signup.
  insert into public.user_roles (user_id, role)
  values (new.id, 'user');

  -- BUSINESS intent: no consumer client. Tenant + ownership provision later
  -- (subscription-gated). Front-end routes these users to plan selection.
  if v_intent = 'business' then
    return new;
  end if;

  -- MEMBER intent (default): auto-create the CRM contact under the tenant the
  -- member is joining. Resolve it from the coach's join-link slug if provided.
  if v_join_slug is not null then
    select id into v_tenant_id from public.tenants where slug = v_join_slug limit 1;
  end if;

  v_first := coalesce(nullif(split_part(v_full_name, ' ', 1), ''), split_part(coalesce(new.email, ''), '@', 1));
  v_last  := coalesce(nullif(substring(v_full_name from position(' ' in v_full_name) + 1), ''), '');

  -- Owner of the platform owns auto-created contacts so admins can see them.
  select u.id into v_owner_id
  from auth.users u
  join public.app_settings_owner o on lower(u.email) = lower(o.owner_email)
  limit 1;
  if v_owner_id is null then
    v_owner_id := new.id; -- fallback so NOT NULL constraint holds
  end if;

  begin
    insert into public.clients (
      created_by, first_name, last_name, email, linked_user_id,
      lifecycle_stage, source, status, tenant_id
    ) values (
      v_owner_id,
      coalesce(nullif(v_first, ''), 'New'),
      v_last,
      new.email,
      new.id,
      'lead',
      'signup',
      'active',
      v_tenant_id  -- NULL → existing stamp_tenant_id trigger / default applies
    );
  exception when others then
    raise warning 'handle_new_user: client autocreate failed: %', sqlerrm;
  end;

  return new;
end;
$function$;
