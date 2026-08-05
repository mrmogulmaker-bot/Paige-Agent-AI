-- ============================================================================
-- #184 KILL — persona SCOPE is DATA-DRIVEN, no vertical named in the resolver.
--
-- BEFORE: get_paige_persona_context().funding_enabled was a hardcoded 4-condition
--   OR that named the literal vertical 'funding' THREE times:
--     (features->>'paige_funding_skill')='true'
--       OR (features->>'playbook')='funding'
--       OR (features->'playbook_config'->>'slug')='funding'
--       OR (features->'enabled_skills') @> '["funding"]'
--
-- AFTER: funding_enabled is derived from the GENERIC installed-capability signal —
--   the is_finance MARKETPLACE CATALOG GATE (an active install of any is_finance
--   item) OR a generic features.finance_in_scope flag. ZERO 'funding' literal. The
--   funding vertical lights this up by INSTALLING its is_finance Blueprint
--   (20260805120000), whose manifest also sets finance_in_scope=true.
--
-- The OUTPUT column stays named funding_enabled (§37 — 5 edge consumers read
-- row.funding_enabled: paige-ai-chat, paige-orchestrator, growth-page-draft JWT path,
-- + the generated TS types; a rename would break all of them). Its MEANING is now
-- "a finance capability is in scope for this tenant", derived generically.
--
-- NO-REGRESSION BACKFILL (§51/§13): current funding tenants are flagged via
-- features.playbook='funding' / playbook_config.slug='funding', NOT via a marketplace
-- install (there are 0 finance installs today). Dropping the legacy OR without a
-- backfill would DE-FUND them. So we first set features.finance_in_scope=true for
-- exactly the tenants the OLD predicate returned true for — preserving behavior byte-
-- for-byte across the switch. Idempotent (guarded by the not-already-set clause).
--
-- The #588/#589 client-first, deterministic, entitlement-validated resolver body is
-- preserved VERBATIM from the live prod definition (re-quoted via pg_get_functiondef
-- at build time) — ONLY the funding_enabled expression changes. RETURNS TABLE
-- signature is unchanged, so grants and the response contract are preserved by
-- CREATE OR REPLACE.
--
-- §9: SECURITY DEFINER + STABLE unchanged; the added subquery is a read over
--     marketplace_installs/_items scoped to t.id (the resolved tenant), no widening.
-- ============================================================================

BEGIN;

-- ── Leg 1: no-regression backfill (idempotent) ──────────────────────────────
-- Preserve funding for every tenant the OLD predicate flagged, via the new generic
-- flag. This is a one-time DATA migration referencing the legacy signals to carry
-- existing behavior forward; the PERSISTENT resolver below names no vertical.
UPDATE public.tenants
   SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object('finance_in_scope', true)
 WHERE (
        (features ->> 'paige_funding_skill') = 'true'
     OR (features ->> 'playbook') = 'funding'
     OR (features -> 'playbook_config' ->> 'slug') = 'funding'
     OR (features -> 'enabled_skills') @> '["funding"]'::jsonb
   )
   AND COALESCE((features ->> 'finance_in_scope')::boolean, false) = false;

-- ── Leg 2: redefine the resolver — generic funding_enabled, body preserved ───
CREATE OR REPLACE FUNCTION public.get_paige_persona_context()
 RETURNS TABLE(tenant_id uuid, tenant_name text, playbook_config jsonb, playbook_slug text, funding_enabled boolean, brand jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
    -- #184 — GENERIC finance-in-scope signal, NO vertical literal. TRUE when the
    -- tenant holds an active install of ANY is_finance marketplace item (the catalog
    -- gate), OR carries the generic features.finance_in_scope flag (set by an
    -- is_finance Blueprint's install manifest, and backfilled above for legacy
    -- funding tenants). Column name kept as funding_enabled for the response contract.
    COALESCE(
      EXISTS (
        SELECT 1
        FROM public.marketplace_installs mi
        JOIN public.marketplace_items it ON it.id = mi.item_id
        WHERE mi.tenant_id = t.id
          AND mi.status = 'active'
          AND it.is_finance = true
      )
      OR (t.features ->> 'finance_in_scope')::boolean,
      false
    ),
    (SELECT to_jsonb(rb) FROM public.resolve_tenant_brand(_tid) rb) AS brand
  FROM public.tenants t
  WHERE t.id = _tid;
END $function$;

COMMIT;
