-- ─────────────────────────────────────────────────────────────────────────────
-- PAIGE CONTEXT RAIL — STEP 6: governable + the platform-owner (God) view
--
-- Steps 1–5 shipped the rail (append-only projection + realtime + registry + RPCs)
-- and wired every producer (owner, client, automation/mcp/comms). Step 6 makes the
-- rail GOVERNABLE — tenants may author their OWN tenant-scoped event kinds via a
-- clean, confirm-gated RPC (§10/§15) — and adds the platform-owner (God) cross-tenant
-- read + firehose (§9): God READS everything, never WRITES cross-tenant through any
-- of these paths.
--
-- Two coordinated lanes write into THIS ONE migration file:
--   LANE A — tenant-authored event kinds (authoring RPC + slug-collision guard so a
--            tenant kind can never shadow/duplicate a platform default). Owns the
--            section below marked "LANE A".
--   LANE B — the God firehose topic + record_rail_event hardening + the God cross-
--            tenant read. Owns the section marked "LANE B".
--
-- Doctrine:
--   §9   God reads cross-tenant; NOTHING here writes cross-tenant. A tenant authors
--        only tenant-scoped kinds for their own tenant; portal clients author none.
--   §2   platform-default (tenant_id IS NULL) kinds stay coaching-generic — no
--        finance/credit seeded here. A tenant's own kind is the tenant's choice.
--   §13  truthful + least-privilege; validate enums; best-effort broadcasts wrapped
--        so a rail write never breaks the caller.
--   §10  config-as-data + callable seam: every capability is a clean RPC.
--   §3   tool + kind copy is human and jargon-free.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- LANE A: tenant-authored event kinds (authoring RPC + slug-collision guard)
--   (owned by Lane A — inserted here; no dependency on the Lane B section below)
-- ═════════════════════════════════════════════════════════════════════════════
-- SCHEMA NOTE (read before touching): paige_event_kinds.slug is the PRIMARY KEY
-- (Step 1). Because the PK is slug ALONE — not (tenant_id, slug) — a platform kind
-- and a tenant kind can NEVER coexist with the same slug, and two different tenants
-- can never share a slug either. That is exactly what keeps record_rail_event's kind
-- lookup single-row. If a tenant could author a row whose slug equals a platform-
-- default slug, the SELECT ... INTO in record_rail_event would match TWO rows and
-- THROW ("more than one row"). The SLUG_RESERVED guard below is the PRIMARY defense
-- against that; Lane B's ORDER BY … LIMIT 1 lookup is defense-in-depth.
--
-- RISK FLAGGED FOR THE INTEGRATOR (do NOT change the PK here): because slug is a
-- GLOBAL primary key, per-tenant slug namespaces are NOT isolated — tenant A claiming
-- 'my.custom_kind' permanently blocks tenant B from that slug (they get SLUG_TAKEN).
-- For today's scale that is acceptable and is surfaced as a clear structured error
-- rather than a raw PK violation. If per-tenant slug reuse is ever required, the
-- schema must move to a composite PK (tenant_id, slug) PLUS a partial-unique index on
-- slug WHERE tenant_id IS NULL (to keep platform-default slugs globally unique), AND
-- record_rail_event's lookup keeps its tenant-preferring tie-break. That is a schema
-- change with downstream impact (the FK from paige_client_events.event_kind, every
-- producer) and is deliberately OUT OF SCOPE for Step 6.

