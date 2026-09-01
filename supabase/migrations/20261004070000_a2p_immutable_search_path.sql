-- Post-deploy advisor closure for the A2P draft immutability predicate.
-- The function reads only fields from its composite argument, so it needs no
-- caller-controlled schema resolution at runtime.
ALTER FUNCTION public.a2p_registration_is_immutable(public.tenant_a2p_registrations)
  SET search_path = pg_catalog;
