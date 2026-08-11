-- =====================================================================================
-- 20260821000000_definer_fn_wave1_read_hardening.sql
-- §9 P0 #117 — SECURITY DEFINER function audit, Wave 1 (read-hardening + 1 delete + 2 REVOKEs)
--
-- Doctrine: §9 (tenant isolation), §30 (fix the real leak, do not layer), §37 (producer
-- inventory per fix), §53 (tenant-level 'admin' is NOT an all-tenants grant). Follows the
-- #116 view-security-invoker sweep (20260820000000).
--
-- Every fix below is a PURELY ADDITIVE fail-closed guard on a SECURITY DEFINER data-reader
-- (plus one auth-bypass fix on a destructive delete, and two anon/authenticated EXECUTE
-- hygiene REVOKEs). Each function body is reproduced VERBATIM from prod
-- (pg_get_functiondef) with ONLY the guard added — no other logic changed. Signatures,
-- return types, search_path, and volatility are preserved. Two functions are converted
-- LANGUAGE sql -> plpgsql SOLELY to host an IF/RAISE guard (bodies otherwise unchanged).
--
-- A SECURITY DEFINER function runs as its OWNER and BYPASSES the RLS that would otherwise
-- scope the caller. Each function below trusted a caller-supplied argument (or nothing at
-- all) and returned another tenant's / user's data. The guards re-impose the isolation the
-- DEFINER context removes.
--
-- ---------------------------------------------------------------------------------------
-- THE 12 FIXES + §37 PRODUCER NOTES
-- ---------------------------------------------------------------------------------------
--  1. current_tenant_tier(_tenant_id)        [tenant read] — trusted _tenant_id arg; any
--     caller could read another tenant's billing tier. Guard: reject a non-self tenant for
--     non-platform-owner. Default self-tenant behavior (no arg / own tenant) unchanged.
--     Converted sql->plpgsql to host the guard. §37: gate/UI callers use the default arg
--     (self tenant) -> guard passes; platform owner bypass preserved.
--  2. delete_credit_report_upload(...)       [HIGH auth-bypass, destructive] — checked
--     has_role() on the CALLER-SUPPLIED _calling_user_id, so any caller could pass an
--     admin's id and delete another user's credit report. Guard now derives the actor from
--     auth.uid(). §37: sole caller is the authenticated admin/coach UI (delete button);
--     the JWT's auth.uid() is exactly the real actor, so legitimate callers are unaffected.
--  3. get_approval_queue_counts()            [tenant read] — counted pending approvals
--     platform-wide. Guard: scope BOTH the total and the by_type breakdown to the caller's
--     tenant; empty/zero when tenant is NULL. §37: Command Center approvals badge (JWT).
--  4. get_broker_team_member(_auth_user_id)  [user read] — trusted _auth_user_id arg; any
--     caller could read any broker team member row. Guard: row must belong to auth.uid()
--     (or platform owner). §37: useBrokerContext passes the session user's own id.
--  5. get_business_hierarchy(_user_id)       [user read] — trusted _user_id arg; any caller
--     could read another user's full business tree. Guard on the recursive anchor. §37:
--     OrganizationChart / BusinessOrganizationChart / ClientOrgChartPanel pass own id.
--  6. get_outstanding_consents(_user_id)     [user read] — trusted _user_id arg; any caller
--     could enumerate another user's outstanding legal consents. Guard: self or platform
--     owner. §37: useLegalDocuments / Auth pass the session user's own id.
--  7. get_tenant_sender(_tenant_id)          [tenant read] — trusted _tenant_id; leaked a
--     tenant's sending identity (from_name/from_email). Guard: JWT caller must be a member
--     of _tenant_id (service-role bypasses). Converted sql->plpgsql. §37: paige-ai-chat &
--     email edge fns call service-role (auth.uid() NULL) -> bypass; JWT callers scoped.
--  8. get_user_primary_tenant(_user_id)      [user read] — trusted _user_id; leaked another
--     user's primary tenant + role. Guard: self or platform owner (service-role bypasses).
--     Converted sql->plpgsql. §37: useTenantContext / Auth pass own id.
--  9. compute_contact_readiness(_contact_id) [#588-class contact read] — no auth check; any
--     authenticated caller could compute readiness for any contact. Guard:
--     can_access_contact(auth.uid(), _contact_id). §37: NO service-role caller exists —
--     the ONLY producers are the authenticated admin surfaces FundingLensHub.tsx and
--     ApprovalDetail.tsx, which read it via the security_invoker view contact_readiness_rollup;
--     the readiness-scan edge fn computes readiness from base tables directly and does NOT
--     touch this fn or that view. Both admin producers resolve to tenant owner/admin, which
--     can_access_contact covers -> no legitimate breakage. Strict variant (RAISE when
--     auth.uid() IS NULL) is therefore safe; no unauthenticated/service path reaches it.
-- 10. match_paige_memory(...)                [assignment read] — coach branch let ANY global
--     'coach' role read ANY target user's memory/chat vectors. Guard: coach branch now
--     requires an ACTIVE coach_clients assignment to _target_user_id (mirrors client_memory
--     RLS). Self / target-client / admin branches unchanged. §37: paige-ai-chat / skill-runner
--     pass the resolved subject; assigned coaches keep access, unassigned coaches lose it.
-- 11. unassigned_queue_for_caller() + view paige_unassigned_queue  [§53 tenant read] — the
--     function granted the FULL platform queue to any 'admin' app_role (a tenant-level admin
--     is NOT platform-wide, §53), and the view exposed no tenant_id to scope by. Fix (a): add
--     c.tenant_id to the view (re-assert security_invoker=true + REVOKE anon SELECT to
--     preserve #116). Fix (b): platform operators see all; tenant admin sees their tenant's
--     full queue; sales_rep/cs_rep see their tenant's queue filtered by tier pool. §37:
--     assignment/queue admin UI (JWT); platform operators via is_platform_operator().
-- 12. Anon/authenticated EXECUTE hygiene REVOKEs on two service-only readiness fns:
--     increment_readiness_scan_counters(...) and expire_stale_readiness_proposals().
--     §37: increment_* is called ONLY by the readiness-scan edge fn via a service-role
--     client (admin.rpc); expire_* is called ONLY by pg_cron ('0 3 * * *'). Both were already
--     granted service_role-only (PUBLIC revoked at creation); this REVOKE is defense-in-depth
--     against any residual anon/authenticated EXECUTE. No authenticated UI calls either.
-- =====================================================================================


-- =====================================================================================
-- FIX 1 — current_tenant_tier(_tenant_id): reject cross-tenant tier reads.
-- Converted LANGUAGE sql -> plpgsql to host the guard; SELECT body otherwise verbatim.
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.current_tenant_tier(_tenant_id uuid DEFAULT current_user_tenant_id())
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _tenant_id IS DISTINCT FROM public.current_user_tenant_id() AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'not authorized for this tenant' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(
    (SELECT CASE lower(pl.slug)
        WHEN 'enterprise' THEN 'Enterprise'
        WHEN 'agency'     THEN 'Agency'
        WHEN 'solo'       THEN 'Solo'
        ELSE 'Solo' END
     FROM public.platform_subscriptions ps
     JOIN public.platform_subscription_plans pl ON pl.id = ps.plan_id
     WHERE ps.tenant_id = _tenant_id
       AND ps.status IN ('active','trialing')
     ORDER BY ps.created_at DESC
     LIMIT 1),
    'Solo');
END;
$function$;


-- =====================================================================================
-- FIX 2 — delete_credit_report_upload: stop trusting the caller-supplied user id.
-- Derive the actor from auth.uid(); DELETEs + return shape verbatim.
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.delete_credit_report_upload(_upload_id uuid, _calling_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _upload record;
  _file_path text;
BEGIN
  IF _caller IS NULL OR NOT (public.has_role(_caller, 'admin'::app_role) OR public.has_role(_caller, 'coach'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT id, file_path, user_id INTO _upload
  FROM public.credit_report_uploads
  WHERE id = _upload_id;

  IF _upload IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Upload not found');
  END IF;

  _file_path := _upload.file_path;

  DELETE FROM public.credit_report_personal_info
  WHERE credit_report_upload_id = _upload_id;

  DELETE FROM public.credit_report_uploads
  WHERE id = _upload_id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (
    _caller,
    'credit_report_uploads',
    'admin_delete',
    _upload_id,
    jsonb_build_object('file_path', _file_path, 'target_user_id', _upload.user_id::text)
  );

  RETURN json_build_object(
    'success', true,
    'file_path', _file_path,
    'message', 'Upload and related data deleted'
  );
END;
$function$;


-- =====================================================================================
-- FIX 3 — get_approval_queue_counts: tenant-scope the pending total AND by_type.
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.get_approval_queue_counts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tenant uuid := public.current_user_tenant_id();
  _pending int;
  _by_type jsonb;
BEGIN
  IF _tenant IS NULL THEN
    RETURN jsonb_build_object('pending', 0, 'by_type', '{}'::jsonb);
  END IF;

  SELECT count(*) INTO _pending
  FROM public.paige_pending_approvals
  WHERE status = 'pending'
    AND tenant_id = _tenant;

  SELECT COALESCE(jsonb_object_agg(type, ct), '{}'::jsonb) INTO _by_type
  FROM (
    SELECT type, count(*) AS ct
    FROM public.paige_pending_approvals
    WHERE status = 'pending'
      AND tenant_id = _tenant
    GROUP BY type
  ) s;

  RETURN jsonb_build_object('pending', _pending, 'by_type', _by_type);
END;
$function$;


-- =====================================================================================
-- FIX 4 — get_broker_team_member: the row must belong to the caller (or platform owner).
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.get_broker_team_member(_auth_user_id uuid)
 RETURNS TABLE(id uuid, broker_id uuid, email text, first_name text, last_name text, role text, status text, permissions jsonb, business_name text, firm_description text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    tm.id, tm.broker_id, tm.email, tm.first_name, tm.last_name, tm.role, tm.status, tm.permissions,
    bp.business_name, bp.firm_description
  FROM public.broker_team_members tm
  JOIN public.broker_profiles bp ON bp.id = tm.broker_id
  WHERE tm.auth_user_id = _auth_user_id
    AND tm.status = 'active'
    AND (tm.auth_user_id = auth.uid() OR public.is_platform_owner())
  LIMIT 1;
$function$;


-- =====================================================================================
-- FIX 5 — get_business_hierarchy: guard the recursive anchor to self (or platform owner).
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.get_business_hierarchy(_user_id uuid)
 RETURNS TABLE(id uuid, legal_name text, business_type business_hierarchy_type, parent_business_id uuid, organizational_level integer, display_order integer, entity_type entity_type, ein text, child_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE business_tree AS (
    SELECT
      b.id,
      b.legal_name,
      b.business_type,
      b.parent_business_id,
      b.organizational_level,
      b.display_order,
      b.entity_type,
      b.ein,
      0 as depth
    FROM public.businesses b
    WHERE b.owner_user_id = _user_id
      AND b.parent_business_id IS NULL
      AND (_user_id = auth.uid() OR public.is_platform_owner())

    UNION ALL

    SELECT
      b.id,
      b.legal_name,
      b.business_type,
      b.parent_business_id,
      b.organizational_level,
      b.display_order,
      b.entity_type,
      b.ein,
      bt.depth + 1
    FROM public.businesses b
    INNER JOIN business_tree bt ON b.parent_business_id = bt.id
    WHERE b.owner_user_id = _user_id
  )
  SELECT
    bt.id,
    bt.legal_name,
    bt.business_type,
    bt.parent_business_id,
    bt.organizational_level,
    bt.display_order,
    bt.entity_type,
    bt.ein,
    (SELECT COUNT(*) FROM public.businesses child WHERE child.parent_business_id = bt.id) as child_count
  FROM business_tree bt
  ORDER BY bt.depth, bt.display_order, bt.legal_name;
$function$;


-- =====================================================================================
-- FIX 6 — get_outstanding_consents: self (or platform owner) only.
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.get_outstanding_consents(_user_id uuid)
 RETURNS TABLE(slug text, version integer, title text, summary text, effective_date timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.slug, d.version, d.title, d.summary, d.effective_date
  FROM public.legal_documents d
  WHERE d.is_current = true
    AND d.required_at_signup = true
    AND d.audience IN ('all')
    AND (_user_id = auth.uid() OR public.is_platform_owner())
    AND NOT EXISTS (
      SELECT 1 FROM public.legal_acceptances a
      WHERE a.user_id = _user_id
        AND a.document_slug = d.slug
        AND a.document_version >= d.version
    )
  ORDER BY d.slug;
$function$;


-- =====================================================================================
-- FIX 7 — get_tenant_sender: JWT caller must be a member of _tenant_id.
-- Converted LANGUAGE sql -> plpgsql to host the guard; service-role (auth.uid() NULL)
-- bypasses so edge fns keep working; SELECT body otherwise verbatim.
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.get_tenant_sender(_tenant_id uuid)
 RETURNS TABLE(from_name text, from_email text, source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.is_platform_owner() OR public.is_tenant_member(_tenant_id)) THEN
    RAISE EXCEPTION 'SENDER_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r ->> 'from_name', r ->> 'from_address', r ->> 'source'
  FROM public.resolve_tenant_sender(_tenant_id) AS r;
END;
$function$;


-- =====================================================================================
-- FIX 8 — get_user_primary_tenant: self (or platform owner) only.
-- Converted LANGUAGE sql -> plpgsql to host the guard; service-role (auth.uid() NULL)
-- bypasses; ranked CTE body otherwise verbatim.
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.get_user_primary_tenant(_user_id uuid)
 RETURNS TABLE(tenant_id uuid, tenant_name text, member_role text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND _user_id <> auth.uid() AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'PRIMARY_TENANT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      t.id   AS tenant_id,
      t.name AS tenant_name,
      CASE WHEN tm.is_owner THEN 'owner' ELSE tm.role::text END AS member_role,
      CASE
        WHEN tm.is_owner            THEN 0
        WHEN tm.role::text = 'owner' THEN 1
        WHEN tm.role::text = 'admin' THEN 2
        WHEN tm.role::text = 'coach' THEN 3
        ELSE 9
      END AS rank,
      t.created_at AS tenant_created_at
    FROM public.tenant_members tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    WHERE tm.user_id = _user_id AND tm.status = 'active'
  )
  SELECT ranked.tenant_id, ranked.tenant_name, ranked.member_role
  FROM ranked
  ORDER BY rank ASC, tenant_created_at ASC, ranked.tenant_id ASC
  LIMIT 1;
END;
$function$;


-- =====================================================================================
-- FIX 9 — compute_contact_readiness: require can_access_contact (#588-class).
-- Strict variant (RAISE when auth.uid() IS NULL): §37 confirmed NO service-role/internal
-- caller reaches this fn (see header note 9). Body otherwise verbatim.
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.compute_contact_readiness(_contact_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_stored  integer;
  v_owner   integer;
  v_biz     integer;
  v_cash    integer;
  v_bank    integer;
  v_sig     integer;
  v_count   integer := 0;
  v_sum     integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_contact(auth.uid(), _contact_id) THEN
    RAISE EXCEPTION 'not authorized for this contact' USING ERRCODE = '42501';
  END IF;

  SELECT linked_user_id INTO v_user_id FROM public.clients WHERE id = _contact_id;

  -- Prefer stored composite if present
  IF v_user_id IS NOT NULL THEN
    SELECT overall_score INTO v_stored
      FROM public.funding_readiness_scores
     WHERE user_id = v_user_id
     ORDER BY last_calculated_at DESC NULLS LAST
     LIMIT 1;
    IF v_stored IS NOT NULL AND v_stored > 0 THEN
      RETURN LEAST(100, GREATEST(0, v_stored));
    END IF;
  END IF;

  -- Owner credit: map FICO 300-850 → 0-100
  SELECT GREATEST(0, LEAST(100, ROUND(((score::numeric - 300) / 550.0) * 100)))::int
    INTO v_owner
    FROM public._latest_owner_credit WHERE contact_id = _contact_id;
  IF v_owner IS NOT NULL THEN v_sum := v_sum + v_owner; v_count := v_count + 1; END IF;

  -- Business credit: average bureau scores in `scores` jsonb, normalize Paydex/Intelliscore (0-100 already)
  SELECT GREATEST(0, LEAST(100, ROUND(AVG((value)::numeric))))::int INTO v_biz
    FROM public.paige_business_credit_profiles,
         LATERAL jsonb_each_text(COALESCE(scores, '{}'::jsonb))
    WHERE contact_id = _contact_id AND value ~ '^[0-9]+(\.[0-9]+)?$';
  IF v_biz IS NOT NULL THEN v_sum := v_sum + v_biz; v_count := v_count + 1; END IF;

  -- Cash flow: use stored readiness score, else proxy from runway days
  SELECT COALESCE(funding_readiness_score,
                  LEAST(100, GREATEST(0, COALESCE(runway_days, 0))))
    INTO v_cash
    FROM public._latest_cash_flow WHERE contact_id = _contact_id;
  IF v_cash IS NOT NULL THEN v_sum := v_sum + v_cash; v_count := v_count + 1; END IF;

  -- Banking depth: 1 active connection = 60, 2 = 80, 3+ = 100
  SELECT CASE WHEN bank_connections_active >= 3 THEN 100
              WHEN bank_connections_active = 2 THEN 80
              WHEN bank_connections_active = 1 THEN 60
              ELSE NULL END
    INTO v_bank
    FROM public._bank_rollup WHERE contact_id = _contact_id;
  IF v_bank IS NOT NULL THEN v_sum := v_sum + v_bank; v_count := v_count + 1; END IF;

  -- Signature completion ratio
  SELECT CASE WHEN envelopes_total = 0 THEN NULL
              ELSE ROUND((envelopes_completed::numeric / envelopes_total) * 100)::int END
    INTO v_sig
    FROM public._signature_rollup WHERE contact_id = _contact_id;
  IF v_sig IS NOT NULL THEN v_sum := v_sum + v_sig; v_count := v_count + 1; END IF;

  IF v_count = 0 THEN RETURN NULL; END IF;
  RETURN ROUND(v_sum::numeric / v_count)::int;
END;
$function$;


-- =====================================================================================
-- FIX 10 — match_paige_memory: coach branch requires an ACTIVE assignment to the target.
-- Only the coach guard line changes; self / target-client / admin branches + body verbatim.
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.match_paige_memory(_query_embedding vector, _target_user_id uuid, _target_client_id uuid DEFAULT NULL::uuid, _match_threshold double precision DEFAULT 0.7, _memory_count integer DEFAULT 5, _message_count integer DEFAULT 5)
 RETURNS TABLE(source text, id uuid, memory_type text, content text, similarity double precision, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Authorization: caller must be the owner, the linked client, an admin, or a coach
  -- with an ACTIVE coach_clients assignment to the target user (mirrors client_memory RLS).
  IF auth.uid() IS DISTINCT FROM _target_user_id
     AND auth.uid() IS DISTINCT FROM _target_client_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT EXISTS (
       SELECT 1 FROM public.coach_clients cc
       WHERE cc.coach_user_id = auth.uid()
         AND cc.status = 'active'
         AND cc.client_user_id = _target_user_id
     ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  (
    SELECT
      'memory'::text AS source,
      cm.id,
      cm.memory_type,
      cm.content,
      1 - (cm.embedding <=> _query_embedding) AS similarity,
      cm.created_at
    FROM public.client_memory cm
    WHERE cm.is_active = true
      AND cm.embedding IS NOT NULL
      AND (
        cm.client_user_id = _target_user_id
        OR (_target_client_id IS NOT NULL AND cm.client_id = _target_client_id)
      )
      AND 1 - (cm.embedding <=> _query_embedding) >= _match_threshold
    ORDER BY cm.embedding <=> _query_embedding
    LIMIT _memory_count
  )
  UNION ALL
  (
    SELECT
      'chat'::text AS source,
      ce.message_id AS id,
      ce.role AS memory_type,
      ce.content_excerpt AS content,
      1 - (ce.embedding <=> _query_embedding) AS similarity,
      ce.created_at
    FROM public.chat_message_embeddings ce
    WHERE ce.embedding IS NOT NULL
      AND (
        ce.user_id = _target_user_id
        OR (_target_client_id IS NOT NULL AND ce.client_user_id = _target_client_id)
      )
      AND 1 - (ce.embedding <=> _query_embedding) >= _match_threshold
    ORDER BY ce.embedding <=> _query_embedding
    LIMIT _message_count
  );
END;
$function$;


-- =====================================================================================
-- FIX 11a — paige_unassigned_queue view: expose c.tenant_id so callers can scope by tenant.
-- Re-assert security_invoker=true and REVOKE anon SELECT to preserve hotfix #116
-- (20260820000000). New column appended at the END (CREATE OR REPLACE VIEW requirement).
-- =====================================================================================
CREATE OR REPLACE VIEW public.paige_unassigned_queue
WITH (security_invoker = true) AS
  SELECT
    c.id,
    c.email,
    c.first_name,
    c.last_name,
    c.tier,
    c.ghl_contact_id,
    c.created_at,
    c.last_mirrored_at,
    EXTRACT(epoch FROM now() - c.created_at) / 3600.0 AS unassigned_for_hours,
    CASE c.tier
        WHEN 'vip'::text THEN 1
        WHEN 'premium'::text THEN 2
        WHEN 'internal'::text THEN 3
        WHEN 'staff'::text THEN 3
        WHEN 'standard'::text THEN 4
        WHEN 'lead'::text THEN 5
        ELSE 6
    END AS priority_rank,
    c.tenant_id
  FROM public.clients c
  WHERE c.status <> 'archived'::text
    AND NOT (EXISTS (
      SELECT 1
      FROM public.paige_coach_assignments pca
      WHERE pca.contact_id = c.id
        AND pca.active = true
        AND (pca.assigned_role = ANY (ARRAY['lead_owner'::text, 'cs_primary'::text]))
        AND pca.rep_user_id IS NOT NULL))
  ORDER BY (
    CASE c.tier
        WHEN 'vip'::text THEN 1
        WHEN 'premium'::text THEN 2
        WHEN 'internal'::text THEN 3
        WHEN 'staff'::text THEN 3
        WHEN 'standard'::text THEN 4
        WHEN 'lead'::text THEN 5
        ELSE 6
    END), c.created_at DESC;

REVOKE SELECT ON public.paige_unassigned_queue FROM anon;


-- =====================================================================================
-- FIX 11b — unassigned_queue_for_caller: §53 tenant-scoping.
-- Platform operators (super_admin / platform_admin) see the whole platform queue.
-- A tenant-level 'admin' is NOT an all-tenants grant — it is scoped to its own tenant.
-- sales_rep / cs_rep see their tenant's queue filtered by their tier pool.
-- RETURNS SETOF paige_unassigned_queue auto-tracks the view's new rowtype.
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.unassigned_queue_for_caller()
 RETURNS SETOF paige_unassigned_queue
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _pool text[] := ARRAY[]::text[];
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;

  -- Platform operators (super_admin / platform_admin) see the entire platform queue.
  IF public.is_platform_operator() THEN
    RETURN QUERY SELECT * FROM public.paige_unassigned_queue;
    RETURN;
  END IF;

  -- Everyone else is scoped to their own tenant (§9/§53): a tenant-level 'admin'
  -- app_role is NOT an all-tenants grant.
  _tenant := public.current_user_tenant_id();
  IF _tenant IS NULL THEN RETURN; END IF;

  -- Tenant admin sees their own tenant's full unassigned queue (all tiers).
  IF public.has_role(_uid, 'admin'::app_role) THEN
    RETURN QUERY SELECT q.* FROM public.paige_unassigned_queue q
      WHERE q.tenant_id = _tenant;
    RETURN;
  END IF;

  IF public.has_role(_uid, 'sales_rep'::app_role) THEN
    _pool := _pool || public.tier_pool_for_role('sales_rep'::app_role);
  END IF;
  IF public.has_role(_uid, 'cs_rep'::app_role) THEN
    _pool := _pool || public.tier_pool_for_role('cs_rep'::app_role);
  END IF;

  IF array_length(_pool, 1) IS NULL THEN RETURN; END IF;

  RETURN QUERY SELECT q.* FROM public.paige_unassigned_queue q
    WHERE q.tenant_id = _tenant
      AND q.tier = ANY(_pool);
END;
$function$;


-- =====================================================================================
-- FIX 12 — anon/authenticated EXECUTE hygiene REVOKEs (service-only readiness fns).
-- §37: increment_* -> readiness-scan edge fn (service-role admin.rpc only);
--      expire_*    -> pg_cron '0 3 * * *' (service-role only). Neither has an authenticated
--      UI caller. service_role EXECUTE is retained by the original GRANTs.
-- =====================================================================================
REVOKE EXECUTE ON FUNCTION public.increment_readiness_scan_counters(uuid, integer, integer, integer, integer, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_stale_readiness_proposals() FROM anon, authenticated;
