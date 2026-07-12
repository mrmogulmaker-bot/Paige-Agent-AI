-- Paige Context Rail — Step 2 realtime (task #152 cont.).
--
-- Step 1 shipped the append-only rail + RPCs. This step lights subscribed
-- surfaces LIVE when a rail row lands — WITHOUT ever leaking an owner_internal
-- event to a client. It mirrors EXACTLY the presence realtime pattern
-- (20260712170000): a SECURITY DEFINER topic-authorizer + realtime.messages
-- SELECT policy gate who may RECEIVE, and the SERVER broadcasts from inside the
-- DEFINER RPC (bypassing RLS to SEND). Clients never broadcast the rail.
--
-- Two topic families:
--   'rail:tenant:<tenant_id>'  — staff subscribe, receive EVERY tenant event.
--   'rail:client:<contact_id>' — the portal client subscribes, receives ONLY
--                                client-visible ('client'/'both' + client_visible) events.
--
-- realtime.messages is RLS-on, deny-all baseline; the presence migration only
-- ADDED policies. We ADD rail policies the same way — nothing else loosens.
-- Confirmed signature: realtime.send(payload jsonb, event text, topic text, private boolean) RETURNS void.

-- ── (0) Tighten reads to RPC-only, matching the presence layer ───────────────
-- Step 1 granted authenticated SELECT so the RLS policies could be proven; but
-- the real read path is the get_client_rail DEFINER RPC (lens-scoped hydration)
-- and realtime broadcast — nothing reads the tables directly. Revoke the grant so
-- the rail is not exposed via PostgREST/GraphQL (RLS policies remain as latent
-- defense-in-depth if a grant is ever re-added). Consistent with user_presence.
REVOKE SELECT ON public.paige_client_events FROM authenticated;
REVOKE SELECT ON public.paige_event_kinds  FROM authenticated;

-- ── (A) TOPIC AUTHORIZER — who may RECEIVE on a rail topic (the wall) ─────────
CREATE OR REPLACE FUNCTION public.can_access_rail_topic(_topic text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant     uuid := public.current_user_tenant_id();
  v_uid        uuid := auth.uid();
  v_contact_id uuid;
  v_ct_tenant  uuid;
BEGIN
  IF v_uid IS NULL OR _topic IS NULL THEN
    RETURN false;
  END IF;

  -- Owner topic: this caller's own tenant, and a staff/owner role.
  IF v_tenant IS NOT NULL AND _topic = 'rail:tenant:' || v_tenant::text THEN
    RETURN public.is_platform_owner()
        OR public.has_any_role(v_uid, ARRAY['admin','super_admin','coach']);
  END IF;

  -- Client topic: parse the contact uuid after the prefix; a non-uuid is not
  -- an error, just a non-match. A guessed cross-tenant contact must fail.
  IF _topic LIKE 'rail:client:%' THEN
    BEGIN
      v_contact_id := substring(_topic FROM 13)::uuid;  -- 'rail:client:' is 12 chars
    EXCEPTION WHEN others THEN
      RETURN false;
    END;

    SELECT c.tenant_id INTO v_ct_tenant FROM public.clients c WHERE c.id = v_contact_id;
    IF v_ct_tenant IS NULL THEN
      RETURN false;
    END IF;

    -- The subject client themselves, OR the platform owner, OR same-tenant staff.
    RETURN EXISTS (
             SELECT 1 FROM public.clients c
             WHERE c.id = v_contact_id AND c.linked_user_id = v_uid
           )
        OR public.is_platform_owner()
        OR (v_ct_tenant = v_tenant
            AND public.has_any_role(v_uid, ARRAY['admin','super_admin','coach']));
  END IF;

  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.can_access_rail_topic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_rail_topic(text) TO authenticated;

-- ── (B) REALTIME POLICIES — receive gate only (server-side send needs none) ──
DROP POLICY IF EXISTS "rail topic read authorized" ON realtime.messages;
CREATE POLICY "rail topic read authorized"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.topic() LIKE 'rail:%'
    AND public.can_access_rail_topic(realtime.topic())
  );

-- No INSERT policy: clients/staff never broadcast the rail themselves — the
-- server-side realtime.send inside record_rail_event (SECURITY DEFINER) does it.
-- Leaving INSERT unpoliced keeps the deny-all baseline for direct client sends.

-- ── (C) WRITE SEAM — record_rail_event, now broadcasting (body verbatim + send)
CREATE OR REPLACE FUNCTION public.record_rail_event(
  p_contact_id       uuid,
  p_event_kind       text,
  p_surface          text,
  p_actor_type       text,
  p_title            text,
  p_summary          text DEFAULT NULL,
  p_payload          jsonb DEFAULT '{}'::jsonb,
  p_ref_table        text DEFAULT NULL,
  p_ref_id           uuid DEFAULT NULL,
  p_from_department  text DEFAULT NULL,
  p_to_department    text DEFAULT NULL,
  p_occurred_at      timestamptz DEFAULT NULL,
  p_narrow_to_owner  boolean DEFAULT false,
  p_tenant_id        uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_tenant    uuid;
  v_kind      public.paige_event_kinds%ROWTYPE;
  v_audience  text;
  v_visibility text;
  v_actor     uuid;
  v_id        uuid;
  v_occurred  timestamptz;
  v_from_dept text;
BEGIN
  IF v_uid IS NOT NULL THEN
    v_tenant := public.current_user_tenant_id();
    IF p_tenant_id IS NOT NULL AND p_tenant_id <> v_tenant THEN
      RAISE EXCEPTION 'tenant mismatch' USING errcode = '42501';
    END IF;
  ELSE
    IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'p_tenant_id required for service caller'; END IF;
    v_tenant := p_tenant_id;
  END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'no tenant resolved'; END IF;

  SELECT * INTO v_kind FROM public.paige_event_kinds
    WHERE slug = p_event_kind AND enabled AND (tenant_id IS NULL OR tenant_id = v_tenant);
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown or unavailable event kind: %', p_event_kind; END IF;

  PERFORM 1 FROM public.clients c WHERE c.id = p_contact_id AND c.tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'contact not in tenant' USING errcode = '42501'; END IF;

  v_audience   := CASE WHEN p_narrow_to_owner THEN 'owner' ELSE v_kind.default_audience END;
  v_visibility := CASE WHEN v_audience = 'owner' THEN 'owner_internal' ELSE v_kind.default_visibility END;
  v_actor      := CASE WHEN p_actor_type IN ('owner_staff','client') THEN v_uid ELSE NULL END;
  v_from_dept  := COALESCE(p_from_department, v_kind.department);

  INSERT INTO public.paige_client_events (
    tenant_id, contact_id, event_kind, surface, actor_type, actor_user_id,
    audience, visibility, from_department, to_department,
    title, summary, payload, ref_table, ref_id, occurred_at
  ) VALUES (
    v_tenant, p_contact_id, p_event_kind, p_surface, p_actor_type, v_actor,
    v_audience, v_visibility,
    v_from_dept, p_to_department,
    p_title, p_summary, COALESCE(p_payload, '{}'::jsonb), p_ref_table, p_ref_id,
    COALESCE(p_occurred_at, now())
  ) RETURNING id, occurred_at INTO v_id, v_occurred;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, data)
  VALUES (v_uid, 'paige_rail_event', 'paige_client_events', v_id,
          jsonb_build_object('kind', p_event_kind, 'surface', p_surface, 'contact_id', p_contact_id, 'audience', v_audience));

  -- ── Broadcast (§13: the row + audit are the source of truth; a dropped
  -- broadcast is acceptable, a lost row is not). The savepoint guarantees a
  -- realtime failure NEVER rolls back the committed row/audit above.
  BEGIN
    -- Owner topic ALWAYS: staff see every event, full payload included.
    PERFORM realtime.send(
      jsonb_build_object(
        'id',              v_id,
        'tenant_id',       v_tenant,
        'contact_id',      p_contact_id,
        'event_kind',      p_event_kind,
        'surface',         p_surface,
        'actor_type',      p_actor_type,
        'audience',        v_audience,
        'visibility',      v_visibility,
        'from_department', v_from_dept,
        'to_department',   p_to_department,
        'title',           p_title,
        'summary',         p_summary,
        'payload',         COALESCE(p_payload, '{}'::jsonb),
        'occurred_at',     v_occurred
      ),
      'rail_event',
      'rail:tenant:' || v_tenant::text,
      true
    );

    -- Client topic ONLY for client-visible events. owner_internal NEVER sends
    -- here. The client payload carries ONLY client-safe fields — no internal
    -- payload, no owner-only detail.
    IF v_audience IN ('client','both') AND v_visibility = 'client_visible' THEN
      PERFORM realtime.send(
        jsonb_build_object(
          'id',          v_id,
          'contact_id',  p_contact_id,
          'event_kind',  p_event_kind,
          'surface',     p_surface,
          'actor_type',  p_actor_type,
          'audience',    v_audience,
          'visibility',  v_visibility,
          'title',       p_title,
          'summary',     p_summary,
          'occurred_at', v_occurred
        ),
        'rail_event',
        'rail:client:' || p_contact_id::text,
        true
      );
    END IF;
  EXCEPTION WHEN others THEN
    -- Broadcast is best-effort; the persisted event is authoritative. Log so a
    -- persistent realtime outage isn't wholly invisible, but never fail the write.
    RAISE WARNING 'rail broadcast failed for event %: %', v_id, SQLERRM;
  END;

  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.record_rail_event(uuid,text,text,text,text,text,jsonb,text,uuid,text,text,timestamptz,boolean,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_rail_event(uuid,text,text,text,text,text,jsonb,text,uuid,text,text,timestamptz,boolean,uuid) TO authenticated, service_role;
