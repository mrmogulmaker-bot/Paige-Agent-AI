-- Blueprints Slice 2 — tenant-aware client-journey WRITE model.
-- Non-destructive, backfilled, reversible (§12/§32). Slug becomes the source of
-- truth; the legacy integer FK (clients.journey_stage_id -> paige_journey_stages)
-- is KEPT ALIVE this slice and synced only for GLOBAL default slugs. A later
-- slice drops the int once every consumer is proven off it — dropping now is the
-- destructive move the doctrine forbids.
--
-- Runs AFTER 20260802150000 (the Blueprint installer that seeds a tenant's
-- business_coaching_* rows into public.tenant_journey_stages).
--
-- §9: every tenant resolution is server-derived (contact's tenant / actor tenant
-- / current_user_tenant_id) — never a caller-supplied body param.
-- §2: this migration adds NO finance content to any shipped-to-everyone default;
-- the finance-specific slugs already live in the global paige_journey_stages seed
-- (untouched here) and are superseded per-tenant by tenant_journey_stages.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) clients.journey_stage_slug — the new source of truth (nullable, additive).
-- ---------------------------------------------------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS journey_stage_slug text;

-- Backfill from the existing integer stage id via the global stage table so NO
-- live client loses their position. id->slug is total + lossless (verified: every
-- paige_journey_stages id 1..6 has a NOT-NULL UNIQUE slug; 0 orphaned clients).
UPDATE public.clients c
   SET journey_stage_slug = s.slug
  FROM public.paige_journey_stages s
 WHERE s.id = c.journey_stage_id
   AND c.journey_stage_id IS NOT NULL
   AND c.journey_stage_slug IS NULL;

-- Tenant-scoped funnel reads (§17 growth map) key off (tenant, slug).
CREATE INDEX IF NOT EXISTS clients_journey_stage_slug_idx
  ON public.clients (tenant_id, journey_stage_slug);

-- ---------------------------------------------------------------------------
-- 2) paige_journey_stage_transitions — record slugs; keep int columns as legacy.
--    to_stage_id must become nullable: a tenant-only slug has no global int id.
-- ---------------------------------------------------------------------------
ALTER TABLE public.paige_journey_stage_transitions
  ADD COLUMN IF NOT EXISTS from_stage_slug text,
  ADD COLUMN IF NOT EXISTS to_stage_slug   text;

ALTER TABLE public.paige_journey_stage_transitions
  ALTER COLUMN to_stage_id DROP NOT NULL;

-- Backfill transition slugs from the legacy int ids (0 existing rows today, so
-- trivially lossless; written idempotently for safety).
UPDATE public.paige_journey_stage_transitions t
   SET to_stage_slug = ts.slug
  FROM public.paige_journey_stages ts
 WHERE ts.id = t.to_stage_id
   AND t.to_stage_id IS NOT NULL
   AND t.to_stage_slug IS NULL;

UPDATE public.paige_journey_stage_transitions t
   SET from_stage_slug = fs.slug
  FROM public.paige_journey_stages fs
 WHERE fs.id = t.from_stage_id
   AND t.from_stage_id IS NOT NULL
   AND t.from_stage_slug IS NULL;

