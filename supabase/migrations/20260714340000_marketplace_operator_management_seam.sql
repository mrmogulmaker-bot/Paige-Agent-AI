-- ============================================================================
-- Marketplace OPERATOR (God / platform-owner) MANAGEMENT SEAM — Phase 1, part 3
--
-- Waves 1–2 gave tenants an honest INSTALL seam. This migration gives the OPERATOR
-- (us) — and the operator's Paige/back-office (§10) — the seam to FILL and RUN the
-- shelf from an RPC/console, never raw SQL. It is the §9 counterpart to the tenant
-- install seam.
--
-- Every operator RPC here is: SECURITY DEFINER · SET search_path=public ·
-- REVOKE-from-PUBLIC + GRANT authenticated/service_role · gated so BOTH the
-- JWT-bearing operator (is_platform_owner) AND a raw service_role back-office call
-- (current_user='service_role', auth.uid() NULL) are accepted (§10) · one honest
-- paige_audit_log row per mutation (§13) · no literal UUIDs (the first-party vendor
-- is resolved by its stable slug 'paige') · idempotent DDL.
--
-- What it adds / rewrites:
--   marketplace_upsert_item(...)              create OR PATCH a first-party item
--   marketplace_publish_version(...)          cut + publish a config_only version
--   marketplace_set_item_status(...)          list / unlist / archive
--   marketplace_set_current_version(...)      re-point current_version_id
--   marketplace_set_featured(...)             console curation toggle
--   marketplace_set_default_for_new_tenants() §9 default-shelf toggle (NEW, audited)
--   marketplace_deprecate_version(...)        retire a published version (NEW, audited)
--   marketplace_operator_catalog()            operator-wide read + true-semantics ledger
--
-- This pass resolves the Wave-3 review BLOCK (two reviewers + compliance officer):
--   B1  freeze is now SECURITY INVOKER — current_user reflects the CALLER, so the
--       'postgres/supabase_admin/service_role' allow-branch no longer matches a
--       tenant vendor writing over the RLS path (the freeze had been a no-op).
--   B2  upsert is now PATCH semantics — every optional arg defaults NULL and is
--       COALESCEd against the existing row on update; hard defaults apply only on
--       insert. A partial "update the tagline" call no longer nukes scope/is_finance/
--       pricing/take_rate/visibility.
--   M1  the freeze now fires BEFORE INSERT OR UPDATE — a non-privileged INSERT
--       cannot be born featured/with a fake install_count/rating/current_version.
--   M2  upsert's update branch refuses to touch a non-first_party (vendor) item.
--   M3  a dedicated, audited default-shelf RPC (no silent direct UPDATE).
--   M4  a dedicated, audited deprecate-version verb.
--   M5  the ledger rollup counts GROSS from revenue events only and surfaces
--       refunds separately, with columns named to their true semantics.
--   M6  every operator gate accepts service_role so §10/back-office isn't locked out.
--   M7  current_version_id is frozen on the direct RLS path (no draft/code/foreign
--       re-point past set_current_version's checks).
--   M8  publish blocks code by manifest CONTENT (kind whitelist + code_ref/inline
--       reject), not by the payload_class label alone.
--   L1  audit action renamed 'marketplace.version.set_current'.
--   L2  'archived' is REVERSIBLE by design — set_item_status can move it back to
--       unlisted/listed (documented below); it is not a terminal state.
--   L3  REVOKE ALL … FROM PUBLIC on the freeze trigger function.
--   L4  publish emits a §2 WARNING (never a hard block) if a PUBLIC first-party,
--       non-is_finance version ships finance vocabulary — so browse-to-all-tenants
--       finance content is surfaced for an explicit opt-in decision.
--
-- §12 EXTEND, don't rebuild: these RPCs write the EXISTING registry tables and lean
-- on the EXISTING guards. The §2 finance guards (marketplace_item_guard /
-- marketplace_finance_default_recheck) and the append-only ledger trigger are NOT
-- bypassed — they fire on these writes exactly as before.
--
-- agency_resellable is intentionally NOT added here — that is Wave 5 and needs its
-- own reseller rail; a premature nullable column would be a dead flag (logged).
-- ============================================================================

BEGIN;

-- ── §12 forward-compat curation column ──────────────────────────────────────
ALTER TABLE public.marketplace_items
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.marketplace_items.featured IS
  'Operator curation flag for the marketplace console hero/spotlight. Operator-managed only: frozen against non-privileged callers by marketplace_items_freeze_privileged() on BOTH insert and update, so a tenant vendor can neither self-feature an existing listing nor be born featured.';

-- ── B1/M1/M7/L3: the freeze, corrected ──────────────────────────────────────
-- SECURITY INVOKER (the default — SECURITY DEFINER is REMOVED). This is the crux of
-- B1: as a DEFINER function the body ran with current_user = the function OWNER
-- (postgres), so the allow-branch `current_user IN ('postgres','supabase_admin',
-- 'service_role')` was ALWAYS true and the freeze never fired on the direct RLS
-- path — a tenant vendor could self-set featured/is_finance/install_count/rating/
-- origin/current_version on its own item. As INVOKER, current_user is the CALLER:
--   • direct PostgREST vendor write → current_user='authenticated' → freeze applies.
--   • the operator RPCs below (SECURITY DEFINER, owned by the migration role) →
--     current_user = that privileged role → allow-branch matches → writes pass.
--   • a raw service_role write → current_user='service_role' → allow-branch matches.
-- is_platform_owner() is itself a SECURITY DEFINER helper reading auth.uid(), so it
-- still resolves correctly for a JWT-bearing operator regardless of this function's
-- security context.
--
-- M1: now BEFORE INSERT OR UPDATE. On a non-privileged INSERT (OLD IS NULL) the
-- birth-state stat/curation columns must be at their defaults — featured=false,
-- install_count=0, rating_avg NULL, rating_count=0, current_version_id NULL — so a
-- vendor cannot be born self-featured or with a forged install/rating/version.
-- (origin/default_for_new_tenants/scope on insert are constrained by the RLS
-- mp_items_write WITH CHECK; is_finance is a legitimate, more-restrictive honest
-- self-declaration a vendor may set on its own item, and can never make that item a
-- default — the §2 default guard blocks that independently — so it is not frozen at
-- birth.) M7: current_version_id is frozen on UPDATE too, so a vendor cannot
-- re-point its card at a draft/code/foreign version behind set_current_version.
CREATE OR REPLACE FUNCTION public.marketplace_items_freeze_privileged()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  -- Privileged callers pass untouched. current_user is the CALLER (INVOKER):
  -- the definer RPCs run as the migration/owner role; service_role writes raw.
  IF current_user IN ('postgres','supabase_admin','service_role') OR public.is_platform_owner() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Non-privileged births: stat/curation/version columns must be at defaults.
    IF NEW.featured IS DISTINCT FROM false
       OR NEW.install_count IS DISTINCT FROM 0
       OR NEW.rating_avg IS NOT NULL
       OR NEW.rating_count IS DISTINCT FROM 0
       OR NEW.current_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'these marketplace_items columns are platform-managed and cannot be set on insert (featured, install_count, rating_avg, rating_count, current_version_id)'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Non-privileged UPDATE: none of the platform-managed columns may change.
  IF NEW.install_count      IS DISTINCT FROM OLD.install_count
     OR NEW.rating_avg      IS DISTINCT FROM OLD.rating_avg
     OR NEW.rating_count    IS DISTINCT FROM OLD.rating_count
     OR NEW.origin          IS DISTINCT FROM OLD.origin
     OR NEW.default_for_new_tenants IS DISTINCT FROM OLD.default_for_new_tenants
     OR NEW.is_finance      IS DISTINCT FROM OLD.is_finance
     OR NEW.featured        IS DISTINCT FROM OLD.featured
     OR NEW.current_version_id IS DISTINCT FROM OLD.current_version_id THEN
    RAISE EXCEPTION 'these marketplace_items columns are managed by the platform and cannot be changed directly'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.marketplace_items_freeze_privileged() FROM PUBLIC;  -- L3

DROP TRIGGER IF EXISTS trg_marketplace_items_freeze ON public.marketplace_items;
CREATE TRIGGER trg_marketplace_items_freeze
  BEFORE INSERT OR UPDATE ON public.marketplace_items   -- M1: insert path added
  FOR EACH ROW EXECUTE FUNCTION public.marketplace_items_freeze_privileged();

-- ── M6 (corrected): operator authorization for the SECURITY DEFINER RPCs ──────
-- CRITICAL: the operator RPCs below run SECURITY DEFINER, so inside them
-- current_user = the function OWNER (postgres), NEVER the caller. A prior
-- `current_user = 'service_role'` gate was therefore UNREACHABLE and would reject a
-- raw service_role back-office call (auth.uid() NULL, is_platform_owner() false),
-- locking Paige's back-office out of §10. Detect the caller from the request JWT
-- role claim instead — PostgREST sets request.jwt.claims from the presented key
-- (the service_role key IS a JWT with role=service_role), and that GUC is readable
-- regardless of the function's security context. Single source of truth for the
-- gate + the audit actor label (also removes the hardcoded-role-name fragility).
CREATE OR REPLACE FUNCTION public._marketplace_is_service_role()
 RETURNS boolean LANGUAGE sql STABLE AS $function$
  SELECT coalesce(
           (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role',
           false)
      OR session_user = 'service_role';  -- covers a direct service_role DB session
$function$;
REVOKE ALL ON FUNCTION public._marketplace_is_service_role() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._marketplace_operator_authorized()
 RETURNS boolean LANGUAGE sql STABLE AS $function$
  SELECT public.is_platform_owner() OR public._marketplace_is_service_role();
$function$;
REVOKE ALL ON FUNCTION public._marketplace_operator_authorized() FROM PUBLIC;

-- ============================================================================
-- 1. marketplace_upsert_item — create OR PATCH a first-party catalog item (B2/M2/M6)
--    Every optional arg defaults NULL. On CREATE, hard defaults apply. On UPDATE,
--    each field COALESCEs against the existing row, so a partial call touches only
--    what it passes and never silently resets scope/visibility/is_finance/pricing/
--    take_rate/tagline/description/icon.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.marketplace_upsert_item(
  _slug                 text,
  _item_type            text    DEFAULT NULL,
  _name                 text    DEFAULT NULL,
  _category             text    DEFAULT NULL,
  _tagline              text    DEFAULT NULL,
  _description          text    DEFAULT NULL,
  _icon                 text    DEFAULT NULL,
  _scope                text    DEFAULT NULL,
  _visible_to_tenant_id uuid    DEFAULT NULL,
  _visible_to_agency_id uuid    DEFAULT NULL,
  _pricing_model        text    DEFAULT NULL,
  _price_cents          integer DEFAULT NULL,
  _billing_period       text    DEFAULT NULL,
  _take_rate_bps        integer DEFAULT NULL,
  _serves               text    DEFAULT NULL,
  _is_finance           boolean DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _vendor uuid;
  _existing public.marketplace_items%ROWTYPE;
  _item public.marketplace_items%ROWTYPE;
  _created boolean := false;
  _actor_role text;
  -- effective (resolved) values actually written:
  _e_item_type text; _e_name text; _e_category text;
  _e_tagline text; _e_description text; _e_icon text;
  _e_scope text; _e_vis_tenant uuid; _e_vis_agency uuid;
  _e_pricing text; _e_price integer; _e_billing text;
  _e_take integer; _e_serves text; _e_is_finance boolean;
BEGIN
  -- §9/§10 gate BEFORE any write: JWT operator OR raw service_role back-office (M6).
  IF NOT (public._marketplace_operator_authorized()) THEN
    RAISE EXCEPTION 'only the platform owner (or service_role) may manage the first-party catalog'
      USING ERRCODE = '42501';
  END IF;
  _actor_role := CASE WHEN public.is_platform_owner() THEN 'platform_owner' ELSE 'service_role' END;  -- ELSE reached only when _marketplace_is_service_role()

  IF _slug IS NULL OR _slug !~ '^[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'invalid item slug %: must match ^[a-z0-9_]+$', coalesce(_slug,'<null>')
      USING ERRCODE = '22023';
  END IF;

  -- Resolve the first-party vendor by its stable slug — NO literal UUID (§12).
  SELECT id INTO _vendor FROM public.marketplace_vendors WHERE slug = 'paige';
  IF _vendor IS NULL THEN
    RAISE EXCEPTION 'first-party vendor (slug=paige) is missing; registry spine not applied'
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO _existing FROM public.marketplace_items WHERE slug = _slug;
  _created := NOT FOUND;

  -- M2: the operator first-party seam edits FIRST-PARTY items only. slug is globally
  -- unique, so without this a call would silently reach across and rewrite a vendor
  -- listing (a first-party tool becoming a vendor-listing backdoor). Vendor items
  -- change via their own moderation seam.
  IF NOT _created AND _existing.origin <> 'first_party' THEN
    RAISE EXCEPTION 'item % is a % listing and cannot be edited through the operator first-party seam; use the vendor moderation path', _slug, _existing.origin
      USING ERRCODE = '42501';
  END IF;

  -- ── Resolve effective values: hard defaults on create, PATCH-coalesce on update ─
  _e_item_type   := coalesce(_item_type,   CASE WHEN _created THEN NULL ELSE _existing.item_type::text END);
  _e_name        := coalesce(_name,        CASE WHEN _created THEN NULL ELSE _existing.name END);
  _e_category    := coalesce(_category,    CASE WHEN _created THEN NULL ELSE _existing.category END);
  _e_tagline     := coalesce(_tagline,     CASE WHEN _created THEN NULL ELSE _existing.tagline END);
  _e_description := coalesce(_description,  CASE WHEN _created THEN NULL ELSE _existing.description END);
  _e_icon        := coalesce(_icon,        CASE WHEN _created THEN NULL ELSE _existing.icon END);
  _e_scope       := coalesce(_scope,       CASE WHEN _created THEN 'public' ELSE _existing.scope::text END);
  _e_pricing     := coalesce(_pricing_model, CASE WHEN _created THEN 'free' ELSE _existing.pricing_model END);
  _e_price       := coalesce(_price_cents, CASE WHEN _created THEN 0 ELSE _existing.price_cents END);
  _e_billing     := coalesce(_billing_period, CASE WHEN _created THEN NULL ELSE _existing.billing_period END);
  _e_take        := coalesce(_take_rate_bps, CASE WHEN _created THEN 2000 ELSE _existing.take_rate_bps END);
  _e_serves      := coalesce(_serves,      CASE WHEN _created THEN 'operator' ELSE _existing.serves END);
  _e_is_finance  := coalesce(_is_finance,  CASE WHEN _created THEN false ELSE _existing.is_finance END);

  -- A create needs the identifying fields; an update may omit them (they coalesce).
  IF _created AND (_e_item_type IS NULL OR _e_name IS NULL OR _e_category IS NULL) THEN
    RAISE EXCEPTION 'creating a new item requires _item_type, _name and _category'
      USING ERRCODE = '22023';
  END IF;

  -- ── Validate the EFFECTIVE values (clean, cause-explaining errors) ──────────
  IF _e_item_type NOT IN ('skin','skill','kb_pack','tool','portal_surface','automation','bundle') THEN
    RAISE EXCEPTION 'invalid item_type %', _e_item_type USING ERRCODE = '22023';
  END IF;
  IF _e_scope NOT IN ('public','tenant','agency') THEN
    RAISE EXCEPTION 'invalid scope %', _e_scope USING ERRCODE = '22023';
  END IF;
  IF _e_pricing NOT IN ('free','one_time','subscription') THEN
    RAISE EXCEPTION 'invalid pricing_model %', _e_pricing USING ERRCODE = '22023';
  END IF;
  IF _e_serves NOT IN ('operator','operator_client') THEN
    RAISE EXCEPTION 'invalid serves %', _e_serves USING ERRCODE = '22023';
  END IF;
  IF _e_billing IS NOT NULL AND _e_billing NOT IN ('monthly','annual') THEN
    RAISE EXCEPTION 'invalid billing_period %', _e_billing USING ERRCODE = '22023';
  END IF;
  IF coalesce(_e_price,0) < 0 THEN
    RAISE EXCEPTION 'price_cents must be >= 0' USING ERRCODE = '22023';
  END IF;
  IF coalesce(_e_take,2000) < 0 OR coalesce(_e_take,2000) > 10000 THEN
    RAISE EXCEPTION 'take_rate_bps must be between 0 and 10000' USING ERRCODE = '22023';
  END IF;

  -- Derive the visibility targets from the EFFECTIVE scope so a scope change stays
  -- consistent and an unchanged scope preserves its target (never silently public).
  IF _e_scope = 'public' THEN
    _e_vis_tenant := NULL; _e_vis_agency := NULL;
  ELSIF _e_scope = 'tenant' THEN
    _e_vis_tenant := coalesce(_visible_to_tenant_id, CASE WHEN _created THEN NULL ELSE _existing.visible_to_tenant_id END);
    _e_vis_agency := NULL;
  ELSE  -- 'agency'
    _e_vis_agency := coalesce(_visible_to_agency_id, CASE WHEN _created THEN NULL ELSE _existing.visible_to_agency_id END);
    _e_vis_tenant := NULL;
  END IF;
  -- Mirror mp_scope_target_ck for a readable error instead of a raw CHECK 23514.
  IF NOT (
       (_e_scope='public' AND _e_vis_tenant IS NULL AND _e_vis_agency IS NULL)
    OR (_e_scope='tenant' AND _e_vis_tenant IS NOT NULL)
    OR (_e_scope='agency' AND _e_vis_agency IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'scope % requires the matching visibility target (tenant->visible_to_tenant_id, agency->visible_to_agency_id, public->neither)', _e_scope
      USING ERRCODE = '22023';
  END IF;

  IF _created THEN
    -- New items are born UNLISTED with no version — they only reach the shelf via
    -- publish_version + set_item_status (§11: never a broken card).
    INSERT INTO public.marketplace_items
      (slug, item_type, vendor_id, origin, name, tagline, description, category, icon,
       scope, visible_to_tenant_id, visible_to_agency_id, status,
       pricing_model, price_cents, billing_period, take_rate_bps, serves, is_finance)
    VALUES
      (_slug, _e_item_type::public.marketplace_item_type, _vendor, 'first_party',
       _e_name, _e_tagline, _e_description, _e_category, _e_icon,
       _e_scope::public.marketplace_scope, _e_vis_tenant, _e_vis_agency, 'unlisted',
       _e_pricing, _e_price, _e_billing, _e_take, _e_serves, _e_is_finance)
    RETURNING * INTO _item;
  ELSE
    -- PATCH in place. vendor_id/origin/status/current_version_id are NOT touched
    -- here — status/version move only through their own audited RPCs.
    UPDATE public.marketplace_items SET
       item_type            = _e_item_type::public.marketplace_item_type,
       name                 = _e_name,
       tagline              = _e_tagline,
       description          = _e_description,
       category             = _e_category,
       icon                 = _e_icon,
       scope                = _e_scope::public.marketplace_scope,
       visible_to_tenant_id = _e_vis_tenant,
       visible_to_agency_id = _e_vis_agency,
       pricing_model        = _e_pricing,
       price_cents          = _e_price,
       billing_period       = _e_billing,
       take_rate_bps        = _e_take,
       serves               = _e_serves,
       is_finance           = _e_is_finance,
       updated_at           = now()
     WHERE id = _existing.id
    RETURNING * INTO _item;
  END IF;

  -- §13 honest audit: exactly one row recording what changed.
  INSERT INTO public.paige_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
  VALUES (
    auth.uid(), _actor_role,
    CASE WHEN _created THEN 'marketplace.item.upsert.create'
         ELSE 'marketplace.item.upsert.update' END,
    'marketplace_item', _item.id,
    jsonb_build_object(
      'created', _created,
      'slug', _item.slug,
      'item_type', _item.item_type,
      'name', _item.name,
      'category', _item.category,
      'scope', _item.scope,
      'visible_to_tenant_id', _item.visible_to_tenant_id,
      'visible_to_agency_id', _item.visible_to_agency_id,
      'pricing_model', _item.pricing_model,
      'price_cents', _item.price_cents,
      'billing_period', _item.billing_period,
      'take_rate_bps', _item.take_rate_bps,
      'serves', _item.serves,
      'is_finance', _item.is_finance
    ),
    NULL
  );

  RETURN jsonb_build_object(
    'ok', true, 'created', _created,
    'id', _item.id, 'slug', _item.slug,
    'status', _item.status, 'item_type', _item.item_type,
    'current_version_id', _item.current_version_id
  );
END $function$;
REVOKE ALL ON FUNCTION public.marketplace_upsert_item(text,text,text,text,text,text,text,text,uuid,uuid,text,integer,text,integer,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_upsert_item(text,text,text,text,text,text,text,text,uuid,uuid,text,integer,text,integer,text,boolean) TO authenticated, service_role;

-- ============================================================================
-- 2. marketplace_publish_version — cut + publish a config_only version atomically
--    (M8: code is blocked by manifest CONTENT, not the payload_class label alone)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.marketplace_publish_version(
  _item_slug        text,
  _semver           text,
  _payload_class    text    DEFAULT 'config_only',
  _install_manifest jsonb   DEFAULT '{}'::jsonb,
  _changelog        text    DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _item public.marketplace_items%ROWTYPE;
  _ver  public.marketplace_item_versions%ROWTYPE;
  _fn   jsonb;
  _kind text;
  _kb   jsonb;
  _actor_role text;
  _finance_warning text := NULL;
  -- The ONLY function kinds that may publish on this config-only operator path.
  -- Fail-closed: anything not on this list is treated as potentially code-bearing
  -- and routed to the Phase-2 approval rail (#218). Extend this list as new,
  -- reviewed config kinds are formally declared.
  _allowed_kinds text[] := ARRAY['skill_flag','feature_flag','persona_overlay','portal_surface'];
BEGIN
  IF NOT (public._marketplace_operator_authorized()) THEN  -- M6
    RAISE EXCEPTION 'only the platform owner (or service_role) may publish catalog versions'
      USING ERRCODE = '42501';
  END IF;
  _actor_role := CASE WHEN public.is_platform_owner() THEN 'platform_owner' ELSE 'service_role' END;  -- ELSE reached only when _marketplace_is_service_role()

  -- §14/§17 approval-rail boundary: executable code NEVER publishes on this path.
  IF _payload_class = 'code' THEN
    RAISE EXCEPTION 'code payloads cannot be published through the operator seam; a payload_class=code version must clear the Phase-2 approval rail (#218) before it can publish'
      USING ERRCODE = '42501';
  END IF;
  IF _payload_class IS DISTINCT FROM 'config_only' THEN
    RAISE EXCEPTION 'invalid payload_class %: only config_only is publishable here', coalesce(_payload_class,'<null>')
      USING ERRCODE = '22023';
  END IF;

  IF _semver IS NULL OR _semver !~ '^\d+\.\d+\.\d+$' THEN
    RAISE EXCEPTION 'invalid semver %: must be MAJOR.MINOR.PATCH', coalesce(_semver,'<null>')
      USING ERRCODE = '22023';
  END IF;

  IF _install_manifest IS NULL OR jsonb_typeof(_install_manifest) <> 'object' THEN
    RAISE EXCEPTION 'install_manifest must be a json object' USING ERRCODE = '22023';
  END IF;

  -- M8: a config_only-LABELLED manifest cannot smuggle executable code. Tie the
  -- decision to CONTENT: reject a top-level code_ref/code, and reject any
  -- functions[] entry whose kind is not a declared config kind or that carries a
  -- code reference — regardless of what the payload_class arg claims.
  IF _install_manifest ? 'code_ref' OR _install_manifest ? 'code' THEN
    RAISE EXCEPTION 'install_manifest carries a code reference (code_ref/code); a code payload must clear the Phase-2 approval rail (#218), it cannot publish as config_only'
      USING ERRCODE = '42501';
  END IF;
  IF _install_manifest ? 'functions' AND jsonb_typeof(_install_manifest->'functions') <> 'array' THEN
    RAISE EXCEPTION 'install_manifest.functions must be an array' USING ERRCODE = '22023';
  END IF;
  IF _install_manifest ? 'functions' THEN
    FOR _fn IN SELECT * FROM jsonb_array_elements(_install_manifest->'functions') LOOP
      IF jsonb_typeof(_fn) <> 'object' OR (_fn->>'kind') IS NULL THEN
        RAISE EXCEPTION 'each install_manifest.functions[] entry needs an object with a kind' USING ERRCODE = '22023';
      END IF;
      _kind := _fn->>'kind';
      IF NOT (_kind = ANY (_allowed_kinds)) THEN
        RAISE EXCEPTION 'install_manifest.functions[] kind "%" is not a permitted config-only kind on the operator publish path; code-bearing/undeclared kinds must clear the Phase-2 approval rail (#218)', _kind
          USING ERRCODE = '42501';
      END IF;
      IF _fn ? 'code_ref' OR _fn ? 'code' OR _fn ? 'code_url' OR _fn ? 'source' OR _fn ? 'handler' OR _fn ? 'entrypoint' THEN
        RAISE EXCEPTION 'install_manifest.functions[] entry of kind "%" carries a code reference; code cannot publish here (Phase-2 approval rail #218)', _kind
          USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;
  IF _install_manifest ? 'kb_pack' THEN
    _kb := _install_manifest->'kb_pack';
    IF jsonb_typeof(_kb) <> 'object' OR NOT (_kb ? 'docs') OR jsonb_typeof(_kb->'docs') <> 'array' THEN
      RAISE EXCEPTION 'install_manifest.kb_pack must be an object with a docs array' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF _install_manifest ? 'bundle_items' AND jsonb_typeof(_install_manifest->'bundle_items') <> 'array' THEN
    RAISE EXCEPTION 'install_manifest.bundle_items must be an array' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _item FROM public.marketplace_items WHERE slug = _item_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace item % not found', _item_slug USING ERRCODE = 'no_data_found';
  END IF;

  IF EXISTS (SELECT 1 FROM public.marketplace_item_versions
              WHERE item_id = _item.id AND semver = _semver) THEN
    RAISE EXCEPTION 'version % already exists for item %; bump the semver', _semver, _item_slug
      USING ERRCODE = 'unique_violation';
  END IF;

  -- L4 (§2): a PUBLIC first-party version that is NOT is_finance but ships finance
  -- vocabulary would be visible to every tenant in browse without an opt-in. Do NOT
  -- hard-block a legitimately opt-in item — surface a WARNING so the operator makes
  -- the is_finance / opt-in decision explicitly. (The hard §2 block stays where it
  -- belongs: default_for_new_tenants, enforced by marketplace_item_guard.)
  IF _item.origin = 'first_party' AND _item.scope = 'public' AND NOT _item.is_finance
     AND lower(coalesce(_install_manifest::text,'')) ~ public._marketplace_finance_re() THEN
    _finance_warning := 'This public first-party version ships finance/credit vocabulary but the item is not marked is_finance. A public listing is shown to all tenants in browse. Mark is_finance and keep it opt-in, or confirm the exposure is intended (§2).';
    RAISE WARNING '%', _finance_warning;
  END IF;

  -- Cut the version already-published and point the item at it in one txn. The
  -- version-insert fires trg_mp_versions_finance_recheck and the current_version
  -- move fires trg_mp_items_finance_recheck — the §2 default-finance guards run
  -- here exactly as designed; we do not bypass them.
  INSERT INTO public.marketplace_item_versions
    (item_id, semver, status, payload_class, install_manifest, changelog, created_by, published_at)
  VALUES
    (_item.id, _semver, 'published', 'config_only', _install_manifest, _changelog, auth.uid(), now())
  RETURNING * INTO _ver;

  UPDATE public.marketplace_items
     SET current_version_id = _ver.id, updated_at = now()
   WHERE id = _item.id;

  INSERT INTO public.paige_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
  VALUES (
    auth.uid(), _actor_role, 'marketplace.version.publish',
    'marketplace_item_version', _ver.id,
    jsonb_build_object(
      'item_slug', _item.slug, 'item_id', _item.id,
      'semver', _ver.semver, 'payload_class', _ver.payload_class,
      'manifest_keys', (SELECT coalesce(jsonb_agg(k), '[]'::jsonb)
                          FROM jsonb_object_keys(_install_manifest) k),
      'changelog', _changelog,
      'set_as_current', true,
      'finance_warning', _finance_warning
    ),
    NULL
  );

  RETURN jsonb_build_object(
    'ok', true, 'item_slug', _item.slug,
    'version_id', _ver.id, 'semver', _ver.semver,
    'status', _ver.status, 'is_current', true,
    'finance_warning', _finance_warning
  );
END $function$;
REVOKE ALL ON FUNCTION public.marketplace_publish_version(text,text,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_publish_version(text,text,text,jsonb,text) TO authenticated, service_role;

-- ============================================================================
-- 3. marketplace_set_item_status — list / unlist / archive
--    L2: 'archived' is REVERSIBLE. This RPC accepts any of listed|unlisted|archived
--    as a target, so an archived item can be brought back to unlisted (and re-listed
--    once it has a published version). Archive is a shelf state, not a tombstone.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.marketplace_set_item_status(
  _item_slug text,
  _status    text
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _item public.marketplace_items%ROWTYPE;
  _cur  public.marketplace_item_versions%ROWTYPE;
  _old  text;
  _actor_role text;
BEGIN
  IF NOT (public._marketplace_operator_authorized()) THEN  -- M6
    RAISE EXCEPTION 'only the platform owner (or service_role) may change shelf status'
      USING ERRCODE = '42501';
  END IF;
  _actor_role := CASE WHEN public.is_platform_owner() THEN 'platform_owner' ELSE 'service_role' END;  -- ELSE reached only when _marketplace_is_service_role()

  IF _status NOT IN ('listed','unlisted','archived') THEN
    RAISE EXCEPTION 'invalid status %: expected listed|unlisted|archived', _status
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _item FROM public.marketplace_items WHERE slug = _item_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace item % not found', _item_slug USING ERRCODE = 'no_data_found';
  END IF;

  -- §11: never surface a broken card. Listing requires a real published version.
  IF _status = 'listed' THEN
    IF _item.current_version_id IS NULL THEN
      RAISE EXCEPTION 'cannot list item % — it has no published version yet; publish a version first', _item_slug
        USING ERRCODE = '22023';
    END IF;
    SELECT * INTO _cur FROM public.marketplace_item_versions WHERE id = _item.current_version_id;
    IF _cur.status <> 'published' THEN
      RAISE EXCEPTION 'cannot list item % — its current version (%) is not published', _item_slug, _cur.semver
        USING ERRCODE = '22023';
    END IF;
  END IF;

  _old := _item.status::text;
  UPDATE public.marketplace_items
     SET status = _status::public.marketplace_item_status, updated_at = now()
   WHERE id = _item.id
  RETURNING * INTO _item;

  INSERT INTO public.paige_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
  VALUES (
    auth.uid(), _actor_role, 'marketplace.item.status',
    'marketplace_item', _item.id,
    jsonb_build_object('item_slug', _item.slug, 'from', _old, 'to', _item.status),
    NULL
  );

  RETURN jsonb_build_object('ok', true, 'item_slug', _item.slug, 'from', _old, 'to', _item.status);
END $function$;
REVOKE ALL ON FUNCTION public.marketplace_set_item_status(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_set_item_status(text,text) TO authenticated, service_role;

-- ============================================================================
-- 4. marketplace_set_current_version — re-point current_version_id (rollback/promote)
--    L1: audit action is 'marketplace.version.set_current'.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.marketplace_set_current_version(
  _item_slug text,
  _semver    text
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _item public.marketplace_items%ROWTYPE;
  _ver  public.marketplace_item_versions%ROWTYPE;
  _old  uuid;
  _actor_role text;
BEGIN
  IF NOT (public._marketplace_operator_authorized()) THEN  -- M6
    RAISE EXCEPTION 'only the platform owner (or service_role) may re-point the current version'
      USING ERRCODE = '42501';
  END IF;
  _actor_role := CASE WHEN public.is_platform_owner() THEN 'platform_owner' ELSE 'service_role' END;  -- ELSE reached only when _marketplace_is_service_role()

  SELECT * INTO _item FROM public.marketplace_items WHERE slug = _item_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace item % not found', _item_slug USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO _ver FROM public.marketplace_item_versions
   WHERE item_id = _item.id AND semver = _semver;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item % has no version %', _item_slug, _semver USING ERRCODE = 'no_data_found';
  END IF;
  IF _ver.status <> 'published' THEN
    RAISE EXCEPTION 'version % of % is % — only a published version can be made current', _semver, _item_slug, _ver.status
      USING ERRCODE = '22023';
  END IF;
  IF _ver.payload_class = 'code' THEN
    RAISE EXCEPTION 'version % of % is a code payload and cannot be made current here (Phase-2 approval rail #218)', _semver, _item_slug
      USING ERRCODE = '42501';
  END IF;

  _old := _item.current_version_id;
  UPDATE public.marketplace_items
     SET current_version_id = _ver.id, updated_at = now()
   WHERE id = _item.id
  RETURNING * INTO _item;

  INSERT INTO public.paige_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
  VALUES (
    auth.uid(), _actor_role, 'marketplace.version.set_current',   -- L1
    'marketplace_item_version', _ver.id,
    jsonb_build_object(
      'item_slug', _item.slug, 'item_id', _item.id,
      'from_version_id', _old, 'to_version_id', _ver.id, 'to_semver', _ver.semver
    ),
    NULL
  );

  RETURN jsonb_build_object(
    'ok', true, 'item_slug', _item.slug,
    'from_version_id', _old, 'current_version_id', _ver.id, 'semver', _ver.semver
  );
END $function$;
REVOKE ALL ON FUNCTION public.marketplace_set_current_version(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_set_current_version(text,text) TO authenticated, service_role;

-- ============================================================================
-- 5. marketplace_set_featured — console curation toggle
-- ============================================================================
CREATE OR REPLACE FUNCTION public.marketplace_set_featured(
  _item_slug text,
  _on        boolean
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _item public.marketplace_items%ROWTYPE; _old boolean; _actor_role text;
BEGIN
  IF NOT (public._marketplace_operator_authorized()) THEN  -- M6
    RAISE EXCEPTION 'only the platform owner (or service_role) may feature an item' USING ERRCODE = '42501';
  END IF;
  _actor_role := CASE WHEN public.is_platform_owner() THEN 'platform_owner' ELSE 'service_role' END;  -- ELSE reached only when _marketplace_is_service_role()

  SELECT * INTO _item FROM public.marketplace_items WHERE slug = _item_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace item % not found', _item_slug USING ERRCODE = 'no_data_found';
  END IF;
  _old := _item.featured;
  UPDATE public.marketplace_items SET featured = coalesce(_on,false), updated_at = now()
   WHERE id = _item.id RETURNING * INTO _item;

  INSERT INTO public.paige_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
  VALUES (
    auth.uid(), _actor_role, 'marketplace.item.featured',
    'marketplace_item', _item.id,
    jsonb_build_object('item_slug', _item.slug, 'from', _old, 'to', _item.featured),
    NULL
  );

  RETURN jsonb_build_object('ok', true, 'item_slug', _item.slug, 'featured', _item.featured);
END $function$;
REVOKE ALL ON FUNCTION public.marketplace_set_featured(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_set_featured(text,boolean) TO authenticated, service_role;

-- ============================================================================
-- 6. marketplace_set_default_for_new_tenants — §9/§2 default-shelf toggle (M3, NEW)
--    The most §2-sensitive flag now has an AUDITED RPC. It leans on the LIVE finance
--    guards: the BEFORE trg_marketplace_item_guard blocks turning a finance/credit
--    item into a default, and the AFTER default-bundle recheck stays intact. No
--    silent direct UPDATE (which would write no audit row — §13).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.marketplace_set_default_for_new_tenants(
  _item_slug text,
  _on        boolean
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _item public.marketplace_items%ROWTYPE; _old boolean; _actor_role text;
BEGIN
  IF NOT (public._marketplace_operator_authorized()) THEN  -- M6
    RAISE EXCEPTION 'only the platform owner (or service_role) may set default-for-new-tenants' USING ERRCODE = '42501';
  END IF;
  _actor_role := CASE WHEN public.is_platform_owner() THEN 'platform_owner' ELSE 'service_role' END;  -- ELSE reached only when _marketplace_is_service_role()

  SELECT * INTO _item FROM public.marketplace_items WHERE slug = _item_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace item % not found', _item_slug USING ERRCODE = 'no_data_found';
  END IF;

  _old := _item.default_for_new_tenants;
  -- The §2 finance guard (trg_marketplace_item_guard, BEFORE UPDATE) fires here and
  -- will RAISE if this would make a finance/credit item a default. We do not weaken it.
  UPDATE public.marketplace_items
     SET default_for_new_tenants = coalesce(_on,false), updated_at = now()
   WHERE id = _item.id
  RETURNING * INTO _item;

  INSERT INTO public.paige_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
  VALUES (
    auth.uid(), _actor_role, 'marketplace.item.set_default',
    'marketplace_item', _item.id,
    jsonb_build_object('item_slug', _item.slug, 'from', _old, 'to', _item.default_for_new_tenants),
    NULL
  );

  RETURN jsonb_build_object('ok', true, 'item_slug', _item.slug,
                            'default_for_new_tenants', _item.default_for_new_tenants);
END $function$;
REVOKE ALL ON FUNCTION public.marketplace_set_default_for_new_tenants(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_set_default_for_new_tenants(text,boolean) TO authenticated, service_role;

-- ============================================================================
-- 7. marketplace_deprecate_version — retire a published version (M4, NEW)
--    A published version can be flipped to 'deprecated'. The CURRENT version cannot
--    be deprecated in place — set another published version current first (so the
--    card never points at a deprecated version, §11).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.marketplace_deprecate_version(
  _item_slug text,
  _semver    text
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _item public.marketplace_items%ROWTYPE;
  _ver  public.marketplace_item_versions%ROWTYPE;
  _actor_role text;
BEGIN
  IF NOT (public._marketplace_operator_authorized()) THEN  -- M6
    RAISE EXCEPTION 'only the platform owner (or service_role) may deprecate a version' USING ERRCODE = '42501';
  END IF;
  _actor_role := CASE WHEN public.is_platform_owner() THEN 'platform_owner' ELSE 'service_role' END;  -- ELSE reached only when _marketplace_is_service_role()

  SELECT * INTO _item FROM public.marketplace_items WHERE slug = _item_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace item % not found', _item_slug USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO _ver FROM public.marketplace_item_versions
   WHERE item_id = _item.id AND semver = _semver;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item % has no version %', _item_slug, _semver USING ERRCODE = 'no_data_found';
  END IF;
  IF _ver.status <> 'published' THEN
    RAISE EXCEPTION 'version % of % is % — only a published version can be deprecated', _semver, _item_slug, _ver.status
      USING ERRCODE = '22023';
  END IF;
  IF _ver.id = _item.current_version_id THEN
    RAISE EXCEPTION 'version % is the CURRENT version of %; point the item at another published version first (marketplace_set_current_version), then deprecate this one', _semver, _item_slug
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.marketplace_item_versions
     SET status = 'deprecated', deprecated_at = now()
   WHERE id = _ver.id
  RETURNING * INTO _ver;

  INSERT INTO public.paige_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
  VALUES (
    auth.uid(), _actor_role, 'marketplace.version.deprecate',
    'marketplace_item_version', _ver.id,
    jsonb_build_object('item_slug', _item.slug, 'item_id', _item.id,
                       'semver', _ver.semver, 'to_status', _ver.status),
    NULL
  );

  RETURN jsonb_build_object('ok', true, 'item_slug', _item.slug,
                            'semver', _ver.semver, 'status', _ver.status);
END $function$;
REVOKE ALL ON FUNCTION public.marketplace_deprecate_version(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_deprecate_version(text,text) TO authenticated, service_role;

-- ============================================================================
-- 8. marketplace_operator_catalog — the console's data source (operator-wide read)
--    M5: the ledger rollup no longer mislabels money. GROSS and platform fee are
--    computed from REVENUE events only (install + subscription_renewal); refunds are
--    surfaced separately (not netted); columns are named to their true semantics.
--    Sign convention: revenue events store positive gross/fee; refund events store a
--    positive gross magnitude, reported as refunds_cents (a downstream net is
--    revenue_gross_cents - refunds_cents). i.install_count is the distinct activation
--    counter and is returned separately from the ledger's paid revenue events.
-- ============================================================================
DROP FUNCTION IF EXISTS public.marketplace_operator_catalog();
CREATE OR REPLACE FUNCTION public.marketplace_operator_catalog()
 RETURNS TABLE (
   id uuid, slug text, item_type public.marketplace_item_type, name text, tagline text,
   category text, icon text, vendor_slug text, origin public.marketplace_origin,
   status public.marketplace_item_status, scope public.marketplace_scope,
   featured boolean, default_for_new_tenants boolean, is_finance boolean,
   pricing_model text, price_cents integer, billing_period text, take_rate_bps integer, serves text,
   install_count integer, rating_avg numeric, rating_count integer,
   current_version_id uuid, current_semver text,
   current_version_status public.marketplace_version_status,
   current_payload_class public.marketplace_payload_class,
   current_version_is_published boolean, version_count integer,
   revenue_gross_cents bigint, platform_fee_cents bigint, vendor_net_cents bigint,
   refunds_cents bigint, revenue_event_count bigint, paid_install_count bigint,
   created_at timestamptz, updated_at timestamptz
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public._marketplace_operator_authorized()) THEN  -- M6
    RAISE EXCEPTION 'only the platform owner (or service_role) may read the operator catalog'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    i.id, i.slug, i.item_type, i.name, i.tagline, i.category, i.icon,
    ve.slug AS vendor_slug, i.origin, i.status, i.scope,
    i.featured, i.default_for_new_tenants, i.is_finance,
    i.pricing_model, i.price_cents, i.billing_period, i.take_rate_bps, i.serves,
    i.install_count, i.rating_avg, i.rating_count,
    i.current_version_id, cv.semver AS current_semver,
    cv.status AS current_version_status, cv.payload_class AS current_payload_class,
    (cv.id IS NOT NULL AND cv.status = 'published') AS current_version_is_published,
    COALESCE(vc.n, 0)::integer AS version_count,
    -- Money, honestly labelled (M5):
    COALESCE(lg.revenue_gross_cents, 0)::bigint AS revenue_gross_cents,
    COALESCE(lg.platform_fee_cents, 0)::bigint  AS platform_fee_cents,
    COALESCE(lg.vendor_net_cents, 0)::bigint    AS vendor_net_cents,
    COALESCE(lg.refunds_cents, 0)::bigint        AS refunds_cents,
    COALESCE(lg.revenue_events, 0)::bigint       AS revenue_event_count,
    COALESCE(lg.paid_install_events, 0)::bigint  AS paid_install_count,
    i.created_at, i.updated_at
  FROM public.marketplace_items i
  JOIN public.marketplace_vendors ve ON ve.id = i.vendor_id
  LEFT JOIN public.marketplace_item_versions cv ON cv.id = i.current_version_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS n FROM public.marketplace_item_versions v WHERE v.item_id = i.id
  ) vc ON true
  LEFT JOIN LATERAL (
    SELECT
      -- GROSS/fee/net from REVENUE events ONLY — never install+renewal+uninstall+refund
      -- summed together and called "gross".
      sum(l.gross_cents)        FILTER (WHERE l.event_type IN ('install','subscription_renewal')) AS revenue_gross_cents,
      sum(l.platform_fee_cents) FILTER (WHERE l.event_type IN ('install','subscription_renewal')) AS platform_fee_cents,
      sum(l.vendor_net_cents)   FILTER (WHERE l.event_type IN ('install','subscription_renewal')) AS vendor_net_cents,
      -- Refunds surfaced on their own line (positive magnitude, not netted in above).
      sum(l.gross_cents)        FILTER (WHERE l.event_type = 'refund')                            AS refunds_cents,
      -- Counts are REVENUE-bearing only (gross>0): free first-party installs must
      -- not inflate a "paid installs" number to contradict $0 revenue (§13 honesty).
      count(*)                  FILTER (WHERE l.event_type IN ('install','subscription_renewal') AND l.gross_cents > 0) AS revenue_events,
      count(*)                  FILTER (WHERE l.event_type = 'install' AND l.gross_cents > 0)                           AS paid_install_events
    FROM public.marketplace_install_ledger l WHERE l.item_id = i.id
  ) lg ON true
  ORDER BY i.featured DESC, i.category, i.name;
END $function$;
REVOKE ALL ON FUNCTION public.marketplace_operator_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_operator_catalog() TO authenticated, service_role;

COMMIT;