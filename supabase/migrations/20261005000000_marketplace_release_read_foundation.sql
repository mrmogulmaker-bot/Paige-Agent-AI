-- Marketplace Phase 1A: immutable reviewed-release proof + tenant-safe reads.
--
-- This extends marketplace_item_versions, the existing release/version authority.
-- It adds no installer, entitlement, checkout, Action Bus kind, Rail event, Trust
-- policy, Capabilities handoff, provider call, or PAIGE mutation path.
--
-- Account-context boundary: these authenticated reads derive actor and active tenant
-- in the database. They deliberately DO NOT define or accept an "account epoch";
-- that shared advancing contract remains separately owned. Short-lived opaque read
-- references fail closed after an active-tenant change, release lifecycle change,
-- proof drift, expiry, or loss of catalogue eligibility.

BEGIN;

ALTER TYPE public.marketplace_version_status ADD VALUE IF NOT EXISTS 'suspended';
ALTER TYPE public.marketplace_version_status ADD VALUE IF NOT EXISTS 'revoked';
ALTER TYPE public.marketplace_version_status ADD VALUE IF NOT EXISTS 'retired';

ALTER TABLE public.marketplace_item_versions
  ADD COLUMN IF NOT EXISTS publisher_vendor_id uuid REFERENCES public.marketplace_vendors(id),
  ADD COLUMN IF NOT EXISTS identity_digest_sha256 text,
  ADD COLUMN IF NOT EXISTS artifact_digest_sha256 text,
  ADD COLUMN IF NOT EXISTS manifest_digest_sha256 text,
  ADD COLUMN IF NOT EXISTS capability_declaration_digest_sha256 text,
  ADD COLUMN IF NOT EXISTS review_bundle_digest_sha256 text,
  ADD COLUMN IF NOT EXISTS risk_class text,
  ADD COLUMN IF NOT EXISTS capability_reads text[],
  ADD COLUMN IF NOT EXISTS capability_preparations text[],
  ADD COLUMN IF NOT EXISTS capability_runtime_operations text[],
  ADD COLUMN IF NOT EXISTS capability_external_calls text[],
  ADD COLUMN IF NOT EXISTS configuration_requirements text[],
  ADD COLUMN IF NOT EXISTS capability_prohibited text[],
  ADD COLUMN IF NOT EXISTS capability_default_deny boolean,
  ADD COLUMN IF NOT EXISTS supported_tiers text[],
  ADD COLUMN IF NOT EXISTS installable_roles text[],
  ADD COLUMN IF NOT EXISTS release_scope public.marketplace_scope,
  ADD COLUMN IF NOT EXISTS release_visible_to_tenant_id uuid REFERENCES public.tenants(id),
  ADD COLUMN IF NOT EXISTS release_visible_to_agency_id uuid REFERENCES public.tenants(id),
  ADD COLUMN IF NOT EXISTS authorized_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS authorized_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketplace_release_risk_class_ck'
      AND conrelid = 'public.marketplace_item_versions'::regclass
  ) THEN
    ALTER TABLE public.marketplace_item_versions
      ADD CONSTRAINT marketplace_release_risk_class_ck CHECK (
        risk_class IS NULL OR risk_class IN (
          'content_template', 'read_only_data_snapshot', 'workflow',
          'write_capable_automation', 'connector', 'executable_tool'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketplace_release_digest_ck'
      AND conrelid = 'public.marketplace_item_versions'::regclass
  ) THEN
    ALTER TABLE public.marketplace_item_versions
      ADD CONSTRAINT marketplace_release_digest_ck CHECK (
        (identity_digest_sha256 IS NULL OR identity_digest_sha256 ~ '^[0-9a-f]{64}$')
        AND (artifact_digest_sha256 IS NULL OR artifact_digest_sha256 ~ '^[0-9a-f]{64}$')
        AND (manifest_digest_sha256 IS NULL OR manifest_digest_sha256 ~ '^[0-9a-f]{64}$')
        AND (capability_declaration_digest_sha256 IS NULL OR capability_declaration_digest_sha256 ~ '^[0-9a-f]{64}$')
        AND (review_bundle_digest_sha256 IS NULL OR review_bundle_digest_sha256 ~ '^[0-9a-f]{64}$')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketplace_release_scope_ck'
      AND conrelid = 'public.marketplace_item_versions'::regclass
  ) THEN
    ALTER TABLE public.marketplace_item_versions
      ADD CONSTRAINT marketplace_release_scope_ck CHECK (
        release_scope IS NULL OR
        (release_scope = 'public' AND release_visible_to_tenant_id IS NULL AND release_visible_to_agency_id IS NULL) OR
        (release_scope = 'tenant' AND release_visible_to_tenant_id IS NOT NULL AND release_visible_to_agency_id IS NULL) OR
        (release_scope = 'agency' AND release_visible_to_agency_id IS NOT NULL AND release_visible_to_tenant_id IS NULL)
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.marketplace_release_lifecycle_events (
  event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES public.marketplace_item_versions(id) ON DELETE RESTRICT,
  from_state text,
  to_state text NOT NULL CHECK (to_state IN ('published','suspended','revoked','retired','rollback_selected')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9_.:-]{0,95}$'),
  replacement_release_id uuid REFERENCES public.marketplace_item_versions(id) ON DELETE RESTRICT,
  recorded_by uuid REFERENCES auth.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((to_state = 'rollback_selected') = (replacement_release_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS marketplace_release_lifecycle_release_idx
  ON public.marketplace_release_lifecycle_events (release_id, event_sequence DESC);

CREATE TABLE IF NOT EXISTS public.marketplace_release_read_references (
  token_digest text PRIMARY KEY CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  release_id uuid NOT NULL REFERENCES public.marketplace_item_versions(id) ON DELETE CASCADE,
  lifecycle_event_id uuid NOT NULL REFERENCES public.marketplace_release_lifecycle_events(id) ON DELETE CASCADE,
  catalogue_revision uuid NOT NULL,
  review_bundle_digest_sha256 text NOT NULL CHECK (review_bundle_digest_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS marketplace_release_read_refs_actor_idx
  ON public.marketplace_release_read_references (actor_user_id, tenant_id, expires_at);

ALTER TABLE public.marketplace_release_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_release_read_references ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.marketplace_item_versions FROM anon, authenticated;
REVOKE ALL ON public.marketplace_release_lifecycle_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.marketplace_release_read_references FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._marketplace_safe_scope_tokens(_tokens text[])
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path TO 'pg_catalog'
AS $$
  SELECT _tokens IS NOT NULL
     AND COALESCE(array_length(_tokens, 1), 0) <= 64
     AND NOT EXISTS (
       SELECT 1 FROM unnest(_tokens) token
       WHERE token IS NULL OR token !~ '^[a-z][a-z0-9_.:-]{0,95}$'
     );
$$;
REVOKE ALL ON FUNCTION public._marketplace_safe_scope_tokens(text[]) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._marketplace_release_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  _proof_requested boolean;
  _item public.marketplace_items%ROWTYPE;
  _publisher public.marketplace_vendors%ROWTYPE;
  _declaration jsonb;
  _computed_identity text;
  _computed_manifest text;
  _computed_declaration text;
  _computed_bundle text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.review_bundle_digest_sha256 IS NOT NULL THEN
      RAISE EXCEPTION 'MARKETPLACE_RELEASE_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.review_bundle_digest_sha256 IS NOT NULL THEN
    IF NEW.item_id IS DISTINCT FROM OLD.item_id
       OR NEW.semver IS DISTINCT FROM OLD.semver
       OR NEW.payload_class IS DISTINCT FROM OLD.payload_class
       OR NEW.install_manifest IS DISTINCT FROM OLD.install_manifest
       OR NEW.code_ref IS DISTINCT FROM OLD.code_ref
       OR NEW.changelog IS DISTINCT FROM OLD.changelog
       OR NEW.publisher_vendor_id IS DISTINCT FROM OLD.publisher_vendor_id
       OR NEW.identity_digest_sha256 IS DISTINCT FROM OLD.identity_digest_sha256
       OR NEW.artifact_digest_sha256 IS DISTINCT FROM OLD.artifact_digest_sha256
       OR NEW.manifest_digest_sha256 IS DISTINCT FROM OLD.manifest_digest_sha256
       OR NEW.capability_declaration_digest_sha256 IS DISTINCT FROM OLD.capability_declaration_digest_sha256
       OR NEW.review_bundle_digest_sha256 IS DISTINCT FROM OLD.review_bundle_digest_sha256
       OR NEW.risk_class IS DISTINCT FROM OLD.risk_class
       OR NEW.capability_reads IS DISTINCT FROM OLD.capability_reads
       OR NEW.capability_preparations IS DISTINCT FROM OLD.capability_preparations
       OR NEW.capability_runtime_operations IS DISTINCT FROM OLD.capability_runtime_operations
       OR NEW.capability_external_calls IS DISTINCT FROM OLD.capability_external_calls
       OR NEW.configuration_requirements IS DISTINCT FROM OLD.configuration_requirements
       OR NEW.capability_prohibited IS DISTINCT FROM OLD.capability_prohibited
       OR NEW.capability_default_deny IS DISTINCT FROM OLD.capability_default_deny
       OR NEW.supported_tiers IS DISTINCT FROM OLD.supported_tiers
       OR NEW.installable_roles IS DISTINCT FROM OLD.installable_roles
       OR NEW.release_scope IS DISTINCT FROM OLD.release_scope
       OR NEW.release_visible_to_tenant_id IS DISTINCT FROM OLD.release_visible_to_tenant_id
       OR NEW.release_visible_to_agency_id IS DISTINCT FROM OLD.release_visible_to_agency_id
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.authorized_by IS DISTINCT FROM OLD.authorized_by
       OR NEW.authorized_at IS DISTINCT FROM OLD.authorized_at THEN
      RAISE EXCEPTION 'MARKETPLACE_RELEASE_IMMUTABLE' USING ERRCODE = '55000';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT public._marketplace_operator_authorized() THEN
        RAISE EXCEPTION 'MARKETPLACE_RELEASE_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
      END IF;
      IF NOT (
        (OLD.status::text = 'approved' AND NEW.status::text = 'published') OR
        (OLD.status::text = 'published' AND NEW.status::text IN ('suspended','revoked','retired')) OR
        (OLD.status::text = 'suspended' AND NEW.status::text IN ('published','revoked','retired')) OR
        (OLD.status::text = 'revoked' AND NEW.status::text = 'retired')
      ) THEN
        RAISE EXCEPTION 'MARKETPLACE_RELEASE_INVALID_TRANSITION' USING ERRCODE = '22023';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  _proof_requested := NEW.publisher_vendor_id IS NOT NULL
    OR NEW.artifact_digest_sha256 IS NOT NULL
    OR NEW.risk_class IS NOT NULL
    OR NEW.capability_reads IS NOT NULL
    OR NEW.capability_preparations IS NOT NULL
    OR NEW.capability_runtime_operations IS NOT NULL
    OR NEW.capability_default_deny IS NOT NULL
    OR NEW.supported_tiers IS NOT NULL
    OR NEW.installable_roles IS NOT NULL
    OR NEW.release_scope IS NOT NULL
    OR NEW.authorized_by IS NOT NULL
    OR NEW.authorized_at IS NOT NULL;

  IF NOT _proof_requested THEN
    RETURN NEW;
  END IF;

  IF NOT public._marketplace_operator_authorized() THEN
    RAISE EXCEPTION 'MARKETPLACE_RELEASE_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _item FROM public.marketplace_items WHERE id = NEW.item_id;
  IF NOT FOUND OR NEW.publisher_vendor_id IS DISTINCT FROM _item.vendor_id THEN
    RAISE EXCEPTION 'MARKETPLACE_RELEASE_IDENTITY_MISMATCH' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _publisher FROM public.marketplace_vendors WHERE id = NEW.publisher_vendor_id;
  IF NOT FOUND OR _publisher.status <> 'verified' OR _publisher.origin IS DISTINCT FROM _item.origin THEN
    RAISE EXCEPTION 'MARKETPLACE_RELEASE_PUBLISHER_UNVERIFIED' USING ERRCODE = '22023';
  END IF;

  IF NEW.artifact_digest_sha256 IS NULL
     OR NEW.artifact_digest_sha256 !~ '^[0-9a-f]{64}$'
     OR NEW.risk_class IS NULL
     OR NEW.reviewed_by IS NULL OR NEW.approved_at IS NULL
     OR NEW.authorized_by IS NULL OR NEW.authorized_at IS NULL
     OR NEW.capability_default_deny IS DISTINCT FROM true
     OR NOT public._marketplace_safe_scope_tokens(NEW.capability_reads)
     OR NOT public._marketplace_safe_scope_tokens(NEW.capability_preparations)
     OR NOT public._marketplace_safe_scope_tokens(NEW.capability_runtime_operations)
     OR NOT public._marketplace_safe_scope_tokens(NEW.capability_external_calls)
     OR NOT public._marketplace_safe_scope_tokens(NEW.configuration_requirements)
     OR NOT public._marketplace_safe_scope_tokens(NEW.capability_prohibited)
     OR NEW.supported_tiers IS NULL
     OR NEW.installable_roles IS NULL
     OR NEW.release_scope IS NULL THEN
    RAISE EXCEPTION 'MARKETPLACE_RELEASE_PROOF_INCOMPLETE' USING ERRCODE = '23514';
  END IF;

  IF to_jsonb(NEW.supported_tiers) IS DISTINCT FROM _item.available_to_tiers
     OR to_jsonb(NEW.installable_roles) IS DISTINCT FROM _item.installable_by_role
     OR NEW.release_scope IS DISTINCT FROM _item.scope
     OR NEW.release_visible_to_tenant_id IS DISTINCT FROM _item.visible_to_tenant_id
     OR NEW.release_visible_to_agency_id IS DISTINCT FROM _item.visible_to_agency_id THEN
    RAISE EXCEPTION 'MARKETPLACE_RELEASE_ELIGIBILITY_MISMATCH' USING ERRCODE = '22023';
  END IF;

  _declaration := jsonb_build_object(
    'reads', to_jsonb(NEW.capability_reads),
    'preparations', to_jsonb(NEW.capability_preparations),
    'runtime_operations', to_jsonb(NEW.capability_runtime_operations),
    'external_calls', to_jsonb(NEW.capability_external_calls),
    'configuration_requirements', to_jsonb(NEW.configuration_requirements),
    'prohibited', to_jsonb(NEW.capability_prohibited),
    'default_deny', true
  );
  _computed_identity := encode(extensions.digest(convert_to(
    concat_ws('|', _item.id::text, _item.slug, _item.item_type::text, _item.name,
      _item.category, COALESCE(_item.icon, ''), _item.vendor_id::text,
      _item.origin::text, _publisher.origin::text), 'UTF8'), 'sha256'), 'hex');
  _computed_manifest := encode(extensions.digest(convert_to(NEW.install_manifest::text, 'UTF8'), 'sha256'), 'hex');
  _computed_declaration := encode(extensions.digest(convert_to(_declaration::text, 'UTF8'), 'sha256'), 'hex');
  _computed_bundle := encode(extensions.digest(convert_to(
    concat_ws('|', NEW.id::text, NEW.item_id::text, NEW.semver, NEW.publisher_vendor_id::text,
      _computed_identity, NEW.artifact_digest_sha256, _computed_manifest, _computed_declaration, NEW.risk_class,
      NEW.reviewed_by::text, NEW.approved_at::text, NEW.authorized_by::text, NEW.authorized_at::text,
      NEW.release_scope::text, COALESCE(NEW.release_visible_to_tenant_id::text,''),
      COALESCE(NEW.release_visible_to_agency_id::text,''), to_jsonb(NEW.supported_tiers)::text,
      to_jsonb(NEW.installable_roles)::text), 'UTF8'), 'sha256'), 'hex');

  NEW.identity_digest_sha256 := _computed_identity;
  NEW.manifest_digest_sha256 := _computed_manifest;
  NEW.capability_declaration_digest_sha256 := _computed_declaration;
  NEW.review_bundle_digest_sha256 := _computed_bundle;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public._marketplace_release_guard() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS marketplace_release_guard ON public.marketplace_item_versions;
CREATE TRIGGER marketplace_release_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.marketplace_item_versions
  FOR EACH ROW EXECUTE FUNCTION public._marketplace_release_guard();

CREATE OR REPLACE FUNCTION public._marketplace_release_record_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _from text;
BEGIN
  IF NEW.review_bundle_digest_sha256 IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    _from := NULL;
  ELSIF OLD.review_bundle_digest_sha256 IS NULL THEN
    _from := NULL;
  ELSIF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  ELSE
    _from := OLD.status::text;
  END IF;

  IF NEW.status::text IN ('published','suspended','revoked','retired') THEN
    INSERT INTO public.marketplace_release_lifecycle_events
      (release_id, from_state, to_state, reason_code, recorded_by)
    VALUES
      (NEW.id, _from, NEW.status::text, 'release_' || NEW.status::text,
       COALESCE((SELECT auth.uid()), NEW.authorized_by));
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public._marketplace_release_record_lifecycle() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS marketplace_release_record_lifecycle ON public.marketplace_item_versions;
CREATE TRIGGER marketplace_release_record_lifecycle
  AFTER INSERT OR UPDATE ON public.marketplace_item_versions
  FOR EACH ROW EXECUTE FUNCTION public._marketplace_release_record_lifecycle();

CREATE OR REPLACE FUNCTION public._marketplace_release_history_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  RAISE EXCEPTION 'MARKETPLACE_RELEASE_HISTORY_IMMUTABLE' USING ERRCODE = '55000';
END
$function$;
REVOKE ALL ON FUNCTION public._marketplace_release_history_immutable() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS marketplace_release_history_immutable ON public.marketplace_release_lifecycle_events;
CREATE TRIGGER marketplace_release_history_immutable
  BEFORE UPDATE OR DELETE ON public.marketplace_release_lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION public._marketplace_release_history_immutable();

CREATE OR REPLACE FUNCTION public._marketplace_release_eligible(
  _release_id uuid,
  _tenant_id uuid,
  _actor_user_id uuid
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.marketplace_item_versions v
    JOIN public.marketplace_items i ON i.id = v.item_id AND i.current_version_id = v.id
    JOIN public.marketplace_vendors publisher ON publisher.id = v.publisher_vendor_id
    JOIN LATERAL (
      SELECT e.id, e.to_state
      FROM public.marketplace_release_lifecycle_events e
      WHERE e.release_id = v.id
      ORDER BY e.event_sequence DESC
      LIMIT 1
    ) lifecycle ON lifecycle.to_state = 'published'
    JOIN LATERAL public.marketplace_catalog_for_tenant(_tenant_id) catalogue ON catalogue.slug = i.slug
    WHERE v.id = _release_id
      AND _actor_user_id = (SELECT auth.uid())
      AND _tenant_id = public.current_user_tenant_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = _actor_user_id AND p.active_tenant_id = _tenant_id
      )
      AND i.status::text = 'listed'
      AND i.publish_status = 'approved'
      AND v.status::text = 'published'
      AND v.review_bundle_digest_sha256 IS NOT NULL
      AND v.identity_digest_sha256 = encode(extensions.digest(convert_to(
        concat_ws('|', i.id::text, i.slug, i.item_type::text, i.name, i.category,
          COALESCE(i.icon, ''), i.vendor_id::text, i.origin::text, publisher.origin::text),
        'UTF8'), 'sha256'), 'hex')
      AND v.manifest_digest_sha256 IS NOT NULL
      AND v.capability_declaration_digest_sha256 IS NOT NULL
      AND v.capability_default_deny = true
      AND publisher.status = 'verified'
      AND v.publisher_vendor_id = i.vendor_id
      AND to_jsonb(v.supported_tiers) = i.available_to_tiers
      AND to_jsonb(v.installable_roles) = i.installable_by_role
      AND v.release_scope = i.scope
      AND v.release_visible_to_tenant_id IS NOT DISTINCT FROM i.visible_to_tenant_id
      AND v.release_visible_to_agency_id IS NOT DISTINCT FROM i.visible_to_agency_id
  );
$function$;
REVOKE ALL ON FUNCTION public._marketplace_release_eligible(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.marketplace_release_catalog()
RETURNS TABLE (
  capability_ref text,
  catalogue_revision uuid,
  expires_at timestamptz,
  item_slug text,
  item_type public.marketplace_item_type,
  item_name text,
  category text,
  icon text,
  release_id uuid,
  release_version text,
  publisher_id uuid,
  publisher_class text,
  risk_class text,
  capability_proof_state text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  _actor uuid := (SELECT auth.uid());
  _tenant uuid;
  _revision uuid := gen_random_uuid();
  _row record;
  _token text;
  _expires timestamptz := now() + interval '15 minutes';
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'MARKETPLACE_CATALOGUE_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;
  SELECT p.active_tenant_id INTO _tenant FROM public.profiles p WHERE p.user_id = _actor;
  IF _tenant IS NULL OR public.current_user_tenant_id() IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'MARKETPLACE_CATALOGUE_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;

  FOR _row IN
    SELECT v.id AS release_id, v.semver, v.risk_class, v.review_bundle_digest_sha256,
           i.slug, i.item_type, i.name, i.category, i.icon,
           publisher.id AS publisher_id, publisher.origin,
           lifecycle.id AS lifecycle_event_id
    FROM public.marketplace_item_versions v
    JOIN public.marketplace_items i ON i.id = v.item_id
    JOIN public.marketplace_vendors publisher ON publisher.id = v.publisher_vendor_id
    JOIN LATERAL (
      SELECT e.id FROM public.marketplace_release_lifecycle_events e
      WHERE e.release_id = v.id ORDER BY e.event_sequence DESC LIMIT 1
    ) lifecycle ON true
    WHERE public._marketplace_release_eligible(v.id, _tenant, _actor)
    ORDER BY i.category, i.name, v.semver
  LOOP
    _token := 'mktrel_v1_' || encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO public.marketplace_release_read_references
      (token_digest, actor_user_id, tenant_id, release_id, lifecycle_event_id,
       catalogue_revision, review_bundle_digest_sha256, expires_at)
    VALUES
      (encode(extensions.digest(convert_to(_token, 'UTF8'), 'sha256'), 'hex'),
       _actor, _tenant, _row.release_id, _row.lifecycle_event_id,
       _revision, _row.review_bundle_digest_sha256, _expires);

    capability_ref := _token;
    catalogue_revision := _revision;
    expires_at := _expires;
    item_slug := _row.slug;
    item_type := _row.item_type;
    item_name := _row.name;
    category := _row.category;
    icon := _row.icon;
    release_id := _row.release_id;
    release_version := _row.semver;
    publisher_id := _row.publisher_id;
    publisher_class := CASE WHEN _row.origin = 'first_party' THEN 'PAIGE_FIRST_PARTY' ELSE 'VERIFIED_CREATOR' END;
    risk_class := _row.risk_class;
    capability_proof_state := 'LIVE';
    RETURN NEXT;
  END LOOP;
END
$function$;
REVOKE ALL ON FUNCTION public.marketplace_release_catalog() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.marketplace_release_catalog() TO authenticated;

CREATE OR REPLACE FUNCTION public.marketplace_release_detail(_capability_ref text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  _actor uuid := (SELECT auth.uid());
  _tenant uuid;
  _ref public.marketplace_release_read_references%ROWTYPE;
  _release public.marketplace_item_versions%ROWTYPE;
  _item public.marketplace_items%ROWTYPE;
  _publisher public.marketplace_vendors%ROWTYPE;
  _latest_event uuid;
  _history jsonb;
BEGIN
  IF _actor IS NULL OR _capability_ref IS NULL OR _capability_ref !~ '^mktrel_v1_[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'MARKETPLACE_CAPABILITY_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;
  SELECT p.active_tenant_id INTO _tenant FROM public.profiles p WHERE p.user_id = _actor;
  IF _tenant IS NULL OR public.current_user_tenant_id() IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'MARKETPLACE_CAPABILITY_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _ref
  FROM public.marketplace_release_read_references r
  WHERE r.token_digest = encode(extensions.digest(convert_to(_capability_ref, 'UTF8'), 'sha256'), 'hex')
    AND r.actor_user_id = _actor
    AND r.tenant_id = _tenant
    AND r.expires_at > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MARKETPLACE_CAPABILITY_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;

  SELECT e.id INTO _latest_event
  FROM public.marketplace_release_lifecycle_events e
  WHERE e.release_id = _ref.release_id
  ORDER BY e.event_sequence DESC LIMIT 1;
  IF _latest_event IS DISTINCT FROM _ref.lifecycle_event_id
     OR NOT public._marketplace_release_eligible(_ref.release_id, _tenant, _actor) THEN
    RAISE EXCEPTION 'MARKETPLACE_CAPABILITY_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _release FROM public.marketplace_item_versions WHERE id = _ref.release_id;
  IF _release.review_bundle_digest_sha256 IS DISTINCT FROM _ref.review_bundle_digest_sha256 THEN
    RAISE EXCEPTION 'MARKETPLACE_CAPABILITY_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _item FROM public.marketplace_items WHERE id = _release.item_id;
  SELECT * INTO _publisher FROM public.marketplace_vendors WHERE id = _release.publisher_vendor_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'state', e.to_state, 'reason_code', e.reason_code, 'occurred_at', e.occurred_at
    ) ORDER BY e.event_sequence), '[]'::jsonb)
    INTO _history
    FROM public.marketplace_release_lifecycle_events e WHERE e.release_id = _release.id;

  RETURN jsonb_build_object(
    'state', 'LIVE',
    'capability_ref', _capability_ref,
    'catalogue_revision', _ref.catalogue_revision,
    'item', jsonb_build_object(
      'slug', _item.slug, 'name', _item.name, 'type', _item.item_type,
      'category', _item.category, 'icon', _item.icon
    ),
    'publisher', jsonb_build_object(
      'id', _publisher.id,
      'class', CASE WHEN _publisher.origin = 'first_party' THEN 'PAIGE_FIRST_PARTY' ELSE 'VERIFIED_CREATOR' END
    ),
    'release', jsonb_build_object(
      'id', _release.id, 'version', _release.semver,
      'identity_digest_sha256', _release.identity_digest_sha256,
      'artifact_digest_sha256', _release.artifact_digest_sha256,
      'manifest_digest_sha256', _release.manifest_digest_sha256,
      'capability_declaration_digest_sha256', _release.capability_declaration_digest_sha256,
      'review_bundle_digest_sha256', _release.review_bundle_digest_sha256,
      'risk_class', _release.risk_class,
      'lifecycle', _history
    ),
    'capability_declaration', jsonb_build_object(
      'reads', to_jsonb(_release.capability_reads),
      'preparations', to_jsonb(_release.capability_preparations),
      'runtime_operations', to_jsonb(_release.capability_runtime_operations),
      'external_calls', to_jsonb(_release.capability_external_calls),
      'configuration_requirements', to_jsonb(_release.configuration_requirements),
      'prohibited', to_jsonb(_release.capability_prohibited),
      'default_deny', true
    )
  );
END
$function$;
REVOKE ALL ON FUNCTION public.marketplace_release_detail(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.marketplace_release_detail(text) TO authenticated;

COMMENT ON FUNCTION public.marketplace_release_catalog() IS
  'Phase 1A authenticated Marketplace read: server-resolves actor + active tenant and returns only immutable, reviewed, current, eligible releases with short-lived opaque detail references. No account epoch, entitlement, installation, billing, provider, or execution authority.';
COMMENT ON FUNCTION public.marketplace_release_detail(text) IS
  'Phase 1A curated capability detail resolver. Revalidates actor, active tenant, catalogue eligibility, exact release proof and lifecycle; never returns install_manifest, code_ref, reviewer notes, creator payload, credentials, secrets, provider tokens, entitlement, price, or execution state.';

COMMIT;