-- ---------------------------------------------------------------------------
-- 3) get_tenant_journey_stages(_tenant) — the ONE read seam (§18).
--    Tenant-authored journey (tenant_journey_stages) REPLACES the platform
--    default set when the tenant has installed one; otherwise the global
--    paige_journey_stages default. Returns the legacy global int id per row
--    (stage_id_global, null for tenant-only slugs) so callers can sync/fall back.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tenant_journey_stages(_tenant uuid DEFAULT NULL)
RETURNS TABLE (
  slug            text,
  label           text,
  description     text,
  display_order   integer,
  color_hex       text,
  is_tenant       boolean,
  stage_id_global integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  _eff uuid;
BEGIN
  -- §9 tenant resolution. JWT callers may read ONLY their own tenant; the arg is
  -- ignored for them (server-derived). Service-role/headless callers pass the
  -- already-resolved contact/actor tenant. Platform owners may target any tenant.
  IF auth.role() = 'service_role' THEN
    _eff := _tenant;
  ELSIF public.is_platform_owner() THEN
    _eff := COALESCE(_tenant, public.current_user_tenant_id());
  ELSE
    _eff := public.current_user_tenant_id();
    IF _tenant IS NOT NULL AND _tenant <> _eff THEN
      RAISE EXCEPTION 'Cross-tenant journey read denied';
    END IF;
  END IF;

  RETURN QUERY
  -- Tenant-authored journey (wholesale replacement when present).
  SELECT t.slug, t.label, t.description, t.display_order, t.color_hex,
         true AS is_tenant, g.id AS stage_id_global
    FROM public.tenant_journey_stages t
    LEFT JOIN public.paige_journey_stages g ON g.slug = t.slug
   WHERE t.tenant_id = _eff
  UNION ALL
  -- Platform default set — only when this tenant has authored none.
  SELECT g.slug, g.label, g.description, g.display_order, g.color_hex,
         false AS is_tenant, g.id AS stage_id_global
    FROM public.paige_journey_stages g
   WHERE _eff IS NULL
      OR NOT EXISTS (
           SELECT 1 FROM public.tenant_journey_stages t2 WHERE t2.tenant_id = _eff
         )
  ORDER BY 4;  -- display_order (positional; avoids OUT-param name ambiguity)
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_journey_stages(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_journey_stages(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) set_journey_stage — tenant-aware write. Same signature (uuid,text,text) so
--    every producer (ClientJourney.setStage, paige-mcp advance) is unbroken.
--    Slug in; validates against contact-tenant stages OR global; writes the slug
--    (source of truth) + syncs the int only for global defaults; logs slugs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_journey_stage(
  _contact_id uuid,
  _stage_slug text,
  _source_event text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tenant       uuid;
  _to_global_id integer;
  _tenant_has   boolean := false;
  _from_id      integer;
  _from_slug    text;
  _is_staff     boolean := false;
BEGIN
  -- Auth unchanged from Slice 1: staff (admin/coach) or service_role only.
  IF auth.uid() IS NOT NULL THEN
    _is_staff := public.has_role(auth.uid(), 'admin'::public.app_role)
              OR public.has_role(auth.uid(), 'coach'::public.app_role);
  END IF;
  IF NOT _is_staff AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- §9: tenant is derived from the CONTACT, never a caller-supplied param.
  SELECT tenant_id, journey_stage_id, journey_stage_slug
    INTO _tenant, _from_id, _from_slug
    FROM public.clients
   WHERE id = _contact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown contact: %', _contact_id;
  END IF;

  -- §9 IDOR guard (closes a pre-existing gap now that we hold the contact's
  -- tenant): a JWT staff caller may only move a contact inside their OWN tenant.
  -- service_role (Paige, already actor-authorized) and platform owners bypass.
  IF auth.role() <> 'service_role' AND NOT public.is_platform_owner() THEN
    IF _tenant IS DISTINCT FROM public.current_user_tenant_id() THEN
      RAISE EXCEPTION 'Cross-tenant journey write denied';
    END IF;
  END IF;

  -- Validate the slug in EITHER the contact-tenant's authored stages OR global.
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_journey_stages
     WHERE tenant_id = _tenant AND slug = _stage_slug
  ) INTO _tenant_has;

  SELECT id INTO _to_global_id
    FROM public.paige_journey_stages
   WHERE slug = _stage_slug;

  IF NOT _tenant_has AND _to_global_id IS NULL THEN
    RAISE EXCEPTION 'Unknown journey stage: %', _stage_slug;
  END IF;

  -- No-op if already on this slug.
  IF _from_slug IS NOT DISTINCT FROM _stage_slug THEN
    RETURN jsonb_build_object('ok', true, 'unchanged', true,
      'stage_slug', _stage_slug, 'stage_id', _to_global_id);
  END IF;

  -- Slug is source of truth; keep the legacy int FK synced ONLY for global
  -- defaults (NULL for tenant-authored slugs — the int FK can't hold a uuid).
  UPDATE public.clients
     SET journey_stage_slug     = _stage_slug,
         journey_stage_id       = _to_global_id,
         journey_stage_entered_at = now()
   WHERE id = _contact_id;

  INSERT INTO public.paige_journey_stage_transitions
    (contact_id, from_stage_id, to_stage_id, from_stage_slug, to_stage_slug,
     transitioned_by, source_event)
  VALUES
    (_contact_id, _from_id, _to_global_id, _from_slug, _stage_slug,
     auth.uid(), COALESCE(_source_event, 'manual'));

  RETURN jsonb_build_object('ok', true,
    'from_stage_slug', _from_slug, 'to_stage_slug', _stage_slug,
    'from_stage_id', _from_id, 'to_stage_id', _to_global_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_journey_stage(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_journey_stage(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) auto_advance_journey_on_tier — the hidden second writer (trigger on
--    tier_state). Rewritten off the hardcoded integer 3 onto slug 'paid_tier',
--    writing the slug (source of truth) + syncing the int, logging slugs, and
--    tolerating tenant-authored journeys (degrades gracefully if no paid_tier
--    default exists). Ordering uses display_order; for the 6 global seeds
--    id===display_order, so this preserves the original `< 3` semantics exactly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_advance_journey_on_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _client_id     uuid;
  _current_id    integer;
  _current_slug  text;
  _client_tenant uuid;
  _new_tier      text;
  _paid_id       integer;
  _paid_order    integer;
  _current_order integer;
BEGIN
  _new_tier := lower(COALESCE(NEW.tier, ''));
  IF _new_tier NOT IN ('standard','premium','vip') THEN
    RETURN NEW;
  END IF;

  SELECT id, journey_stage_id, journey_stage_slug, tenant_id
    INTO _client_id, _current_id, _current_slug, _client_tenant
    FROM public.clients
   WHERE linked_user_id = NEW.user_id
   ORDER BY created_at ASC
   LIMIT 1;

  IF _client_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- §2 tenant-safety: the funding-tier -> 'paid_tier' auto-advance is a legacy
  -- behavior of the GLOBAL default journey only. A tenant that authored its own
  -- journey (installed a Blueprint) owns its pipeline — never yank its client
  -- into the global finance 'paid_tier' stage. Skip auto-advance for them.
  IF EXISTS (
    SELECT 1 FROM public.tenant_journey_stages
     WHERE tenant_id = _client_tenant
  ) THEN
    RETURN NEW;
  END IF;

  -- Resolve the global 'paid_tier' default. If absent (a tenant-only journey
  -- with no paid_tier), there is nothing to advance to — degrade gracefully.
  SELECT id, display_order INTO _paid_id, _paid_order
    FROM public.paige_journey_stages
   WHERE slug = 'paid_tier';
  IF _paid_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Current rank: by slug's global display_order when resolvable, else the
  -- legacy int id (un-migrated rows). id===display_order for the global seeds.
  SELECT display_order INTO _current_order
    FROM public.paige_journey_stages
   WHERE slug = _current_slug;
  IF _current_order IS NULL THEN
    _current_order := COALESCE(_current_id, 0);
  END IF;

  IF _current_slug IS DISTINCT FROM 'paid_tier'
     AND COALESCE(_current_order, 0) < _paid_order THEN
    UPDATE public.clients
       SET journey_stage_slug     = 'paid_tier',
           journey_stage_id       = _paid_id,
           journey_stage_entered_at = now()
     WHERE id = _client_id;

    INSERT INTO public.paige_journey_stage_transitions
      (contact_id, from_stage_id, to_stage_id, from_stage_slug, to_stage_slug,
       source_event, metadata)
    VALUES
      (_client_id, _current_id, _paid_id, _current_slug, 'paid_tier',
       'tier_upgrade', jsonb_build_object('tier', _new_tier));
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'auto_advance_journey_on_tier failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

COMMIT;
