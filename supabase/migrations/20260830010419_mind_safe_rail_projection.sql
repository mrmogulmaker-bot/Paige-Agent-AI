-- =============================================================================
-- Mind safe Context Rail projection
--
-- The raw Context Rail is append-only and may carry private producer text and
-- `payload` JSON. Solo Mind v1 needs only a small, tenant-scoped evidence index;
-- it must never inherit the rail's client-facing read path or table-level access
-- to producer content. This migration exposes only fixed-enum/structural fields
-- through a security-invoker view. The underlying table receives column
-- privileges solely so the invoker view can obey the existing RLS policy.
--
-- Security contract:
--   * public.paige_client_events retains its existing RLS policies unchanged.
--   * authenticated has NO table-level SELECT on the raw table.
--   * authenticated can read only the listed structural columns, subject to RLS.
--   * title, summary, payload, references, and every unlisted raw column fail at
--     the database/API boundary.
--   * the public view is SECURITY INVOKER, never a definer/RLS bypass.
--   * the view adds an active-tenant owner/staff gate; a linked client remains
--     denied even where pce_client_read permits the underlying source row.
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
  occurred_at,
  contact_id
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
  occurred_at,
  contact_id
FROM public.paige_client_events
WHERE tenant_id = public.current_user_tenant_id()
  AND (
    public.is_platform_owner()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_members AS mind_member
      WHERE mind_member.tenant_id = public.current_user_tenant_id()
        AND mind_member.user_id = auth.uid()
        AND mind_member.status = 'active'
        AND (
          mind_member.is_owner = true
          OR mind_member.role IN ('admin', 'coach')
        )
    )
  );

COMMENT ON VIEW public.solo_mind_rail_events IS
  'Staff-only, active-tenant, security-invoker evidence index for Solo Mind. Excludes producer text, references, payload, and all raw content by database contract.';

-- No anonymous or inherited public access.  Authenticated callers can query the
-- projection, where both the existing source RLS and the view's narrower
-- active-tenant owner/staff predicate must allow the row.
REVOKE ALL ON TABLE public.solo_mind_rail_events FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.solo_mind_rail_events TO authenticated;
