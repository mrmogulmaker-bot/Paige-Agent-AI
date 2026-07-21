-- Move 2 · Slice 1 (§9 keystone) — narrow the GLOBAL admin bypass to TENANT-scoped on the
-- cross-tenant-PII tables, + a hard god-role ceiling on the tenant_members→user_roles sync.
--
-- WHY: app_role='admin' in user_roles is platform-GLOBAL (no tenant_id). The tenant onboarding
-- flow (provision_tenant → tenant_members owner → trg_sync_tenant_member_to_user_roles →
-- map_tenant_role_to_app_role('owner')='admin') mints that global admin for EVERY tenant owner,
-- and 231 live policies trust has_role(...,'admin') — so any tenant's admin can read/write EVERY
-- tenant's rows. This slice fixes the highest-severity leak class first: client PII.
--
-- CANONICAL MOVE-2 TEMPLATE (this slice sets the shape every later slice copies). It matches the
-- repo's freshly-hardened reference table `businesses` (the DRIFT-C1 fix) exactly:
--   * operator escape  = public.is_platform_owner()   -- super_admin ONLY (the god account); the
--                        tightest, most defensible cross-tenant bar for client PII (§17 break-glass).
--   * tenant scope     = (tenant_id = public.current_user_tenant_id() AND has_role(<staff role>))
--                        current_user_tenant_id() is AGENCY-AWARE (resolves agency→child via
--                        agency_can_manage_child) and validated, so pairing it with the existing
--                        global has_role('admin') NEUTERS that role's global reach: a tenant admin
--                        only reaches rows of the tenant they're actively operating (§17: switch
--                        active tenant to act for a child). Cross-tenant → tenant_id<>active → denied.
-- Every non-admin clause (author/uploader self, coach/created-by assignment, client-self) is
-- preserved verbatim; only the bare global `has_role('admin')` term is replaced by the template.
--
-- DATA-SAFETY (verified live 2026-07-21): client_notes/client_files/growth_form_submissions are
-- EMPTY (0 rows); paige_subagents has 24 rows, ALL tenant_id IS NULL (platform defaults) — these
-- stay readable via the unchanged paige_subagents_tenant_read policy and manageable via
-- is_platform_owner(). No tenant-owned row loses access.
--
-- SECOND CONCERN IN THIS FILE (kept legible per §24): besides the 4-table policy narrowing, this
-- migration also replaces the platform-wide sync_tenant_member_to_user_roles() trigger fn to add a
-- god-role ceiling. Both are the same "admin-over-grant" hardening; they ship together intentionally.

-- =========================================================================================
-- client_notes  (author_user_id, contact_id, tenant_id)
-- =========================================================================================
ALTER POLICY "Authors and admins can delete notes" ON public.client_notes
  USING (
    (author_user_id = auth.uid())
    OR public.is_platform_owner()
    OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role))
  );

ALTER POLICY "Staff can create notes" ON public.client_notes
  WITH CHECK (
    (author_user_id = auth.uid())
    AND (
      public.is_platform_owner()
      OR (tenant_id = public.current_user_tenant_id()
          AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'coach'::app_role)))
    )
  );

ALTER POLICY "Staff can read notes for their contacts" ON public.client_notes
  USING (
    public.is_platform_owner()
    OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role))
    OR (EXISTS (SELECT 1 FROM public.clients c
                WHERE c.id = client_notes.contact_id
                  AND (c.assigned_coach_user_id = auth.uid() OR c.created_by = auth.uid())))
  );

ALTER POLICY "Authors and admins can update notes" ON public.client_notes
  USING (
    (author_user_id = auth.uid())
    OR public.is_platform_owner()
    OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role))
  );

-- =========================================================================================
-- client_files  (uploaded_by_user_id, contact_id, tenant_id)
-- =========================================================================================
ALTER POLICY "Uploader or admin delete files" ON public.client_files
  USING (
    (uploaded_by_user_id = auth.uid())
    OR public.is_platform_owner()
    OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role))
  );

