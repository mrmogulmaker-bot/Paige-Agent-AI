-- =============================================================================
-- Mind safe Context Rail resolver
--
-- The raw Context Rail is durable provenance and may carry private producer
-- text, external messages, prompts, references, and payload JSON. Mind v1 may
-- consume only a tenant-safe structural evidence index. Keep the raw relation
-- RPC-only and expose the eight approved fields through one guarded resolver.
--
-- This SECURITY DEFINER function is a privilege boundary. It derives the actor
-- from the verified auth session, binds the requested tenant to the actor's
-- active tenant, checks the canonical active tenant membership in-function,
-- rejects linked-client identities, and returns no producer content.
-- =============================================================================

-- Preserve the rail's existing RPC-only browser boundary. RLS remains enabled
-- as defense in depth, but no browser role receives direct relation privileges.
REVOKE ALL PRIVILEGES ON TABLE public.paige_client_events
  FROM PUBLIC, anon, authenticated;

DROP VIEW IF EXISTS public.solo_mind_rail_events;

CREATE OR REPLACE FUNCTION public.get_solo_mind_rail_events(
  p_tenant_id uuid,
  p_event_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  event_kind text,
  surface text,
  actor_type text,
  audience text,
  visibility text,
  occurred_at timestamptz,
  contact_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_active_tenant_id uuid;
BEGIN
  -- The EXECUTE grant is not the guard. Require a real authenticated session
  -- and never accept a caller-supplied actor identity.
  IF auth.role() IS DISTINCT FROM 'authenticated' OR v_actor_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MIND_RAIL_FORBIDDEN';
  END IF;

  SELECT profile.active_tenant_id
    INTO v_active_tenant_id
  FROM public.profiles AS profile
  WHERE profile.user_id = v_actor_id;

  -- A missing, inactive, stale, or wrong account context fails identically.
  IF p_tenant_id IS NULL
     OR v_active_tenant_id IS NULL
     OR v_active_tenant_id <> p_tenant_id
     OR NOT EXISTS (
       SELECT 1
       FROM public.tenants AS tenant
       WHERE tenant.id = p_tenant_id
         AND tenant.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.tenant_members AS member
       WHERE member.tenant_id = p_tenant_id
         AND member.user_id = v_actor_id
         AND member.status = 'active'
         AND (
           member.is_owner IS TRUE
           OR member.role IN ('admin', 'coach')
         )
     )
     OR EXISTS (
       SELECT 1
       FROM public.clients AS linked_client
       WHERE linked_client.tenant_id = p_tenant_id
         AND linked_client.linked_user_id = v_actor_id
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MIND_RAIL_FORBIDDEN';
  END IF;

  RETURN QUERY
  SELECT
    event.id,
    event.event_kind,
    event.surface,
    event.actor_type,
    event.audience,
    event.visibility,
    event.occurred_at,
    event.contact_id
  FROM public.paige_client_events AS event
  WHERE event.tenant_id = p_tenant_id
    AND (p_event_id IS NULL OR event.id = p_event_id)
  ORDER BY event.occurred_at DESC, event.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
END
$function$;

COMMENT ON FUNCTION public.get_solo_mind_rail_events(uuid, uuid, integer) IS
  'Staff-only active-tenant Mind evidence resolver. Returns exactly eight structural Context Rail fields; no producer text, references, payload, or write authority.';

-- Functions default to PUBLIC execution. Remove every default/inherited browser
-- path and grant only the authenticated role; the body still revalidates auth,
-- active account, canonical staff membership, and linked-client exclusion.
REVOKE ALL ON FUNCTION public.get_solo_mind_rail_events(uuid, uuid, integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_solo_mind_rail_events(uuid, uuid, integer)
  TO authenticated;
