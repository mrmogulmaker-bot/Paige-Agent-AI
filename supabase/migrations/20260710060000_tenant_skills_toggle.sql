-- Paige "skills" (marketplace add-ons) — a tenant layers a capability skill on
-- top of WHATEVER coach-type skin they authored, without swapping their persona
-- (Roadmap #9, §8/§9). Stored as features.enabled_skills (jsonb array of slugs).
-- Funding is the first skill; this generalizes the earlier boolean gate so a
-- second skill needs no new plumbing.
--
-- (This migration is the committed source of truth for what was applied to prod
-- on 2026-07-10; it supersedes the funding gate in 20260710050000.)
CREATE OR REPLACE FUNCTION public.set_tenant_skill(_tenant_id uuid, _skill text, _enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _skills jsonb;
BEGIN
  IF NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant_id)) THEN
    RAISE EXCEPTION 'not authorized to change this tenant''s skills';
  END IF;
  IF _skill IS NULL OR _skill !~ '^[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'invalid skill slug';
  END IF;

  SELECT COALESCE(
           (SELECT jsonb_agg(DISTINCT v)
            FROM jsonb_array_elements_text(COALESCE(t.features->'enabled_skills', '[]'::jsonb)) AS v
            WHERE v <> _skill),
           '[]'::jsonb)
  INTO _skills
  FROM public.tenants t WHERE t.id = _tenant_id;

  IF _enabled THEN
    _skills := _skills || to_jsonb(_skill);
  END IF;

  UPDATE public.tenants
  SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object('enabled_skills', _skills)
  WHERE id = _tenant_id;

  RETURN _skills;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_tenant_skill(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_skill(uuid, text, boolean) TO authenticated;

-- Fold enabled_skills into the funding gate the AI chat reads (adds the 4th
-- condition to the function created in 20260710050000).
CREATE OR REPLACE FUNCTION public.get_paige_persona_context()
RETURNS TABLE (
  tenant_id uuid,
  tenant_name text,
  playbook_config jsonb,
  playbook_slug text,
  funding_enabled boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _tid uuid;
BEGIN
  SELECT c.tenant_id INTO _tid
  FROM public.clients c
  WHERE c.linked_user_id = auth.uid()
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF _tid IS NULL THEN
    SELECT p.active_tenant_id INTO _tid FROM public.profiles p WHERE p.id = auth.uid();
  END IF;
  IF _tid IS NULL THEN
    SELECT m.tenant_id INTO _tid FROM public.tenant_members m WHERE m.user_id = auth.uid() LIMIT 1;
  END IF;
  IF _tid IS NULL THEN
    SELECT t.id INTO _tid FROM public.tenants t WHERE t.owner_user_id = auth.uid() LIMIT 1;
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
    )
  FROM public.tenants t
  WHERE t.id = _tid;
END $$;
REVOKE EXECUTE ON FUNCTION public.get_paige_persona_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_paige_persona_context() TO authenticated;
