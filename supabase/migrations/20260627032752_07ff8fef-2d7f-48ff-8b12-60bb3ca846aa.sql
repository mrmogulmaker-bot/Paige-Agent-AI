
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_ref_code  text;
  v_full_name text;
  v_first     text;
  v_last      text;
  v_owner_id  uuid;
begin
  v_ref_code := nullif(upper(trim(new.raw_user_meta_data->>'referral_code')), '');
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', '');

  insert into public.profiles (user_id, full_name, referral_code)
  values (new.id, nullif(v_full_name, ''), v_ref_code);

  insert into public.user_roles (user_id, role)
  values (new.id, 'user');

  -- Auto-create CRM contact for every new signup (skip admins; there are none at insert time anyway).
  v_first := coalesce(nullif(split_part(v_full_name, ' ', 1), ''), split_part(coalesce(new.email, ''), '@', 1));
  v_last  := coalesce(nullif(substring(v_full_name from position(' ' in v_full_name) + 1), ''), '');

  -- Owner of the platform owns auto-created contacts so admins can see them
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
      lifecycle_stage, source, status
    ) values (
      v_owner_id,
      coalesce(nullif(v_first, ''), 'New'),
      v_last,
      new.email,
      new.id,
      'lead',
      'signup',
      'active'
    );
  exception when others then
    raise warning 'handle_new_user: client autocreate failed: %', sqlerrm;
  end;

  return new;
end;
$function$;