-- ── (A.1) list_event_kinds — the caller's available catalog (platform ∪ own tenant) ─
--   SECURITY DEFINER so it returns a stable projection independent of RLS; it
--   re-implements the same visibility RLS already grants (platform defaults + the
--   caller's own tenant). Portal clients / God-without-tenant (v_tenant NULL) see
--   only platform defaults — the tenant-authoring UI is staff-only anyway (§9).
CREATE OR REPLACE FUNCTION public.list_event_kinds()
RETURNS TABLE (
  slug                text,
  tenant_id           uuid,
  label               text,
  description         text,
  default_audience    text,
  default_visibility  text,
  department          text,
  enabled             boolean,
  is_platform_default boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid := public.current_user_tenant_id();
BEGIN
  RETURN QUERY
  SELECT k.slug, k.tenant_id, k.label, k.description,
         k.default_audience, k.default_visibility, k.department, k.enabled,
         (k.tenant_id IS NULL) AS is_platform_default
  FROM public.paige_event_kinds k
  WHERE k.tenant_id IS NULL
     OR (v_tenant IS NOT NULL AND k.tenant_id = v_tenant)
  ORDER BY (k.tenant_id IS NULL) DESC, k.slug;   -- platform defaults first, then the tenant's own
END $$;
REVOKE ALL ON FUNCTION public.list_event_kinds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_event_kinds() TO authenticated, service_role;

-- ── (A.2) upsert_tenant_event_kind — author/edit ONE own-tenant kind (§9/§13/§15) ──
--   Confirm-gated at the Paige/UI layer (§15); this RPC is the callable seam (§10).
--   Every failure path returns a STRUCTURED {ok:false,error:CODE} (§13) — nothing is
--   swallowed and no raw constraint violation is allowed to surface.
CREATE OR REPLACE FUNCTION public.upsert_tenant_event_kind(
  p_slug               text,
  p_label              text,
  p_description        text,
  p_default_audience   text,
  p_default_visibility text,
  p_department         text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_tenant uuid := public.current_user_tenant_id();
  v_slug   text := lower(btrim(COALESCE(p_slug, '')));
  v_ret    text;
BEGIN
  -- (1) §9 authoring identity: only a real tenant may author, and only its staff.
  --     Portal clients & God-without-tenant have NULL tenant → cannot author.
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_TENANT');
  END IF;
  IF v_uid IS NULL
     OR NOT public.has_any_role(v_uid, ARRAY['admin','super_admin','coach']) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;

  -- (2) validate the label, slug shape, and every enum BEFORE any write (§13).
  IF p_label IS NULL OR btrim(p_label) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_LABEL');
  END IF;
  IF v_slug !~ '^[a-z][a-z0-9_.]{1,63}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_SLUG');
  END IF;
  IF p_default_audience NOT IN ('owner','client','both') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_AUDIENCE');
  END IF;
  IF p_default_visibility NOT IN ('owner_internal','client_visible') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_VISIBILITY');
  END IF;
  IF p_department IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.paige_departments d WHERE d.slug = p_department) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_DEPARTMENT');
  END IF;

  -- (3) §9 COLLISION GUARD (primary defense for record_rail_event's single-row
  --     lookup): a tenant may NEVER shadow a platform-default slug.
  IF EXISTS (SELECT 1 FROM public.paige_event_kinds k
              WHERE k.slug = v_slug AND k.tenant_id IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SLUG_RESERVED');
  END IF;
  -- (4) slug already owned by ANOTHER tenant → reject (slug is a global PK).
  IF EXISTS (SELECT 1 FROM public.paige_event_kinds k
              WHERE k.slug = v_slug AND k.tenant_id IS NOT NULL AND k.tenant_id <> v_tenant) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SLUG_TAKEN');
  END IF;

  -- (5) UPSERT the tenant's OWN row. The ON CONFLICT ... WHERE tenant_id = v_tenant
  --     is defense-in-depth against a race between the checks above and this write:
  --     if a conflicting row that is NOT this tenant's slipped in, the DO UPDATE
  --     matches zero rows, RETURNING is empty, and we surface SLUG_TAKEN below
  --     rather than silently doing nothing (§13 truthful).
  INSERT INTO public.paige_event_kinds
    (slug, tenant_id, label, description, default_audience, default_visibility, department, enabled)
  VALUES
    (v_slug, v_tenant, btrim(p_label), NULLIF(btrim(COALESCE(p_description,'')), ''),
     p_default_audience, p_default_visibility, p_department, true)
  ON CONFLICT (slug) DO UPDATE
    SET label              = EXCLUDED.label,
        description        = EXCLUDED.description,
        default_audience   = EXCLUDED.default_audience,
        default_visibility = EXCLUDED.default_visibility,
        department         = EXCLUDED.department,
        enabled            = true
    WHERE public.paige_event_kinds.tenant_id = v_tenant
  RETURNING slug INTO v_ret;

  IF v_ret IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SLUG_TAKEN');
  END IF;

  RETURN jsonb_build_object('ok', true, 'slug', v_ret, 'tenant_id', v_tenant);
END $$;
REVOKE ALL ON FUNCTION public.upsert_tenant_event_kind(text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_tenant_event_kind(text,text,text,text,text,text) TO authenticated, service_role;

-- ── (A.3) disable_tenant_event_kind — soft-retire ONLY the caller's own kind (§9) ──
--   Never a platform default (tenant_id IS NULL) and never another tenant's row — the
--   WHERE tenant_id = v_tenant clause is the §9 scope. Soft-disable (enabled=false)
--   rather than DELETE so historic events keep a valid FK to their kind and the row
--   can be re-enabled via upsert.
CREATE OR REPLACE FUNCTION public.disable_tenant_event_kind(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_tenant uuid := public.current_user_tenant_id();
  v_ret    text;
BEGIN
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_TENANT');
  END IF;
  IF v_uid IS NULL
     OR NOT public.has_any_role(v_uid, ARRAY['admin','super_admin','coach']) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;

  UPDATE public.paige_event_kinds
     SET enabled = false
   WHERE slug = p_slug
     AND tenant_id = v_tenant           -- §9: own-tenant row ONLY
  RETURNING slug INTO v_ret;

  IF v_ret IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('ok', true, 'slug', v_ret);
END $$;
REVOKE ALL ON FUNCTION public.disable_tenant_event_kind(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disable_tenant_event_kind(text) TO authenticated, service_role;


-- ═════════════════════════════════════════════════════════════════════════════
-- LANE B: rail:platform God topic + record_rail_event hardening + God read
-- ═════════════════════════════════════════════════════════════════════════════

-- ── (B.1) can_access_rail_topic — add the God firehose branch ─────────────────
--   CREATE OR REPLACE from the Step-2 body (20260712200000). The rail:tenant and
--   rail:client branches are preserved byte-for-byte; the ONLY addition is the
--   'rail:platform' branch before the final RETURN false, so the cross-tenant
--   firehose is subscribable by the platform owner (God) and NO ONE else (§9).
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

  -- STEP 6 — God firehose: the cross-tenant platform stream is subscribable ONLY
  -- by the platform owner (§9). READ-only surface — no one broadcasts via it.
  IF _topic = 'rail:platform' THEN
    RETURN public.is_platform_owner();
  END IF;

  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.can_access_rail_topic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_rail_topic(text) TO authenticated;

-- ── (B.2) record_rail_event — kind-lookup hardening + God firehose broadcast ──
--   CREATE OR REPLACE starting from the AUTHORITATIVE Step-4 body
--   (20260712240000_rail_step4_client_emitters.sql). EVERY Step-4 guard is
--   preserved verbatim:
--     • portal-client tenant resolution from the subject contact (actor_type
--       'client' + linked_user_id = auth.uid());
--     • the p_tenant_id-vs-resolved tenant-mismatch check;
--     • the service-caller "p_tenant_id required" / "no tenant resolved" gates;
--     • contact-in-tenant check;
--     • the WRITER-AUTH gate, including the §9 subject-client restriction to
--       client-visible, non-narrowed kinds;
--     • audience/visibility/actor/from_department derivation;
--     • the audit_logs insert;
--     • the best-effort rail:tenant broadcast and the conditional rail:client one.
--   EXACTLY TWO changes are made:
--     (a) the kind lookup now prefers the tenant's own kind over a platform default
--         and can never return >1 row — ORDER BY (tenant_id IS NOT NULL) DESC LIMIT 1
--         — a defense-in-depth backstop to Lane A's authoring-time collision guard.
--     (b) a THIRD best-effort broadcast to the God firehose 'rail:platform' for
--         EVERY event, with a COMPACT envelope (NO full payload — the platform
--         stream is a cross-tenant index; omitting payload limits blast radius).
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

  -- STEP 6 (a): a tenant's own kind wins over a platform default of the same slug,
  -- and the lookup can never return >1 row even if a collision ever slipped past
  -- Lane A's authoring guard (SELECT ... INTO would otherwise throw "more than one
  -- row"). Deterministic single-row resolution.
  SELECT * INTO v_kind FROM public.paige_event_kinds
    WHERE slug = p_event_kind AND enabled AND (tenant_id IS NULL OR tenant_id = v_tenant)
    ORDER BY (tenant_id IS NOT NULL) DESC   -- prefer the tenant's own kind
    LIMIT 1;
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

    -- STEP 6 (b): God firehose. EVERY event is surfaced to the platform owner's
    -- cross-tenant stream (§9 God reads everything). Compact envelope only — NO
    -- full payload; the platform stream is a cross-tenant index, and omitting the
    -- payload limits blast radius. Subscribable ONLY by God (see can_access_rail_topic).
    PERFORM realtime.send(
      jsonb_build_object(
        'id', v_id, 'tenant_id', v_tenant, 'contact_id', p_contact_id,
        'event_kind', p_event_kind, 'surface', p_surface, 'actor_type', p_actor_type,
        'audience', v_audience, 'visibility', v_visibility,
        'title', p_title, 'occurred_at', v_occurred
      ),
      'rail_event', 'rail:platform', true
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'rail broadcast failed for event %: %', v_id, SQLERRM;
  END;

  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.record_rail_event(uuid,text,text,text,text,text,jsonb,text,uuid,text,text,timestamptz,boolean,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_rail_event(uuid,text,text,text,text,text,jsonb,text,uuid,text,text,timestamptz,boolean,uuid) TO authenticated, service_role;

-- ── (B.3) get_platform_rail — the God cross-tenant READ (#157) ────────────────
--   Recent events across ALL tenants, optionally filtered to one tenant. GATED to
--   the platform owner ONLY: a non-God caller gets an EMPTY result set (never an
--   error that would leak the function's shape or existence). READ-only — this
--   function never writes. Limit clamped 1..500; newest first.
CREATE OR REPLACE FUNCTION public.get_platform_rail(
  p_limit      int  DEFAULT 100,
  p_tenant_id  uuid DEFAULT NULL
) RETURNS TABLE (
  id          uuid,
  tenant_id   uuid,
  contact_id  uuid,
  event_kind  text,
  surface     text,
  actor_type  text,
  audience    text,
  visibility  text,
  title       text,
  summary     text,
  occurred_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
BEGIN
  -- §9: God ONLY. Non-God callers get nothing back — no rows, no error shape.
  IF NOT public.is_platform_owner() THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT e.id, e.tenant_id, e.contact_id, e.event_kind, e.surface, e.actor_type,
           e.audience, e.visibility, e.title, e.summary, e.occurred_at
      FROM public.paige_client_events e
     WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id)
     ORDER BY e.occurred_at DESC
     LIMIT v_limit;
END $$;
REVOKE ALL ON FUNCTION public.get_platform_rail(int, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_rail(int, uuid) TO authenticated, service_role;
