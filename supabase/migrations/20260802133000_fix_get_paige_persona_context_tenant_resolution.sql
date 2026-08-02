-- =============================================================================
-- Bug #588 / #589 — get_paige_persona_context() returns the WRONG /
-- nondeterministic tenant for multi-tenant users. §9 SECURITY-adjacent fix on a
-- SECURITY DEFINER resolver that scopes the RLS-BYPASSING service-role CRM writes
-- in paige-ai-chat (personaCtx.tenant_id gates create/update/delete contact tools
-- and growth_page_save / growth_funnel_build p_tenant_id).
--
-- TWO compounding defects in the live body (verified on prod
-- ref xygzykjyynhzqytbqnzu against live rows + paige_llm_trace telemetry):
--
--   (1) DEAD PROFILE BRANCH (platform-wide). The body read
--         SELECT p.active_tenant_id FROM profiles p WHERE p.id = auth.uid()
--       The correct key is p.user_id = auth.uid(). Verified: 0 of 6 profiles
--       satisfy id = user_id, so active_tenant_id was NEVER honored for anyone —
--       the branch always yielded NULL.
--
--   (2) UNORDERED LIMIT 1 (#589 nondeterminism). Because (1) always fell through,
--       resolution landed on
--         SELECT m.tenant_id FROM tenant_members m WHERE m.user_id = auth.uid() LIMIT 1
--       with NO ORDER BY → a Postgres-arbitrary, call-to-call-unstable tenant for
--       any multi-membership user. Live traces showed 4 different tenants returned
--       for one user (including one they are not even a member of).
--
-- THE FIX (owner-approved direction):
--   • Keep the CLIENT-tier branch FIRST, byte-identical. A consumer under a coach
--     must resolve through their clients.linked_user_id row, and
--     current_user_tenant_id() returns NULL for a pure client (no membership),
--     so this branch has to run before the delegate. ORDER BY created_at ASC
--     LIMIT 1 preserved.
--   • If still NULL, delegate to the ONE canonical resolver:
--     public.current_user_tenant_id(). It keys on profiles.user_id (fixes defect
--     1), VALIDATES entitlement on the chosen active_tenant_id (active membership
--     OR agency_can_manage_child OR agency_team_role OR is_platform_admin), and
--     falls back deterministically ORDER BY joined_at ASC LIMIT 1 (fixes defect
--     2). This KILLS the §18 three-resolver redundancy so persona scope and RLS
--     scope can never diverge again.
--   • The old owner_user_id fallback is REMOVED (not kept). Verified on prod:
--     zero tenant owners lack an active tenant_members row for the tenant they
--     own, so current_user_tenant_id()'s deterministic membership fallback
--     already covers every owner — the branch stranded nobody. Keeping it would
--     REINTRODUCE an unordered `SELECT ... FROM tenants WHERE owner_user_id =
--     auth.uid() LIMIT 1` (a fresh #589-class nondeterminism for anyone owning
--     >1 tenant), which is exactly what this fix removes. §18: one home.
--
-- The ONLY behavioral change is the tenant-resolution order/keys. The RETURN
-- shape (tenant_id, tenant_name, playbook_config, playbook_slug, funding_enabled,
-- brand), the funding_enabled COALESCE computation, and the resolve_tenant_brand
-- walk are preserved byte-for-byte from the live body. SECURITY DEFINER,
-- search_path, and grants are unchanged.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_paige_persona_context()
RETURNS TABLE(tenant_id uuid, tenant_name text, playbook_config jsonb, playbook_slug text, funding_enabled boolean, brand jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _tid uuid;
BEGIN
  -- (1) CLIENT tier FIRST — resolve through the client's row. Must precede the
  --     delegate because current_user_tenant_id() returns NULL for a pure client.
  SELECT c.tenant_id INTO _tid
  FROM public.clients c
  WHERE c.linked_user_id = auth.uid()
  ORDER BY c.created_at ASC
  LIMIT 1;

  -- (2) Everyone else — the single canonical, entitlement-validated,
  --     deterministic resolver (fixes #588 profiles.user_id key AND #589 unordered
  --     fallback in one move; persona scope == RLS scope).
  IF _tid IS NULL THEN
    _tid := public.current_user_tenant_id();
  END IF;

  IF _tid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.name,
    (t.features -> 'playbook_config'),
    NULLIF(t.features ->> 'playbook', ''),
    COALESCE(
      (t.features ->> 'paige_funding_skill') = 'true'
        OR (t.features ->> 'playbook') = 'funding'
        OR (t.features -> 'playbook_config' ->> 'slug') = 'funding'
        OR (t.features -> 'enabled_skills') @> '["funding"]'::jsonb,
      false
    ),
    (SELECT to_jsonb(rb) FROM public.resolve_tenant_brand(_tid) rb) AS brand
  FROM public.tenants t
  WHERE t.id = _tid;
END $function$;

-- Grants unchanged from the live function (EXECUTE to PUBLIC). CREATE OR REPLACE
-- preserves existing grants; re-asserted here to document intent, no widening.
GRANT EXECUTE ON FUNCTION public.get_paige_persona_context() TO PUBLIC;
