-- =============================================================================
-- Comms #10 — channel-of-origin (public.clients.created_by_channel_type)
-- =============================================================================
-- DOCTRINE HEADER
--  §37 producer walk. Records the CHANNEL through which each contact FIRST entered
--      the CRM as a bounded, ChannelType-aligned analytics/routing dimension —
--      DISTINCT from clients.source (unbounded free-text carrying three mixed grains:
--      tool 'paige', channel 'inbound_email'/'booking_page', provider 'external:typeform';
--      you cannot GROUP BY source to answer "contacts by channel"). §18: this is NOT a
--      second source — it is a normalized enum written at creation time, never a second
--      free-text bucket. Confirmed no equivalent origin-channel column exists today.
--  §13 Backfill: existing rows STAY NULL. A source->channel map would be lossy and
--      dishonest ('paige' is ambiguous between manual/api; inbound-SMS never created a
--      contact, so no historical row can be asserted sms-origin). NULL correctly means
--      "channel-of-origin unknown for this pre-#10 row." No retroactive guessing.
--  §9  Nullable, additive; RLS on public.clients is unchanged. Every server stamp sets
--      the value on the SAME tenant-scoped insert that already sets tenant_id.
--  §2  Coaching-generic; zero finance/credit wording.
--
--  VOCABULARY (13) — ChannelType-aligned (email|sms|whatsapp|instagram|facebook|voice,
--  mirrors src/pages/admin/conversations/inbox-shared.ts) + creation-specific
--  (manual|form|import|api|seed|signup|invite).
--    Actively stamped by a producer today: email, manual, form, import, api, signup, invite.
--    Reserved for near-term inbound handlers with NO creation site yet (§13 honest —
--    valid channel values, simply not produced anywhere at merge): sms, whatsapp,
--    instagram, facebook, voice, seed.
--
--  §37 PRODUCER WALK — every INSERT INTO public.clients site, and where it is stamped:
--    • handle-inbound-email                    -> 'email'   (edge, direct insert)
--    • NewContactDialog (manual "New Contact")  -> 'manual'  (frontend, direct insert)
--    • GrowthHub "send to contact"              -> 'form'    (frontend, direct insert)
--    • growth-inbound (external form bridge)     -> 'form'    (edge, direct insert)
--    • public-booking (guest find-or-create)     -> 'form'    (edge, direct insert)
--    • paige-bridge (MMA-OS/GHL mirror sync)     -> 'import'  (edge, direct insert)
--    • paige-mcp create_contact TOOL             -> 'api'     (edge, direct insert)
--    • create_contact() RPC (+ new p_channel)    -> caller-passed: paige-ai-chat 'api',
--                                                   growth-process-submission 'form'
--    • complete-signup (self-serve insert branch)-> 'signup'  (edge, direct insert)
--    • handle_new_user() signup trigger          -> 'signup'  (THIS migration)
--    • accept_tenant_invite() consumer branch    -> 'invite'  (THIS migration)
--  Confirmed NON-producers (create NO contact, so nothing to stamp): handle-inbound-sms
--  (skips creation when the sender is unresolved), handle-meta-webhook (IG/FB/WhatsApp —
--  no clients insert yet), twilio-inbound-webhook, webhook-inbound, accept-invite edge fn.
--
--  §37 note: create_contact() gains a NEW optional trailing arg (p_channel, DEFAULT NULL).
--  Additive + defaulted — a caller that omits it still resolves and writes NULL. Both live
--  callers are updated in this slice to pass their channel. The prior 14-arg signature is
--  DROPPED so there is exactly one overload (no ambiguous-function resolution).
-- =============================================================================

-- 1) The column + bounded CHECK + partial index --------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS created_by_channel_type text;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_created_by_channel_type_chk;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_created_by_channel_type_chk
  CHECK (created_by_channel_type IS NULL OR created_by_channel_type IN (
    'email','sms','whatsapp','instagram','facebook','voice',
    'manual','form','import','api','seed','signup','invite'
  ));

