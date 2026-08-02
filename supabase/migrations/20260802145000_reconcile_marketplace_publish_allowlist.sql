-- ============================================================================
-- Reconcile marketplace_publish_version with prod (fresh-DB-reset integrity, §32).
--
-- WHY: the LIVE prod marketplace_publish_version already accepts the config-only
-- kinds 'playbook_preset' + 'journey_stages' (its _allowed_kinds was expanded
-- out-of-repo). The repo migrations that define the function (the July registry
-- spine) still carry the OLDER allowlist. On the live prod apply this is a no-op,
-- but a from-scratch repo replay (Supabase preview / a cold reset) would run the
-- stale definition and then REJECT the Business Coaching Blueprint publish
-- (20260802150000), which ships playbook_preset + journey_stages, with 42501.
--
-- This migration captures prod's CURRENT function definition verbatim so the repo
-- and prod agree, and MUST be ordered BEFORE 20260802150000. Pure CREATE OR REPLACE;
-- behavior-identical to what is already live on prod (no new capability).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.marketplace_publish_version(_item_slug text, _semver text, _payload_class text DEFAULT 'config_only'::text, _install_manifest jsonb DEFAULT '{}'::jsonb, _changelog text DEFAULT NULL::text)
 RETURNS jsonb
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
  _allowed_kinds text[] := ARRAY['skill_flag','playbook_preset','journey_stages','persona_overlay','feature_flag'];
BEGIN
  IF NOT (public._marketplace_operator_authorized()) THEN
    RAISE EXCEPTION 'only the platform owner (or service_role) may publish catalog versions'
      USING ERRCODE = '42501';
  END IF;
  _actor_role := CASE WHEN public.is_platform_owner() THEN 'platform_owner' ELSE 'service_role' END;

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

  IF _item.origin = 'first_party' AND _item.scope = 'public' AND NOT _item.is_finance
     AND lower(coalesce(_install_manifest::text,'')) ~ public._marketplace_finance_re() THEN
    _finance_warning := 'This public first-party version ships finance/credit vocabulary but the item is not marked is_finance. A public listing is shown to all tenants in browse. Mark is_finance and keep it opt-in, or confirm the exposure is intended (section 2).';
    RAISE WARNING '%', _finance_warning;
  END IF;

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
      'changelog', _changelog, 'set_as_current', true,
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
