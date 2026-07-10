-- Server-side read of the caller's tenant Playbook, so the AI chat edge function
-- can make Paige speak/probe as THAT tenant's practice (§7/§8) instead of a
-- hardcoded vertical. Also returns funding_enabled — the opt-in gate that keeps
-- the funding/capital-raising "skill" OUT of the coaching-generic platform
-- default and the God account (§2/§9); it only turns on for a tenant that chose
-- the funding preset/skill (marketplace, #9/#66).
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
  -- Resolve the caller's tenant: a customer resolves through their clients row;
  -- staff/operators through active tenant, membership, or ownership.
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
    RETURN; -- no tenant → caller uses the neutral default
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
        OR (t.features -> 'playbook_config' ->> 'slug') = 'funding',
      false
    )
  FROM public.tenants t
  WHERE t.id = _tid;
END $$;
REVOKE EXECUTE ON FUNCTION public.get_paige_persona_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_paige_persona_context() TO authenticated;
