-- #616 · Team/Roles consolidation — coach-fields data-layer seam.
--
-- WHY AN RPC PAIR, NOT A POLICY WIDEN (§9/§28):
-- public.profiles has own-row RLS (SELECT/UPDATE keyed on auth.uid()=user_id) plus
-- a platform-owner-only cross-user UPDATE. So today a tenant ADMIN can neither read
-- nor write ANOTHER member's profile — only the record's own user, or platform God.
-- The owner's Q2 ruling is "keep coach-visible with an own-record-OR-tenant-admin
-- gate, scoped to the coach columns only." Widening the profiles policies to
-- is_tenant_admin() would expose/allow-write EVERY profile column (email, address,
-- staff_notes, …) to admins — a real §9 over-widening. A SECURITY DEFINER function
-- is column-scoped where an RLS policy cannot be, so the seam is two narrow RPCs
-- that touch ONLY the five coach_* columns. This is also the §10 Paige-callable
-- seam (mirrors the existing service-role paige-mcp coach-update tool).
--
-- GATE (both RPCs): caller may act on _user_id iff
--   auth.uid() = _user_id                              -- self (a coach's own fields)
--   OR ( is_tenant_admin(current_user_tenant_id())     -- a tenant owner/admin ...
--        AND _user_id is an ACTIVE member of that SAME tenant )  -- ... of the target's tenant
-- Cross-tenant is blocked by the same-tenant EXISTS; one coach editing a peer is
-- blocked (neither branch passes). is_tenant_admin() keys on tenant_members
-- role IN ('owner','admin') — verified live: 13 such rows across 7/8 tenants.

-- ---------------------------------------------------------------------------
-- WRITE: own-record-or-tenant-admin, writes ONLY the coach_* columns.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_coach_fields(
  _user_id     uuid,
  _specialties text[],
  _capacity    int,
  _accepting   boolean,
  _timezone    text DEFAULT NULL,
  _bio         text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _tenant uuid := public.current_user_tenant_id();
BEGIN
  IF NOT (
    auth.uid() = _user_id
    OR (
      public.is_tenant_admin(_tenant)
      AND EXISTS (
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.user_id = _user_id
          AND tm.tenant_id = _tenant
          AND tm.status = 'active'
      )
    )
  ) THEN
    RAISE EXCEPTION 'COACH_FIELDS_FORBIDDEN' USING errcode = '42501';
  END IF;

  UPDATE public.profiles SET
    coach_specialties       = COALESCE(_specialties, coach_specialties),
    coach_capacity          = _capacity,                        -- NULL is a legit "no cap"
    coach_accepting_clients = COALESCE(_accepting, coach_accepting_clients),
    coach_timezone          = COALESCE(_timezone, coach_timezone),
    coach_bio               = COALESCE(_bio, coach_bio),
    updated_at              = now()
  WHERE user_id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COACH_FIELDS_NO_PROFILE' USING errcode = 'P0002';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.set_coach_fields(uuid, text[], int, boolean, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_coach_fields(uuid, text[], int, boolean, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- READ: the admin console must render OTHER coaches' fields, but profiles SELECT
-- is own-row-only. Same gate as the writer, per-row, returns ONLY coach columns.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tenant_coach_fields(_user_ids uuid[])
RETURNS TABLE (
  user_id                 uuid,
  coach_specialties       text[],
  coach_capacity          int,
  coach_accepting_clients boolean,
  coach_timezone          text,
  coach_bio               text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.user_id, p.coach_specialties, p.coach_capacity,
         p.coach_accepting_clients, p.coach_timezone, p.coach_bio
  FROM public.profiles p
  WHERE p.user_id = ANY(_user_ids)
    AND (
      p.user_id = auth.uid()
      OR (
        public.is_tenant_admin(public.current_user_tenant_id())
        AND EXISTS (
          SELECT 1 FROM public.tenant_members tm
          WHERE tm.user_id = p.user_id
            AND tm.tenant_id = public.current_user_tenant_id()
            AND tm.status = 'active'
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_tenant_coach_fields(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_coach_fields(uuid[]) TO authenticated;