ALTER POLICY "Staff insert files" ON public.client_files
  WITH CHECK (
    (uploaded_by_user_id = auth.uid())
    AND (
      public.is_platform_owner()
      OR (tenant_id = public.current_user_tenant_id()
          AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'coach'::app_role)))
    )
  );

ALTER POLICY "Staff read files" ON public.client_files
  USING (
    public.is_platform_owner()
    OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role))
    OR (EXISTS (SELECT 1 FROM public.clients c
                WHERE c.id = client_files.contact_id
                  AND (c.assigned_coach_user_id = auth.uid() OR c.created_by = auth.uid())))
  );

ALTER POLICY "Uploader or admin update files" ON public.client_files
  USING (
    (uploaded_by_user_id = auth.uid())
    OR public.is_platform_owner()
    OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role))
  );

-- =========================================================================================
-- growth_form_submissions  (contact_id, tenant_id) — staff already covered by
-- tenant_id=current_user_tenant_id() (any member of the owning/managing tenant); the global
-- admin/super_admin terms were pure over-reach. Operator escape → is_platform_owner().
-- =========================================================================================
ALTER POLICY "growth_form_submissions_tenant_read" ON public.growth_form_submissions
  USING ((tenant_id = public.current_user_tenant_id()) OR public.is_platform_owner());

ALTER POLICY "growth_form_submissions_tenant_update" ON public.growth_form_submissions
  USING ((tenant_id = public.current_user_tenant_id()) OR public.is_platform_owner());

-- =========================================================================================
-- paige_subagents  (tenant_id; NULL = platform default). Tenant admin manages their active
-- tenant's agents; platform defaults (tenant_id NULL) are operator-managed via is_platform_owner()
-- (NULL = current_user_tenant_id() is never true). Read policy (paige_subagents_tenant_read) unchanged.
-- =========================================================================================
ALTER POLICY "Admins manage subagents" ON public.paige_subagents
  USING (
    public.is_platform_owner()
    OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    public.is_platform_owner()
    OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role))
  );

-- =========================================================================================
-- God-role ceiling on the tenant_members → user_roles sync (belt-and-suspenders, §17/§16).
-- map_tenant_role_to_app_role currently only yields admin/coach/user, so this can't fire today —
-- but a future mapping edit must NEVER let the auto-sync mint a god role. Explicit hard stop.
-- Body is byte-identical to the live definition except the added ceiling block.
-- =========================================================================================
CREATE OR REPLACE FUNCTION public.sync_tenant_member_to_user_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _new_role app_role;
  _old_role app_role;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.status = 'active' THEN
    _new_role := public.map_tenant_role_to_app_role(NEW.role);
    -- §17 hard ceiling: the auto-sync may never grant a platform-god role, regardless of mapping.
    IF _new_role IN ('super_admin'::app_role, 'platform_admin'::app_role, 'developer'::app_role) THEN
      _new_role := NULL;
    END IF;
    IF _new_role IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.user_id) THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.user_id, _new_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    _old_role := public.map_tenant_role_to_app_role(OLD.role);
    IF _old_role IS NOT NULL
       AND (OLD.role <> NEW.role OR NEW.status <> 'active')
       AND _old_role <> COALESCE(public.map_tenant_role_to_app_role(NEW.role), 'user'::app_role)
    THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.user_id = OLD.user_id AND tm.status = 'active'
          AND tm.id <> OLD.id
          AND public.map_tenant_role_to_app_role(tm.role) = _old_role
      ) THEN
        DELETE FROM public.user_roles WHERE user_id = OLD.user_id AND role = _old_role;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    _old_role := public.map_tenant_role_to_app_role(OLD.role);
    IF _old_role IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.user_id = OLD.user_id AND tm.status = 'active'
          AND public.map_tenant_role_to_app_role(tm.role) = _old_role
      ) THEN
        DELETE FROM public.user_roles WHERE user_id = OLD.user_id AND role = _old_role;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;
