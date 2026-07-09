-- Harden set_tenant_playbook (verifier findings on the roadmap-#1 build):
--   (1) TRUE atomic merge — do the jsonb merge inline in a single UPDATE so a
--       concurrent write to another features key can't lost-update it (§10 makes
--       this a shared seam Paige also calls).
--   (2) _only_if_unset — onboarding seeds a preset ONLY when the tenant has no
--       playbook yet, so a re-run over an idempotently-returned existing tenant
--       never wipes an already-authored playbook_config.
-- Adding a parameter changes the signature, so drop the 3-arg version first.

DROP FUNCTION IF EXISTS public.set_tenant_playbook(uuid, jsonb, text);

CREATE OR REPLACE FUNCTION public.set_tenant_playbook(
  _tenant_id uuid,
  _config jsonb DEFAULT NULL,
  _slug text DEFAULT NULL,
  _only_if_unset boolean DEFAULT false
) RETURNS public.tenants
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant public.tenants;
  _has_playbook boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.is_tenant_admin(_tenant_id) OR public.is_platform_owner()) THEN
    RAISE EXCEPTION 'only a tenant admin may set the playbook' USING ERRCODE = '42501';
  END IF;
  IF _config IS NULL AND _slug IS NULL THEN
    RAISE EXCEPTION 'provide a playbook config or a slug' USING ERRCODE = '22000';
  END IF;

  -- Onboarding seeding: skip (return unchanged) if a playbook is already set.
  IF _only_if_unset THEN
    SELECT (coalesce(t.features, '{}'::jsonb) ? 'playbook_config'
            OR coalesce(t.features, '{}'::jsonb) ? 'playbook')
      INTO _has_playbook FROM public.tenants t WHERE t.id = _tenant_id;
    IF _has_playbook IS NULL THEN
      RAISE EXCEPTION 'tenant not found' USING ERRCODE = '22000';
    END IF;
    IF _has_playbook THEN
      SELECT * INTO _tenant FROM public.tenants WHERE id = _tenant_id;
      RETURN _tenant;
    END IF;
  END IF;

  IF _config IS NOT NULL THEN
    UPDATE public.tenants
       SET features = coalesce(features, '{}'::jsonb)
                      || jsonb_build_object('playbook_config', _config)
                      || (CASE WHEN _config ? 'slug'
                               THEN jsonb_build_object('playbook', _config->>'slug')
                               ELSE '{}'::jsonb END)
     WHERE id = _tenant_id
     RETURNING * INTO _tenant;
  ELSE
    UPDATE public.tenants
       SET features = (coalesce(features, '{}'::jsonb) - 'playbook_config')
                      || jsonb_build_object('playbook', _slug)
     WHERE id = _tenant_id
     RETURNING * INTO _tenant;
  END IF;

  IF _tenant.id IS NULL THEN
    RAISE EXCEPTION 'tenant not found' USING ERRCODE = '22000';
  END IF;
  RETURN _tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.set_tenant_playbook(uuid, jsonb, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_tenant_playbook(uuid, jsonb, text, boolean) TO authenticated;
