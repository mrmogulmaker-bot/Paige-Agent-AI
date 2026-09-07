-- Paige Secure Browser prerequisite security repair.
-- Every session row is tenant-attributed at write time; service-role writers do not get to bypass
-- cross-object tenancy merely because RLS does not apply to them.

-- Preserve verified authority provenance. An authorized agency representative is not a tenant
-- administrator, and must never be persisted or confirmed as one.
ALTER TABLE public.browser_use_sessions
  DROP CONSTRAINT IF EXISTS browser_use_sessions_invoker_kind_check,
  ADD CONSTRAINT browser_use_sessions_invoker_kind_check
    CHECK (invoker_kind IN ('admin','agency','platform_owner','coach','paige','skill','system'));

ALTER TABLE public.paige_skill_runs
  DROP CONSTRAINT IF EXISTS paige_skill_runs_invoker_kind_check,
  ADD CONSTRAINT paige_skill_runs_invoker_kind_check
    CHECK (invoker_kind IN ('admin','agency','platform_owner','coach','paige','system','mcp'));

-- Production preflight found two historical failed skill rows with no actor, contact, business, or
-- tenant reference. Preserve them exactly, but remove them from the tenant-readable active ledger.
CREATE TABLE public.browser_use_sessions_legacy_quarantine
  (LIKE public.browser_use_sessions INCLUDING ALL);
ALTER TABLE public.browser_use_sessions_legacy_quarantine
  ADD COLUMN tenant_id uuid,
  ADD COLUMN quarantined_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN quarantine_reason text NOT NULL;
ALTER TABLE public.browser_use_sessions_legacy_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.browser_use_sessions_legacy_quarantine FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.browser_use_sessions_legacy_quarantine FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.browser_use_sessions_legacy_quarantine TO service_role;

ALTER TABLE public.browser_use_sessions
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;

-- Existing rows are only attributed where the owning tenant is deterministic. A conflicting or
-- unresolvable legacy row blocks the migration rather than being guessed into a tenant.
UPDATE public.browser_use_sessions s
SET tenant_id = c.tenant_id
FROM public.clients c
WHERE s.related_contact_id = c.id
  AND c.tenant_id IS NOT NULL;

UPDATE public.browser_use_sessions s
SET tenant_id = b.tenant_id
FROM public.businesses b
WHERE s.tenant_id IS NULL
  AND s.related_business_id = b.id
  AND b.tenant_id IS NOT NULL;

INSERT INTO public.browser_use_sessions_legacy_quarantine
SELECT s.*, now(), 'unattributable_before_tenant_scope'
FROM public.browser_use_sessions s
WHERE s.tenant_id IS NULL;

DELETE FROM public.browser_use_sessions
WHERE tenant_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.browser_use_sessions s
    LEFT JOIN public.clients c ON c.id = s.related_contact_id
    LEFT JOIN public.businesses b ON b.id = s.related_business_id
    WHERE (c.id IS NOT NULL AND c.tenant_id IS DISTINCT FROM s.tenant_id)
       OR (b.id IS NOT NULL AND b.tenant_id IS DISTINCT FROM s.tenant_id)
  ) THEN
    RAISE EXCEPTION 'browser_use_sessions contains cross-tenant legacy attribution';
  END IF;
END;
$$;

ALTER TABLE public.browser_use_sessions
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX browser_use_sessions_tenant_created_idx
  ON public.browser_use_sessions (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.guard_browser_use_session_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required' USING ERRCODE = '23502';
  END IF;

  IF NEW.related_contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = NEW.related_contact_id AND c.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'related_contact_id is outside the session tenant' USING ERRCODE = '42501';
  END IF;

  IF NEW.related_business_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = NEW.related_business_id AND b.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'related_business_id is outside the session tenant' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_browser_use_session_tenant() FROM PUBLIC;

CREATE TRIGGER browser_use_sessions_tenant_guard
BEFORE INSERT OR UPDATE OF tenant_id, related_contact_id, related_business_id
ON public.browser_use_sessions
FOR EACH ROW EXECUTE FUNCTION public.guard_browser_use_session_tenant();

DROP POLICY IF EXISTS "Admins view browser sessions" ON public.browser_use_sessions;
DROP POLICY IF EXISTS "Coaches view browser sessions for own clients" ON public.browser_use_sessions;

CREATE POLICY "Authorized tenant staff view browser sessions"
ON public.browser_use_sessions FOR SELECT TO authenticated
USING (
  public.is_platform_owner()
  OR public.is_tenant_admin(tenant_id)
  OR public.agency_can_manage_child(tenant_id)
  OR (
    related_contact_id IS NOT NULL
    AND public.has_role(auth.uid(), 'coach')
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = related_contact_id
        AND c.tenant_id = tenant_id
        AND c.assigned_coach_user_id = auth.uid()
    )
  )
);

ALTER TABLE public.browser_use_sessions FORCE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.browser_use_sessions.tenant_id IS
  'Server-resolved tenant attribution. Caller-supplied tenant identity is never authoritative.';
