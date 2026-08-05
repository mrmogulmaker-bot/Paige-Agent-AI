-- ============================================================================
-- Wave 3.9 SLICE 0 — marketplace_items TIER / ROLE / PUBLISH metadata substrate
-- (#277; §18/§9/§2/§17/§32/§37/§51)
--
-- WHAT: adds five 1:1 metadata columns to the ONE marketplace registry
--   (public.marketplace_items) so the catalog can be gated by subscription TIER,
--   installer ROLE, and a publish LIFECYCLE — plus provenance (who published it).
--   The visibility decision is made AS METADATA + query-time RLS (the caller's
--   tier/role is resolved SERVER-SIDE and intersected against the row), never by a
--   human pre-classifying their request (§36/§18).
--
-- CANONICAL TIERS (owner-ruled, LIVE on prod): Solo / Academy / Enterprise — the
--   ONLY three. platform_subscription_plans slugs are solo/academy/enterprise
--   (verified prod). Solo = single practitioner. Academy = sub-account tier
--   (unlimited sub-accounts, §17 growth atom). Enterprise = custom-quote,
--   sub-account architecture. (NOT the earlier Free/Solo/Team/Agency/Enterprise.)
--
-- CASCADING VISIBILITY (owner Option B): a tenant sees an item if the item's
--   available_to_tiers overlaps the set of tiers AT-OR-BELOW the tenant's tier,
--   ordered Solo(1) < Academy(2) < Enterprise(3). Higher tiers inherit the
--   lower-tier catalog:
--     Solo       tenant -> available_to_tiers ?| {Solo}
--     Academy    tenant -> available_to_tiers ?| {Academy,Solo}
--     Enterprise tenant -> available_to_tiers ?| {Enterprise,Academy,Solo}
--   Implemented with jsonb ?| over the at-or-below-tier key set.
--
-- §18 FOUR-QUESTION GATE (grounded, not believed):
--   (a) GREPPED: `marketplace_items` (40 files). The registry is the SINGLE table
--       public.marketplace_items — DDL/RLS in 20260714270000 (git-ledger twin of
--       ..155542_marketplace_registry_spine), catalog RPC family + operator write
--       seam (20260714192625). Live prod = one items table, 19 rows, 28 cols; all
--       five target columns ABSENT (information_schema.columns confirmed).
--   (b) SIBLINGS (named, all real on prod): marketplace_item_versions,
--       marketplace_installs (+ _ledger, _bundle_links), marketplace_vendors,
--       RLS mp_items_read / mp_items_write, marketplace_catalog_for_tenant(uuid)
--       and (uuid,uuid). NO agency curation/allowlist table exists (list_tables:
--       no *allowlist*/*curation*/*submission*). NO marketplace_item_submissions.
--   (c) WHY ADD COLUMNS (not a new table): all five are 1:1 attributes of an item
--       row (one tier set, one role set, one source_type, one publisher, one
--       publish state). They extend the row's EXISTING scope/status/origin/
--       is_finance/default_for_new_tenants visibility pattern. A 2nd table would
--       force a join on every catalog read + RLS predicate and split the registry's
--       home (§18/§12). source_type/publish_status/publisher_tenant_id are the
--       forward-compat seam for the future marketplace_item_submissions table
--       (OUT OF SCOPE #264) which FKs back to marketplace_items.id — so the columns
--       belong on the parent row.
--   (d) WHERE THE DECISION IS MADE: on the row (columns set by the operator seam /
--       this backfill) + query-time RLS resolving caller tier via
--       current_tenant_tier() and role via _mp_caller_role_keys(). No caller ever
--       picks a tier/role; a Solo tenant never selects "show me Solo items."
--
-- ENUM STYLE (text + CHECK): source_type/publish_status ship as TEXT + CHECK — they
--   WILL gain values (third_party lane, more publish states) and ALTER TYPE ADD
--   VALUE is non-transactional / un-reorderable / un-removable. Matches the
--   pricing_model / serves text-column precedent already on THIS table. The tier and
--   role vocabularies are constrained by jsonb <@ containment CHECKs.
--
-- SHIPPING NOTE (§32 runtime honesty): platform_subscriptions is EMPTY on prod
--   today, so current_tenant_tier() FAILS CLOSED to 'Solo' for EVERY tenant. The §6
--   backfill sets EVERY existing row's available_to_tiers to include 'Solo', so the
--   new tier gate hides NOTHING that is visible today — current catalog visibility
--   is fully preserved. This is the intended fail-closed gate, not a regression.
--
-- FLAGS carried forward:
--   #272 (OWNER-OWED): the funding/vertical Blueprint's per-item tier/role
--     classification is owner-owed. Slice 0 ships the coaching-generic all-tiers
--     default + the mechanism; owner refines per-item later. NOT the final word.
--   §55 (DEFERRED to Slice 1): agency curation ALLOWLIST branch — written as a
--     commented placeholder in mp_items_read. It is ADDITIVE (only ever GRANTS a
--     sub-account extra visibility), so omitting it CANNOT loosen §9 (fails safe).
--     Standing up an empty allowlist table now (no writer/reader) is the §18
--     anti-pattern; Slice 1 owns the curation table + RPC + UI.
--   ROLE VOCAB: the install-role vocabulary is a CHECK-constrained text set, NOT a
--     pg enum (promote only if Slice 1 needs it). The 'client' role KEY has no clean
--     auth->client seam in Slice 0 (public.clients has no user_id column), so
--     _mp_caller_role_keys() does NOT emit 'client' yet — deferred to Slice 1.
--     Zero Slice-0 impact: no shipped row is client-installable (fail-closed safe).
--   SUB-ACCOUNT tier: a sub-account's OWN platform_subscriptions row governs its
--     tier; with none it fails closed to Solo. Agency-INHERITED tier is a Slice-1
--     concern (flagged).
-- ============================================================================

BEGIN;

-- ── 1. The five metadata columns ────────────────────────────────────────────
ALTER TABLE public.marketplace_items
  ADD COLUMN IF NOT EXISTS available_to_tiers   jsonb NOT NULL DEFAULT '["Solo","Academy","Enterprise"]'::jsonb,
  ADD COLUMN IF NOT EXISTS installable_by_role  jsonb NOT NULL DEFAULT '["tenant_admin"]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_type          text  NOT NULL DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS publisher_tenant_id  uuid  NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  -- backfill = 'approved'; NEW items authored via the submissions lane (#264, Slice 2+)
  -- will default 'draft' at that lane, not here.
  ADD COLUMN IF NOT EXISTS publish_status       text  NOT NULL DEFAULT 'approved';

-- Column DEFAULTs are the permissive all-tiers / tenant-admin set so an
-- operator-created row is visible on every tier until deliberately narrowed; the §6
-- backfill overrides per-item. publisher_tenant_id DEFAULT NULL = platform provenance.

DO $$ BEGIN
  -- tier vocabulary: an ARRAY whose VALUES are a subset of the 3 canonical tiers
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mp_items_tiers_ck') THEN
    ALTER TABLE public.marketplace_items
      ADD CONSTRAINT mp_items_tiers_ck
        CHECK (jsonb_typeof(available_to_tiers) = 'array'
           AND available_to_tiers <@ '["Solo","Academy","Enterprise"]'::jsonb);
  END IF;
  -- install-role vocabulary: an ARRAY whose VALUES are a subset of the role keys
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mp_items_roles_ck') THEN
    ALTER TABLE public.marketplace_items
      ADD CONSTRAINT mp_items_roles_ck
        CHECK (jsonb_typeof(installable_by_role) = 'array'
           AND installable_by_role <@ '["tenant_admin","agency_owner","staff","client"]'::jsonb);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mp_items_source_ck') THEN
    ALTER TABLE public.marketplace_items
      ADD CONSTRAINT mp_items_source_ck
        CHECK (source_type IN ('platform','tenant_published','third_party'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mp_items_publish_ck') THEN
    ALTER TABLE public.marketplace_items
      ADD CONSTRAINT mp_items_publish_ck
        CHECK (publish_status IN ('draft','in_review','approved','suspended'));
  END IF;
  -- provenance integrity: platform items name NO publisher; tenant/third-party MUST name one
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mp_items_publisher_provenance_ck') THEN
    ALTER TABLE public.marketplace_items
      ADD CONSTRAINT mp_items_publisher_provenance_ck
        CHECK ( (source_type =  'platform' AND publisher_tenant_id IS NULL)
             OR (source_type <> 'platform' AND publisher_tenant_id IS NOT NULL) );
  END IF;
END $$;

-- GIN indexes so the jsonb ?| tier/role predicates are index-assisted at catalog scale.
CREATE INDEX IF NOT EXISTS mp_items_tiers_gin ON public.marketplace_items USING gin (available_to_tiers);
CREATE INDEX IF NOT EXISTS mp_items_roles_gin ON public.marketplace_items USING gin (installable_by_role);

-- ── 2. Tier resolver — subscription (L1, §17), FAIL-CLOSED to Solo ───────────
-- #272 TRAP AVOIDED: does NOT reuse account_tier() — that returns the ACCOUNT
-- STRUCTURE (agency/subaccount/tenant from tenants.account_type), NOT the billing
-- tier. Subscription tier lives in platform_subscriptions -> _plans.slug.
-- One function, arg defaults to the caller's tenant so it serves BOTH the no-arg RLS
-- predicate AND the arg-taking browse RPC (parity). Returns capitalized to match the
-- available_to_tiers value vocabulary.
CREATE OR REPLACE FUNCTION public.current_tenant_tier(_tenant_id uuid DEFAULT public.current_user_tenant_id())
RETURNS text                              -- 'Solo' | 'Academy' | 'Enterprise'
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT CASE lower(pl.slug)
        WHEN 'enterprise' THEN 'Enterprise'
        WHEN 'academy'    THEN 'Academy'
        WHEN 'solo'       THEN 'Solo'
        ELSE 'Solo' END                     -- unknown/future slug -> most-restrictive
     FROM public.platform_subscriptions ps
     JOIN public.platform_subscription_plans pl ON pl.id = ps.plan_id
     WHERE ps.tenant_id = _tenant_id
       AND ps.status IN ('active','trialing')   -- only a LIVE plan grants a tier; past_due/canceled -> Solo
     ORDER BY ps.created_at DESC
     LIMIT 1),
    'Solo');                                -- no active subscription -> Solo (fail-closed, §9)
$$;
REVOKE ALL ON FUNCTION public.current_tenant_tier(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.current_tenant_tier(uuid) TO authenticated, service_role;

-- Helper: the at-or-below-tier cascade key set for a resolved tier (Option B).
-- Higher tiers INHERIT the lower-tier catalog. Kept as its own STABLE function so the
-- cascade lives in ONE home (§12) and both the RLS read and the browse RPC use it.
CREATE OR REPLACE FUNCTION public._mp_tier_cascade_keys(_tier text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE _tier
    WHEN 'Enterprise' THEN ARRAY['Enterprise','Academy','Solo']
    WHEN 'Academy'    THEN ARRAY['Academy','Solo']
    ELSE                   ARRAY['Solo']            -- 'Solo' and any unexpected -> Solo only
  END;
$$;
REVOKE ALL ON FUNCTION public._mp_tier_cascade_keys(text) FROM public;
GRANT EXECUTE ON FUNCTION public._mp_tier_cascade_keys(text) TO authenticated, service_role;

-- ── 3. Role-key resolver — maps the caller's REAL membership to the install vocab ─
-- Isolates the vocab decision in ONE home (§12) so the RLS stays a clean jsonb ?|.
-- Resolves ONLY from existing role helpers — no new role store. Returns the set of
-- install-role KEYS the caller holds for _tenant_id; the read gates with
-- `installable_by_role ?| _mp_caller_role_keys(...)` (caller must hold >=1 listed key).
--   tenant_admin  <- is_tenant_admin_as(_actor,_tenant_id)
--   agency_owner  <- _actor holds an agency-team role over the GOVERNING AGENCY of
--                    _tenant_id. The governing agency is the parent IF the parent is
--                    an agency/enterprise (i.e. _tenant is a sub-account), ELSE
--                    _tenant itself IF it is an agency/enterprise, ELSE NONE. A plain
--                    STANDALONE tenant has NO governing agency -> never agency_owner.
--                    (Do NOT COALESCE the agency to _tenant_id: agency_team_role()
--                    returns 'agency_owner' for ANY tenant_members owner of the passed
--                    tenant, so passing a standalone tenant's own id would falsely
--                    grant every standalone owner the agency_owner key.)
--   staff         <- any active tenant_members membership of _actor in _tenant_id
--   client        <- DEFERRED (§ flag): public.clients has no user_id seam in Slice 0.
-- A tenant_admin is also a member, so they receive BOTH 'tenant_admin' and 'staff'
-- keys — correct for ?| (an item listed to either is visible to an admin).
CREATE OR REPLACE FUNCTION public._mp_caller_role_keys(
  _tenant_id uuid DEFAULT public.current_user_tenant_id(),
  _actor     uuid DEFAULT auth.uid()
)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    ARRAY_REMOVE(ARRAY[
      CASE WHEN _tenant_id IS NOT NULL AND _actor IS NOT NULL
                AND public.is_tenant_admin_as(_actor, _tenant_id)
           THEN 'tenant_admin' END,
      CASE WHEN _tenant_id IS NOT NULL AND _actor IS NOT NULL
                AND public.agency_team_role(
                      -- governing agency of _tenant_id (NULL for a standalone tenant)
                      (SELECT CASE
                                WHEN par.id IS NOT NULL AND par.account_type IN ('agency','enterprise') THEN par.id
                                WHEN t.account_type IN ('agency','enterprise')                          THEN t.id
                                ELSE NULL END
                         FROM public.tenants t
                         LEFT JOIN public.tenants par ON par.id = t.parent_tenant_id
                        WHERE t.id = _tenant_id),
                      _actor) IS NOT NULL
           THEN 'agency_owner' END,
      CASE WHEN _tenant_id IS NOT NULL AND _actor IS NOT NULL
                AND EXISTS (SELECT 1 FROM public.tenant_members m
                             WHERE m.tenant_id = _tenant_id AND m.user_id = _actor
                               AND COALESCE(m.status,'active') = 'active')
           THEN 'staff' END
    ], NULL),
    ARRAY[]::text[]);
$$;
REVOKE ALL ON FUNCTION public._mp_caller_role_keys(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public._mp_caller_role_keys(uuid, uuid) TO authenticated, service_role;

-- ── 4. READ RLS — additive tier/role/publish filters, §9 scope PRESERVED ─────
-- Super Admin (is_platform_owner) sees ALL rows / statuses / tiers / scopes. A
-- non-owner sees an item only when it is listed AND approved AND its tier set
-- overlaps the caller's at-or-below-tier cascade AND the caller holds a permitted
-- install-role key AND the PRIOR §9 scope clause matches. Every new predicate is
-- AND-appended to the preserved scope block — §9 scope is only ever NARROWED.
DROP POLICY IF EXISTS mp_items_read ON public.marketplace_items;
CREATE POLICY mp_items_read ON public.marketplace_items
  FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR (
      status = 'listed'                                          -- PRESERVED §9 gate
      AND publish_status = 'approved'                            -- NEW: publish lifecycle
      AND available_to_tiers ?| public._mp_tier_cascade_keys(    -- NEW: cascading tier gate
            public.current_tenant_tier())
      AND installable_by_role ?| public._mp_caller_role_keys()   -- NEW: installer-role gate
      AND (                                                      -- PRESERVED §9 scope (unchanged)
           scope = 'public'
        OR (scope = 'tenant' AND visible_to_tenant_id = public.current_user_tenant_id())
        OR (scope = 'agency' AND public.agency_team_role(visible_to_agency_id, auth.uid()) IS NOT NULL)
      )
      -- [Slice 1 · §55, DEFERRED not dropped] AND-append an OR-clause to the scope
      -- block once the agency CURATION allowlist table + RPC land:
      --   OR ( item ∈ agency_item_allowlist(parent_agency_of current_user_tenant_id()) )
      -- It is ADDITIVE (only GRANTS a sub-account extra visibility to a curated
      -- item) so omitting it now cannot loosen §9 — it fails SAFE (a sub-account
      -- sees slightly less until Slice 1, never more). Standing up an empty
      -- allowlist table with no writer/reader now is the §18 anti-pattern.
    )
  );

-- ── 4b. WRITE RLS — owner-LOCKED (Slice 0) ───────────────────────────────────
-- TIGHTENED: the Super Admin is the ONLY authenticated writer, regardless of
-- source_type. The prior policy's vendor-owner-tenant-admin branch is DROPPED — it
-- is DEAD CODE (§37 producer inventory: NO shipping caller does a direct
-- authenticated tenant write to marketplace_items; every write goes through the
-- SECURITY DEFINER operator RPC family — marketplace_upsert_item etc. — which runs
-- as table owner and BYPASSES table RLS, so this tighten does not touch them). The
-- #271 table GRANTs stay (grant lets RLS govern; that is the intended model — grant
-- + restrictive policy, not REVOKE). FUTURE tenant/third-party authoring routes
-- through a SEPARATE marketplace_item_submissions table (parked #264) that the Super
-- Admin promotes on approval — NEVER a direct tenant write to the registry.
DROP POLICY IF EXISTS mp_items_write ON public.marketplace_items;
CREATE POLICY mp_items_write ON public.marketplace_items
  FOR ALL TO authenticated
  USING      (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

-- ── 5. Browse-RPC parity — gate IDENTICALLY to the table read (§37 consumer) ──
-- The catalog RPC is SECURITY DEFINER (bypasses RLS), so without this it would LEAK
-- non-approved / wrong-tier / wrong-role items the direct read now hides. Both
-- overloads gain the identical publish + cascading-tier + role filter. Response
-- contract (RETURNS TABLE) is UNCHANGED — rows are only narrowed. tier resolves via
-- current_tenant_tier(_tenant_id) (never request input).
CREATE OR REPLACE FUNCTION public.marketplace_catalog_for_tenant(_tenant_id uuid)
 RETURNS TABLE (
   slug text, item_type public.marketplace_item_type, name text, tagline text,
   description text, category text, icon text, pricing_model text, price_cents integer,
   requires_embedding boolean, installed boolean, install_status text, version text
 )
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.is_platform_owner()
    OR public.is_tenant_admin(_tenant_id)
    OR _tenant_id = public.current_user_tenant_id()
  ) THEN
    RAISE EXCEPTION 'not authorized to read this tenant''s catalog' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT i.slug, i.item_type, i.name, i.tagline, i.description, i.category, i.icon,
         i.pricing_model, i.price_cents,
         (v.install_manifest ? 'kb_pack') AS requires_embedding,
         (mi.id IS NOT NULL AND mi.status = 'active') AS installed,
         mi.status AS install_status,
         v.semver AS version
  FROM public.marketplace_items i
  LEFT JOIN public.marketplace_item_versions v ON v.id = i.current_version_id
  LEFT JOIN public.marketplace_installs mi ON mi.item_id = i.id AND mi.tenant_id = _tenant_id
  WHERE public.is_platform_owner()
     OR (i.status = 'listed'
         AND i.publish_status = 'approved'                                          -- parity
         AND i.available_to_tiers ?| public._mp_tier_cascade_keys(                  -- parity: cascade
               public.current_tenant_tier(_tenant_id))
         AND i.installable_by_role ?| public._mp_caller_role_keys(_tenant_id, auth.uid())  -- parity: role
         AND (
              i.scope = 'public'
              OR (i.scope = 'tenant' AND i.visible_to_tenant_id = _tenant_id)
              OR (i.scope = 'agency' AND public.agency_team_role(i.visible_to_agency_id, auth.uid()) IS NOT NULL)
            ))
  ORDER BY i.category, i.name;
END $function$;
REVOKE ALL ON FUNCTION public.marketplace_catalog_for_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_catalog_for_tenant(uuid) TO authenticated, service_role;

-- Service-role, actor-scoped overload (Paige's headless agent). tier by _tenant_id,
-- role/agency by _actor_user_id — NEVER read tier/role from request input.
CREATE OR REPLACE FUNCTION public.marketplace_catalog_for_tenant(_tenant_id uuid, _actor_user_id uuid)
 RETURNS TABLE (
   slug text, item_type public.marketplace_item_type, name text, tagline text,
   description text, category text, icon text, pricing_model text, price_cents integer,
   requires_embedding boolean, installed boolean, install_status text, version text
 )
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._marketplace_is_service_role() THEN
    RAISE EXCEPTION 'service-role required for actor-scoped marketplace overload' USING ERRCODE = '42501';
  END IF;
  IF _actor_user_id IS NULL OR NOT public.is_tenant_admin_as(_actor_user_id, _tenant_id) THEN
    RAISE EXCEPTION 'actor is not an admin of this tenant' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT i.slug, i.item_type, i.name, i.tagline, i.description, i.category, i.icon,
         i.pricing_model, i.price_cents,
         (v.install_manifest ? 'kb_pack') AS requires_embedding,
         (mi.id IS NOT NULL AND mi.status = 'active') AS installed,
         mi.status AS install_status,
         v.semver AS version
  FROM public.marketplace_items i
  LEFT JOIN public.marketplace_item_versions v ON v.id = i.current_version_id
  LEFT JOIN public.marketplace_installs mi ON mi.item_id = i.id AND mi.tenant_id = _tenant_id
  WHERE i.status = 'listed'
    AND i.publish_status = 'approved'                                               -- parity
    AND i.available_to_tiers ?| public._mp_tier_cascade_keys(                       -- parity: cascade
          public.current_tenant_tier(_tenant_id))
    AND i.installable_by_role ?| public._mp_caller_role_keys(_tenant_id, _actor_user_id)  -- parity: role
    AND (
         i.scope = 'public'
         OR (i.scope = 'tenant' AND i.visible_to_tenant_id = _tenant_id)
         OR (i.scope = 'agency' AND public.agency_team_role(i.visible_to_agency_id, _actor_user_id) IS NOT NULL)
       )
  ORDER BY i.category, i.name;
END $function$;
REVOKE ALL ON FUNCTION public.marketplace_catalog_for_tenant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_catalog_for_tenant(uuid, uuid) TO service_role;

-- ── 6. Backfill — every existing row: platform provenance + approved + all-tiers +
--       tenant-admin install (coaching-generic, §2-clean). ────────────────────
-- All 19 rows are status=listed, scope=public, origin=first_party (verified). The
-- all-tiers default means the new tier gate hides NOTHING visible today (§32 above).
-- Idempotent guard: only backfill rows still on the fresh column DEFAULTs is not
-- needed — we set the intended values explicitly and the DEFAULTs already match, so
-- a re-run is a no-op on values.
UPDATE public.marketplace_items
   SET available_to_tiers  = '["Solo","Academy","Enterprise"]'::jsonb,   -- coaching-generic -> all tiers (cascade: everyone)
       installable_by_role = '["tenant_admin"]'::jsonb,                  -- only the tenant admin installs (safe default)
       source_type         = 'platform',
       publisher_tenant_id  = NULL,
       publish_status      = 'approved';                                 -- everything shipped is live
-- #272 (OWNER-OWED): per-item vertical tier/role refinement (e.g. gating the funding
-- preset to Academy+Enterprise, or widening a pack to staff/client) is the owner's
-- later call. The §2 finance guard + is_finance flag on 'funding'/'funding_preset'
-- are UNTOUCHED — tier metadata is not a default and does not make funding a default.

COMMIT;
