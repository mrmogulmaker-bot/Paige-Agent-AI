-- =============================================================================
-- Mind safe Context Rail projection
--
-- The raw Context Rail is append-only and may carry private `payload` JSON. Solo
-- Mind needs a small, tenant-scoped provenance index; it must never inherit a
-- table-level read of that raw payload.  This migration exposes only the stable
-- safe fields through a security-invoker view.  The underlying table receives
-- column privileges solely so the invoker view can obey the existing RLS policy.
--
-- Security contract:
--   * public.paige_client_events retains its existing RLS policies unchanged.
--   * authenticated has NO table-level SELECT on the raw table.
--   * authenticated can read only the listed safe columns, subject to RLS.
--   * payload and every unlisted raw column fail at the database/API boundary.
--   * the public view is SECURITY INVOKER, never a definer/RLS bypass.
-- =============================================================================

-- There must be no broad raw-table grant.  This is intentionally a table-level
-- revoke before granting the narrow field list below.
REVOKE SELECT ON TABLE public.paige_client_events FROM authenticated;

-- SECURITY INVOKER views evaluate the underlying RLS policy as the browser
-- caller.  Postgres still requires column privileges on the source relation;
-- grant exactly the fields allowed to leave the rail contract.
GRANT SELECT (
  id,
  event_kind,
  surface,
  actor_type,
  audience,
  visibility,
  title,
  summary,
  occurred_at,
  contact_id,
  ref_table,
  ref_id
) ON TABLE public.paige_client_events TO authenticated;

CREATE OR REPLACE VIEW public.solo_mind_rail_events
WITH (security_invoker = true, security_barrier = true)
AS
SELECT
  id,
  event_kind,
  surface,
  actor_type,
  audience,
  visibility,
  title,
  summary,
  occurred_at,
  contact_id,
  ref_table,
  ref_id
FROM public.paige_client_events;

COMMENT ON VIEW public.solo_mind_rail_events IS
  'Safe, security-invoker Context Rail projection for Solo Mind. Excludes payload and raw-content fields by database contract.';

-- No anonymous or inherited public access.  Authenticated callers can query the
-- projection, where the existing paige_client_events RLS policy supplies tenant
-- and staff-role authorization.
REVOKE ALL ON TABLE public.solo_mind_rail_events FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.solo_mind_rail_events TO authenticated;