CREATE INDEX IF NOT EXISTS idx_clients_created_by_channel_type
  ON public.clients (created_by_channel_type)
  WHERE created_by_channel_type IS NOT NULL;

COMMENT ON COLUMN public.clients.created_by_channel_type IS
  'Channel-of-origin (#10): the bounded channel this contact first entered through. '
  'ChannelType-aligned + creation-specific. NULL = unknown / pre-#10 (never guessed, §13).';

-- 2) create_contact() RPC — add p_channel (DEFAULT NULL), stamp it on insert -----
--    Verbatim re-emit of the 20260711150000 body + the single p_channel addition.
DROP FUNCTION IF EXISTS public.create_contact(text, text, text, text, text, text, text, text, text[], text, text, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.create_contact(
  p_first_name text,
  p_last_name  text DEFAULT NULL,
  p_email      text DEFAULT NULL,
  p_phone      text DEFAULT NULL,
  p_entity_name text DEFAULT NULL,
  p_title      text DEFAULT NULL,
  p_lifecycle_stage text DEFAULT 'lead',
  p_source     text DEFAULT 'paige',
  p_tags       text[] DEFAULT '{}',
  p_primary_offer text DEFAULT NULL,
  p_notes      text DEFAULT NULL,
  p_assigned_coach_user_id uuid DEFAULT NULL,
  p_tenant_id  uuid DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_channel    text DEFAULT NULL           -- #10 channel-of-origin; NULL = unspecified (§13)
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller  uuid := auth.uid();
  _creator uuid := COALESCE(auth.uid(), p_created_by);  -- JWT caller wins; edge passes verified operator
  _tenant  uuid := COALESCE(p_tenant_id, public.current_user_tenant_id());
  _id uuid;
  _existing uuid;
  _email text := NULLIF(btrim(p_email), '');
BEGIN
  IF _creator IS NULL THEN
    RAISE EXCEPTION 'CONTACT_NO_OPERATOR: an operator context is required' USING ERRCODE = '42501';
  END IF;
  -- The effective creator must be admin|coach — always enforced now, JWT or edge path.
  IF NOT public.has_any_role(_creator, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'CONTACT_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'CONTACT_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;

  -- Idempotency on (created_by, lower(email)), keyed to the effective creator.
  IF _email IS NOT NULL THEN
    SELECT id INTO _existing FROM public.clients
     WHERE created_by = _creator AND lower(email) = lower(_email) LIMIT 1;
    IF _existing IS NOT NULL THEN RETURN _existing; END IF;
  END IF;

  INSERT INTO public.clients (
    first_name, last_name, email, phone, entity_name, title,
    lifecycle_stage, source, tags, primary_offer, current_notes,
    assigned_coach_user_id, status, created_by, tenant_id, created_by_channel_type
  ) VALUES (
    COALESCE(NULLIF(btrim(p_first_name), ''), NULLIF(split_part(COALESCE(_email,''), '@', 1), ''), 'New'),
    COALESCE(NULLIF(btrim(p_last_name), ''), 'Contact'),
    _email, NULLIF(btrim(p_phone), ''), NULLIF(btrim(p_entity_name), ''), NULLIF(btrim(p_title), ''),
    COALESCE(NULLIF(p_lifecycle_stage, ''), 'lead'), COALESCE(NULLIF(p_source, ''), 'paige'),
    COALESCE(p_tags, '{}'), NULLIF(btrim(p_primary_offer), ''), NULLIF(btrim(p_notes), ''),
    p_assigned_coach_user_id, 'active', _creator, _tenant, NULLIF(btrim(p_channel), '')
  )
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_creator, 'client', 'create_contact', _id,
          jsonb_build_object('tenant_id', _tenant, 'email', _email, 'source', p_source, 'channel', p_channel));

  RETURN _id;
END;
$$;

REVOKE ALL   ON FUNCTION public.create_contact(text, text, text, text, text, text, text, text, text[], text, text, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contact(text, text, text, text, text, text, text, text, text[], text, text, uuid, uuid, uuid, text) TO authenticated, service_role;

-- 3) handle_new_user() signup trigger — stamp 'signup' on the auto-created contact
--    Verbatim re-emit of the 20260627032752 body + the single created_by_channel_type
--    addition. CREATE OR REPLACE keeps the existing trigger binding intact.
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
      lifecycle_stage, source, status, created_by_channel_type
    ) values (
      v_owner_id,
      coalesce(nullif(v_first, ''), 'New'),
      v_last,
      new.email,
      new.id,
      'lead',
      'signup',
      'active',
      'signup'
    );
  exception when others then
    raise warning 'handle_new_user: client autocreate failed: %', sqlerrm;
  end;

  return new;
end;
$function$;

-- 4) accept_tenant_invite() — stamp 'invite' on the consumer-branch contact insert
--    Verbatim re-emit of the 20260714140017 body + the single created_by_channel_type
--    addition on the ONE consumer-branch INSERT (all other branches unchanged).
CREATE OR REPLACE FUNCTION public.accept_tenant_invite(_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tok public.tenant_invite_tokens;
  _email text;
  _full text;
  _first text;
  _last text;
  _client_id uuid;
  _existing_tenant uuid;
  _tenant_owner uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'must be signed in to accept an invite';
  END IF;

  SELECT * INTO _tok FROM public.tenant_invite_tokens WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite token not found'; END IF;
  IF _tok.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'invite has been revoked'; END IF;
  IF _tok.expires_at <= now() THEN RAISE EXCEPTION 'invite has expired'; END IF;
  IF _tok.max_uses IS NOT NULL AND _tok.uses >= _tok.max_uses THEN
    RAISE EXCEPTION 'invite has reached its usage limit';
  END IF;

  IF _tok.kind = 'consumer' THEN
    SELECT email, NULLIF(raw_user_meta_data->>'full_name', '')
      INTO _email, _full FROM auth.users WHERE id = _uid;
    SELECT owner_user_id INTO _tenant_owner FROM public.tenants WHERE id = _tok.tenant_id;
    _first := NULLIF(split_part(COALESCE(_full, ''), ' ', 1), '');
    IF _first IS NULL THEN _first := split_part(COALESCE(_email, 'there'), '@', 1); END IF;
    _last := COALESCE(NULLIF(trim(substr(COALESCE(_full, ''), length(split_part(COALESCE(_full, ''), ' ', 1)) + 1)), ''), '');

    SELECT id, tenant_id INTO _client_id, _existing_tenant
      FROM public.clients WHERE linked_user_id = _uid;
    IF _client_id IS NOT NULL THEN
      IF _existing_tenant IS DISTINCT FROM _tok.tenant_id THEN
        RAISE EXCEPTION 'This account is already registered as a client of another workspace. Please accept this invite with a different email address.';
      END IF;
      UPDATE public.clients
         SET status = 'active',
             onboarding_stage = COALESCE(onboarding_stage, 'invited'),
             updated_at = now()
       WHERE id = _client_id;
    ELSE
      IF _tok.contact_id IS NOT NULL THEN
        SELECT id INTO _client_id FROM public.clients
          WHERE id = _tok.contact_id AND tenant_id = _tok.tenant_id AND linked_user_id IS NULL;
      END IF;
      IF _client_id IS NULL THEN
        SELECT id INTO _client_id FROM public.clients
          WHERE tenant_id = _tok.tenant_id AND linked_user_id IS NULL
            AND email IS NOT NULL
            AND lower(email) = lower(COALESCE(_tok.email, _email))
          ORDER BY created_at ASC LIMIT 1;
      END IF;
      IF _client_id IS NOT NULL THEN
        UPDATE public.clients
           SET linked_user_id = _uid, status = 'active',
               onboarding_stage = COALESCE(onboarding_stage, 'invited'), updated_at = now()
         WHERE id = _client_id;
      ELSE
        INSERT INTO public.clients (tenant_id, created_by, email, first_name, last_name, linked_user_id, onboarding_stage, status, created_by_channel_type)
        VALUES (_tok.tenant_id, COALESCE(_tok.created_by, _tenant_owner, _uid), _email, _first, _last, _uid, 'invited', 'active', 'invite')
        RETURNING id INTO _client_id;
      END IF;
    END IF;

    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'client')
    ON CONFLICT (user_id, role) DO NOTHING;

  ELSIF _tok.kind = 'subaccount_owner' THEN
    SELECT email INTO _email FROM auth.users WHERE id = _uid;
    IF _tok.email IS NOT NULL AND lower(_tok.email) <> lower(COALESCE(_email, '')) THEN
      RAISE EXCEPTION 'This invite was sent to a different email address. Accept it while signed in as %', _tok.email;
    END IF;
    INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
    VALUES (_tok.tenant_id, _uid, 'admin', 'active', now())
    ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET role = 'admin',
          status = 'active',
          joined_at = COALESCE(public.tenant_members.joined_at, now()),
          updated_at = now();

  ELSIF _tok.kind = 'agency_team' THEN
    SELECT email INTO _email FROM auth.users WHERE id = _uid;
    IF _tok.email IS NOT NULL AND lower(_tok.email) <> lower(COALESCE(_email, '')) THEN
      RAISE EXCEPTION 'This invite was sent to a different email address. Accept it while signed in as %', _tok.email;
    END IF;
    IF _tok.agency_role IS NULL OR _tok.agency_role NOT IN
       ('agency_admin','agency_manager','agency_biller','agency_specialist','agency_viewer') THEN
      RAISE EXCEPTION 'This agency invite is missing a valid role. Ask the agency to resend it.';
    END IF;

    DELETE FROM public.agency_team_members
     WHERE agency_tenant_id = _tok.tenant_id
       AND user_id IS NULL
       AND email IS NOT NULL
       AND lower(email) = lower(COALESCE(_email, ''));

    UPDATE public.agency_team_members
       SET agency_role = _tok.agency_role,
           status = 'active',
           email = COALESCE(email, _email),
           joined_at = COALESCE(joined_at, now()),
           updated_at = now()
     WHERE agency_tenant_id = _tok.tenant_id AND user_id = _uid;
    IF NOT FOUND THEN
      INSERT INTO public.agency_team_members
        (agency_tenant_id, user_id, email, agency_role, status, invited_by, invited_at, joined_at)
      VALUES
        (_tok.tenant_id, _uid, _email, _tok.agency_role, 'active', _tok.created_by, _tok.created_at, now());
    END IF;

  ELSE
    -- SECURITY (Tier Rail Phase A): a generic staff/'team' invite may only grant
    -- tenant_members on a NON-agency tenant. Agency/enterprise authority must be
    -- granted through kind='agency_team' (→ agency_team_members), never through a
    -- staff-membership row that inference could read as agency-console access.
    IF (SELECT account_type FROM public.tenants WHERE id = _tok.tenant_id)
         IN ('agency','enterprise') THEN
      RAISE EXCEPTION 'Staff invites cannot grant access on an agency or enterprise account. Use an agency team invite instead.';
    END IF;

    INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
    VALUES (_tok.tenant_id, _uid, _tok.default_role, 'active', now())
    ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET status = 'active',
          joined_at = COALESCE(public.tenant_members.joined_at, now()),
          updated_at = now();
  END IF;

  UPDATE public.tenant_invite_tokens SET uses = uses + 1, last_used_at = now() WHERE id = _tok.id;
  UPDATE public.profiles SET active_tenant_id = _tok.tenant_id WHERE user_id = _uid;

  RETURN _tok.tenant_id;
END $function$;

REVOKE ALL ON FUNCTION public.accept_tenant_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invite(text) TO service_role;
