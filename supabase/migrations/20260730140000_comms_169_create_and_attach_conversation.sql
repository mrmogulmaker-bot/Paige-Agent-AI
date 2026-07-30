-- §49 Wave B #169 — create_and_attach_conversation: the ONE atomic "start a conversation with a
-- person" seam behind the Conversations New-conversation modal (§18 one home). It resolve-or-creates
-- ONE contact per (tenant, email|phone) and smart-routes to the person's EXISTING thread for the
-- chosen channel instead of ever minting a second (§49 "one contact, one thread").
--
-- SCOPE (honest, §13): this ships the DEDUP SEAM (resolve-or-create + smart-route), made race-safe
-- TODAY by a transaction-level advisory lock on (tenant, normalized-key). The tenant-scoped UNIQUE
-- indexes on clients(email|phone) — the architectural backstop that makes dedup impossible to bypass
-- from EVERY producer — land in the immediate follow-up slice #169-B together with the §37
-- ON-CONFLICT hardening of all ~13 contact-creation producers (a UNIQUE index without that sweep is
-- the §37 "half-hardened is worse than un-hardened" trap). Prod `clients` is currently clean (3 rows,
-- 0 dupes) so #169-B's index will apply non-destructively; nothing here merges or deletes data.
--
-- §9: the tenant is ALWAYS derived server-side (current_user_tenant_id()); the p_tenant_id argument
-- is IGNORED for a JWT caller and honored ONLY for the trusted service-role path (auth.uid() IS NULL,
-- e.g. Paige headless), mirroring create_contact. A JWT caller can never mint into another tenant.

CREATE OR REPLACE FUNCTION public.create_and_attach_conversation(
  p_first_name text DEFAULT NULL,
  p_last_name  text DEFAULT NULL,
  p_email      text DEFAULT NULL,
  p_phone      text DEFAULT NULL,
  p_channel    text DEFAULT 'email',
  p_tenant_id  uuid DEFAULT NULL   -- honored ONLY for service-role (auth.uid() IS NULL); ignored for JWT (§9)
)
RETURNS TABLE (contact_id uuid, thread_id uuid, thread_key text, was_existing boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller  uuid := auth.uid();
  -- §9: JWT callers ALWAYS use their own tenant; only the trusted service-role path may pass a tenant.
  _tenant  uuid := CASE WHEN _caller IS NULL THEN COALESCE(p_tenant_id, public.current_user_tenant_id())
                        ELSE public.current_user_tenant_id() END;
  _email   text := lower(NULLIF(btrim(p_email), ''));
  _phone_digits text := NULLIF(regexp_replace(COALESCE(p_phone, ''), '[^0-9+]', '', 'g'), '');
  _channel text := lower(COALESCE(NULLIF(btrim(p_channel), ''), 'email'));
  _cid     uuid;
  _tid     uuid;
  _tkey    text;
  _counterparty text;
  _thread_existed boolean := false;
BEGIN
  -- JWT callers must be admin|coach (a NULL caller is the trusted service-role path, role-gated upstream).
  IF _caller IS NOT NULL AND NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'CONVO_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'CONVO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;
  IF _email IS NULL AND _phone_digits IS NULL AND NULLIF(btrim(p_first_name), '') IS NULL THEN
    RAISE EXCEPTION 'CONVO_NO_IDENTITY: an email, phone, or name is required' USING ERRCODE = '22023';
  END IF;

  -- Race-safety WITHOUT the (yet-to-land, #169-B) UNIQUE index: serialize concurrent resolve-or-create
  -- for the SAME (tenant, key) so two simultaneous "add" clicks can't mint two contacts. Xact-scoped,
  -- released at COMMIT. Keyed on the normalized email first, else phone.
  PERFORM pg_advisory_xact_lock(
    hashtext(_tenant::text || ':' || COALESCE(_email, _phone_digits, ''))
  );

  -- Resolve an EXISTING contact for this tenant by normalized email OR normalized phone (§49 dedup).
  IF _email IS NOT NULL THEN
    SELECT id INTO _cid FROM public.clients
     WHERE tenant_id = _tenant AND lower(btrim(email)) = _email
     ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF _cid IS NULL AND _phone_digits IS NOT NULL THEN
    SELECT id INTO _cid FROM public.clients
     WHERE tenant_id = _tenant
       AND regexp_replace(COALESCE(phone, ''), '[^0-9+]', '', 'g') = _phone_digits
     ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- None found → create ONE (matches create_contact's insert shape/defaults).
  IF _cid IS NULL THEN
    INSERT INTO public.clients (
      first_name, last_name, email, phone,
      lifecycle_stage, source, status, created_by, tenant_id
    ) VALUES (
      COALESCE(NULLIF(btrim(p_first_name), ''), NULLIF(split_part(COALESCE(_email, ''), '@', 1), ''), 'New'),
      COALESCE(NULLIF(btrim(p_last_name), ''), 'Contact'),
      NULLIF(btrim(p_email), ''), NULLIF(btrim(p_phone), ''),
      'new_lead', 'conversations', 'active', COALESCE(_caller, '00000000-0000-0000-0000-000000000000'::uuid), _tenant
    )
    RETURNING id INTO _cid;

    INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
    VALUES (_caller, 'client', 'create_and_attach_conversation', _cid,
            jsonb_build_object('tenant_id', _tenant, 'channel', _channel, 'via', 'conversations_compose'));
  END IF;

  -- Smart-route: the counterparty address for the chosen channel → the canonical thread_key,
  -- computed to EXACTLY match src canonicalThreadKey(channel, tenantId, counterparty):
  --   email  → lower(trim(address)) ; else → strip to [0-9+]. Key = 'channel:tenantId:cp'.
  _counterparty := CASE WHEN _channel = 'email' THEN _email ELSE _phone_digits END;
  IF _counterparty IS NOT NULL THEN
    _tkey := _channel || ':' || _tenant::text || ':' || _counterparty;
    SELECT t.id INTO _tid FROM public.threads t
     WHERE t.tenant_id = _tenant AND t.thread_key = _tkey LIMIT 1;
    _thread_existed := _tid IS NOT NULL;   -- honest: only true when a real thread already exists (§13)
  END IF;

  contact_id   := _cid;
  thread_id    := _tid;        -- NULL when no thread exists yet; the first Send coalesces one (no empty thread left behind)
  thread_key   := _tkey;
  was_existing := _thread_existed;
  RETURN NEXT;
END;
$$;

REVOKE ALL   ON FUNCTION public.create_and_attach_conversation(text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_and_attach_conversation(text, text, text, text, text, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_and_attach_conversation(text, text, text, text, text, uuid) IS
  '§49 #169: atomic resolve-or-create ONE contact per (tenant,email|phone) + smart-route to the existing thread for the channel (was_existing=true) or return the computed thread_key for the first Send to coalesce. Tenant server-derived (§9); race-safe via pg_advisory_xact_lock pending the #169-B UNIQUE indexes.';
