-- Playbook authoring — the WRITE side of the tenant-authored Paige (roadmap #1).
--
-- The read/resolve layer already exists (src/lib/playbook/resolve.ts reads
-- tenants.features.playbook_config, else features.playbook slug, else the neutral
-- coaching default). Nothing writes it yet, so every tenant silently resolves to
-- the default. This RPC is the single write seam — used by the onboarding vertical
-- pick, the admin Playbook editor, AND Paige herself (§10 Paige-governable).
--
-- Atomic jsonb merge so we never clobber other keys in tenants.features. Owner/
-- admin gated (SECURITY DEFINER bypasses RLS, so we check explicitly).
--   _config  → store a FULL authored Playbook object (features.playbook_config)
--   _slug    → pick a starter library preset (features.playbook), dropping any
--              prior authored override so the preset actually takes effect.

CREATE OR REPLACE FUNCTION public.set_tenant_playbook(
  _tenant_id uuid,
  _config jsonb DEFAULT NULL,
  _slug text DEFAULT NULL
) RETURNS public.tenants
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant public.tenants;
  _features jsonb;
  _found boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.is_tenant_admin(_tenant_id) OR public.is_platform_owner()) THEN
    RAISE EXCEPTION 'only a tenant admin may set the playbook' USING ERRCODE = '42501';
  END IF;

  SELECT true, coalesce(t.features, '{}'::jsonb)
    INTO _found, _features
    FROM public.tenants t WHERE t.id = _tenant_id;
  IF NOT _found THEN
    RAISE EXCEPTION 'tenant not found' USING ERRCODE = '22000';
  END IF;

  IF _config IS NOT NULL THEN
    _features := _features || jsonb_build_object('playbook_config', _config);
    IF _config ? 'slug' THEN
      _features := _features || jsonb_build_object('playbook', _config->>'slug');
    END IF;
  ELSIF _slug IS NOT NULL THEN
    _features := (_features - 'playbook_config') || jsonb_build_object('playbook', _slug);
  ELSE
    RAISE EXCEPTION 'provide a playbook config or a slug' USING ERRCODE = '22000';
  END IF;

  UPDATE public.tenants SET features = _features WHERE id = _tenant_id
  RETURNING * INTO _tenant;
  RETURN _tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.set_tenant_playbook(uuid, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_tenant_playbook(uuid, jsonb, text) TO authenticated;
