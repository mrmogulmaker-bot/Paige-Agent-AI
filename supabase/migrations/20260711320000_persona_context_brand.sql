-- Paige builds on-brand (#143 §6/§7). Add the resolved (cascaded) brand to the
-- persona context so every page/email/asset Paige builds wears THIS tenant's
-- brand — or, for a sub-account with none of its own, its agency's white-label
-- brand — never the platform's generic look. Rebuilt from the current body
-- (20260710060000_tenant_skills_toggle) with a single added output column.
DROP FUNCTION IF EXISTS public.get_paige_persona_context();
CREATE FUNCTION public.get_paige_persona_context()
RETURNS TABLE(tenant_id uuid, tenant_name text, playbook_config jsonb, playbook_slug text, funding_enabled boolean, brand jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    ),
    (SELECT to_jsonb(rb) FROM public.resolve_tenant_brand(_tid) rb) AS brand
  FROM public.tenants t
  WHERE t.id = _tid;
END $function$;
