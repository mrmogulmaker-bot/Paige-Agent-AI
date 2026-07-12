-- ─────────────────────────────────────────────────────────────────────────────
-- PAIGE CONTEXT RAIL — STEP 4: the client side (two-way close)
--
-- Steps 1–3 built the rail (append-only projection + realtime + registry) and
-- wired the OWNER side (paige-ai-chat producer + hydration). Step 4 closes the
-- loop from the CLIENT side so the client portal is a first-class rail producer
-- feeding Paige-the-orchestrator in real time — exactly the north star (§7/§8):
-- the Client Experience team relays a client move → it lands on the rail → the
-- Owner Ops brain ("Your Paige", command-center feed) sees it live and can act,
-- while the client sees their OWN activity live on rail:client:<contact>.
--
-- THE GAP THIS CLOSES (identified in Step 2.1): a PORTAL CLIENT is authenticated
-- (auth.uid() is set) but is NOT a tenant_member, so current_user_tenant_id()
-- returns NULL for them. record_rail_event therefore raised 'no tenant resolved'
-- BEFORE its writer-auth gate could ever admit a legitimate client write — the
-- client side could never emit. This migration teaches record_rail_event to
-- resolve the tenant FROM the subject contact, but ONLY when the caller genuinely
-- IS that linked client filing a client event, and — critically — tightens the
-- writer gate so a subject client may file ONLY client-visible kinds (see §9).
--
-- Three changes, all additive / CREATE OR REPLACE (no new tables, no new kinds:
-- 'client.action_response' is already seeded coaching-generic in Step 1):
--   (A) record_rail_event      — subject-client tenant resolution + §9 kind guard.
--   (B) customer_respond_to_action — advance the linked action-bus row (§8) AND
--                                    emit 'client.action_response' (best-effort).
--   (Edge, separate file) paige-ai-chat — emit 'client.message' when a portal
--                                    client sends a message (service-role path).
--
-- Doctrine:
--   §7/§8  the client portal is a rail producer; the loop closes both ways.
--   §9     A CLIENT MUST ONLY EVER FILE THEIR OWN client-visible event for their
--          OWN contact. Two independent gates enforce this: (1) tenant resolution
--          only fires for actor_type='client' + linked_user_id=auth.uid(), so a
--          client can never borrow another contact's tenant; (2) the writer gate
--          rejects a subject client whose kind is not client_visible (or is
--          narrowed to owner) — this is what still makes it IMPOSSIBLE for a
--          client to inject an owner_internal ('owner.*'/narrowed) event even
--          though they pass actor_type='client'. Staff (non-NULL tenant) and
--          service callers are unaffected. No owner data is ever exposed to a
--          client by this migration.
--   §13    least-privilege + truthful: the rail emit and the action-bus advance
--          are best-effort — telemetry/coordination must never roll back the
--          client's core response (the response is the product).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── (A) record_rail_event — resolve tenant from the subject contact for the ─────
--        linked portal client, and restrict subject clients to client-visible
--        kinds. Body is the Step 2.1 definition EXCEPT the two marked STEP 4
--        blocks (tenant resolution + writer-gate kind guard). Every other guard —
--        kind lookup, contact-in-tenant, audience/visibility derivation, dual
--        broadcast, audit — is unchanged.
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
    -- STEP 4: portal-client tenant resolution. A signed-in client is NOT a
    -- tenant_member, so current_user_tenant_id() is NULL for them and the staff
    -- path never resolves a tenant. Resolve it from the SUBJECT contact, but ONLY
    -- when this caller IS that contact's linked_user_id AND is filing a client
    -- event. The linked_user_id predicate is the same identity the writer gate and
    -- RLS enforce, so a client can never borrow another contact's tenant. Staff
    -- (non-NULL tenant above) never reach this branch — their path is unchanged.
    IF v_tenant IS NULL AND p_actor_type = 'client' THEN
      SELECT c.tenant_id INTO v_tenant
        FROM public.clients c
       WHERE c.id = p_contact_id AND c.linked_user_id = v_uid;
    END IF;
    IF p_tenant_id IS NOT NULL AND v_tenant IS NOT NULL AND p_tenant_id <> v_tenant THEN
      RAISE EXCEPTION 'tenant mismatch' USING errcode = '42501';
    END IF;
  ELSE
    IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'p_tenant_id required for service caller'; END IF;
    v_tenant := p_tenant_id;
  END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'no tenant resolved' USING errcode = '42501'; END IF;

  SELECT * INTO v_kind FROM public.paige_event_kinds
    WHERE slug = p_event_kind AND enabled AND (tenant_id IS NULL OR tenant_id = v_tenant);
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown or unavailable event kind: %', p_event_kind; END IF;

  PERFORM 1 FROM public.clients c WHERE c.id = p_contact_id AND c.tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'contact not in tenant' USING errcode = '42501'; END IF;

  -- WRITER AUTH (§13 least-privilege, §9 seam): a JWT caller may write only if they
  -- are staff of the tenant, OR they are the subject client filing a CLIENT-VISIBLE
  -- client event. STEP 4 restricts the subject-client branch to client-visible,
  -- non-narrowed kinds — without this, resolving the tenant above would let a
  -- client inject an owner_internal ('owner.*'/narrowed) event into the coach's
  -- rail under actor_type='client'. Service callers (v_uid NULL) stay trusted.
  IF v_uid IS NOT NULL THEN
    IF public.has_any_role(v_uid, ARRAY['admin','super_admin','coach']) THEN
      NULL;  -- staff of the tenant may file any kind
    ELSIF p_actor_type = 'client'
          AND EXISTS (SELECT 1 FROM public.clients c
                       WHERE c.id = p_contact_id AND c.linked_user_id = v_uid) THEN
      IF p_narrow_to_owner OR v_kind.default_visibility <> 'client_visible' THEN
        RAISE EXCEPTION 'client may only file client-visible events' USING errcode = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'not authorized to write rail event' USING errcode = '42501';
    END IF;
  END IF;

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

  BEGIN
    PERFORM realtime.send(
      jsonb_build_object(
        'id', v_id, 'tenant_id', v_tenant, 'contact_id', p_contact_id,
        'event_kind', p_event_kind, 'surface', p_surface, 'actor_type', p_actor_type,
        'audience', v_audience, 'visibility', v_visibility,
        'from_department', v_from_dept, 'to_department', p_to_department,
        'title', p_title, 'summary', p_summary, 'payload', COALESCE(p_payload, '{}'::jsonb),
        'occurred_at', v_occurred
      ),
      'rail_event', 'rail:tenant:' || v_tenant::text, true
    );

    IF v_audience IN ('client','both') AND v_visibility = 'client_visible' THEN
      PERFORM realtime.send(
        jsonb_build_object(
          'id', v_id, 'contact_id', p_contact_id, 'event_kind', p_event_kind,
          'surface', p_surface, 'actor_type', p_actor_type, 'audience', v_audience,
          'visibility', v_visibility, 'title', p_title, 'summary', p_summary,
          'occurred_at', v_occurred
        ),
        'rail_event', 'rail:client:' || p_contact_id::text, true
      );
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'rail broadcast failed for event %: %', v_id, SQLERRM;
  END;

  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.record_rail_event(uuid,text,text,text,text,text,jsonb,text,uuid,text,text,timestamptz,boolean,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_rail_event(uuid,text,text,text,text,text,jsonb,text,uuid,text,text,timestamptz,boolean,uuid) TO authenticated, service_role;

-- ── (B) customer_respond_to_action — close the return path (§8) + emit the rail ─
--        Body is the exact shipped definition (20260702032646) with TWO best-effort
--        tails added AFTER the response/status/notification/audit are all persisted,
--        before RETURN. Both are wrapped so a failure NEVER rolls back the client's
--        response — the response is the product; the rest is coordination on top.
--
--        (B1) §8 CLOSE-THE-LOOP: reflect the response on the LINKED action-bus row
--             (paige_actions.customer_action_id -> this action). A surfaced action
--             is terminal ('done') by the time a client can respond, so we enrich
--             its result + bump updated_at rather than force an illegal state
--             transition — the row's status machine stays owned by advance_action.
--             Runs as the function owner (SECURITY DEFINER), the same privileged
--             lane advance_action uses to write the bus.
--        (B2) RAIL EMIT: the client answering a proposed action IS the two-way
--             action bus completing. Kind 'client.action_response' (audience 'both',
--             client_visible, client_experience → owner_ops) shows on BOTH the
--             client's own feed and the owner's command-center rail. Because the
--             call is made by the portal client under their own JWT, change (A)
--             resolves the tenant from the contact and admits the write. Titles are
--             human-readable and carry no internal ids/jargon (§11).
CREATE OR REPLACE FUNCTION public.customer_respond_to_action(p_action_id uuid, p_response_type text, p_response_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_action public.paige_customer_actions%ROWTYPE;
  v_owner uuid;
  v_new_status text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHENTICATED'); END IF;
  IF p_response_type NOT IN ('accepted','declined','question','completed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_RESPONSE_TYPE');
  END IF;

  SELECT * INTO v_action FROM public.paige_customer_actions WHERE id = p_action_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'ACTION_NOT_FOUND'); END IF;

  SELECT linked_user_id INTO v_owner FROM public.clients WHERE id = v_action.contact_id;
  IF v_owner IS NULL OR v_owner <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_action.status = 'expired' OR v_action.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ACTION_EXPIRED');
  END IF;

  INSERT INTO public.paige_customer_responses(
    action_id, contact_id, responded_by_user_id, response_type, response_text
  ) VALUES (
    p_action_id, v_action.contact_id, v_uid, p_response_type, NULLIF(p_response_text,'')
  );

  v_new_status := CASE p_response_type
    WHEN 'declined' THEN 'customer_declined'
    WHEN 'completed' THEN 'customer_acted'
    WHEN 'accepted' THEN 'customer_acted'
    ELSE v_action.status
  END;

  UPDATE public.paige_customer_actions
     SET status = v_new_status, updated_at = now()
   WHERE id = p_action_id;

  INSERT INTO public.notifications(user_id, type, title, message, action_url, metadata)
  VALUES (
    v_action.initiated_by_admin_id, 'system'::public.notification_type,
    'Client responded to your Paige action',
    COALESCE(v_action.title,'Action') || ' — ' || p_response_type,
    '/admin/contacts/' || v_action.contact_id::text,
    jsonb_build_object('source','paige_customer_response','action_id', p_action_id, 'response_type', p_response_type)
  );

  INSERT INTO public.paige_audit_log(actor_user_id, tenant_id, action, target_type, target_id, payload)
  VALUES (
    v_uid, v_action.tenant_id, 'customer_respond_to_action', 'paige_customer_action', p_action_id,
    jsonb_build_object('response_type', p_response_type, 'contact_id', v_action.contact_id)
  );

  -- (B1) STEP 4 — §8 close-the-loop on the linked action-bus row (best-effort).
  BEGIN
    UPDATE public.paige_actions
       SET result = COALESCE(result, '{}'::jsonb) || jsonb_build_object(
                      'client_response',        p_response_type,
                      'client_response_text',   NULLIF(p_response_text, ''),
                      'client_responded_at',    now(),
                      'customer_action_status', v_new_status),
           updated_at = now()
     WHERE customer_action_id = p_action_id
       AND tenant_id = v_action.tenant_id;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'action-bus sync failed for customer action %: %', p_action_id, SQLERRM;
  END;

  -- (B2) STEP 4 — file the response onto the Paige Context Rail (best-effort).
  BEGIN
    PERFORM public.record_rail_event(
      p_contact_id      => v_action.contact_id,
      p_event_kind      => 'client.action_response',
      p_surface         => 'client_portal',
      p_actor_type      => 'client',
      p_title           => CASE p_response_type
                             WHEN 'accepted'  THEN 'Accepted: '   || COALESCE(v_action.title, 'a request')
                             WHEN 'completed' THEN 'Completed: '   || COALESCE(v_action.title, 'a request')
                             WHEN 'declined'  THEN 'Declined: '    || COALESCE(v_action.title, 'a request')
                             WHEN 'question'  THEN 'Question on: ' || COALESCE(v_action.title, 'a request')
                             ELSE 'Responded to: ' || COALESCE(v_action.title, 'a request')
                           END,
      p_summary         => NULLIF(p_response_text, ''),
      p_payload         => jsonb_build_object('response_type', p_response_type),
      p_ref_table       => 'paige_customer_actions',
      p_ref_id          => p_action_id,
      p_from_department => 'client_experience',
      p_to_department   => 'owner_ops'
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'rail emit failed for customer response on action %: %', p_action_id, SQLERRM;
  END;

  RETURN jsonb_build_object('ok', true, 'status', v_new_status);
END; $function$;

REVOKE ALL ON FUNCTION public.customer_respond_to_action(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_respond_to_action(uuid, text, text) TO authenticated, service_role;
