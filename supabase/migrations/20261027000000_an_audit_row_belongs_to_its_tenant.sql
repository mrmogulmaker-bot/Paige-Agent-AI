-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- paige_audit_log: every actor can record their own action, and an untenanted row is not public
-- to every tenant's admins.
--
-- WHY NOW. `paige-ai-chat` now files an attribution row for EVERY write Paige performs — what
-- changed, on which record, for which tenant, on whose authority, and whether it worked. Before
-- that, ten of forty-nine mutations reached the per-client rail and three wrote a bespoke
-- `audit_logs` row; the rest left no trace. Widening what this table holds means getting its
-- policies right BEFORE the volume arrives.
--
-- §13 — A CORRECTION TO MY OWN FIRST READING, recorded because the wrong version was nearly
-- shipped. I read the migration history and found `has_any_role(auth.uid(), ARRAY['admin',
-- 'super_admin'])` on SELECT, recognised the §59 tenant-agnostic-role trap, and wrote a migration
-- justified by "any tenant admin can read every tenant's audit rows". Querying production first
-- showed that is FALSE: a RESTRICTIVE `tenant_isolation` policy exists on this table that no
-- migration in this repository creates, and being RESTRICTIVE it ANDs with every permissive
-- policy:
--
--     is_platform_owner() OR tenant_id IS NULL OR tenant_id = current_user_tenant_id()
--
-- So a tenanted row was already unreadable across tenants. The grep was not the source of truth
-- and the live catalogue was.
--
-- WHAT IS ACTUALLY WRONG, both confirmed against production:
--
-- 1. INSERT requires `is_staff(auth.uid())` — admin/super_admin/sales_rep/cs_rep/coach/finance.
--    A client-portal user holds `client`, so their own action can never be recorded. That seat has
--    exactly one write (`update_client_data`, on their own record) and it is the one write the
--    audit trail structurally cannot cover. `actor_user_id = auth.uid()` loses nothing: a staff
--    member could only ever insert a row naming themselves either way, so `is_staff` was excluding
--    actors rather than preventing anything.
--
-- 2. The restrictive policy admits `tenant_id IS NULL` to ANY authenticated caller, and
--    "Admins read all audit" is unqualified — so a tenant-level `admin` in any tenant can read
--    EVERY untenanted row. That was near-harmless while almost nothing was written here. From
--    today an operator-persona or tenant-less turn files an attribution row with `tenant_id` null,
--    carrying target ids, thread ids and focused-client ids. Increasing the volume is what makes
--    this worth closing, and closing it before the volume arrives is the point.
--
-- §58 — WHAT THIS DELIBERATELY TAKES AWAY. A tenant-level admin can no longer read untenanted
-- audit rows belonging to other people. No shipped surface does that (the operator surfaces go
-- through `is_platform_operator()`, and an actor keeps their own rows either way), so this is a
-- leak being closed rather than a capability being removed — but it IS a narrowing, and it is
-- named here so nobody meets it later as a mystery.
--
-- §53 — cross-tenant reach is the operator helper, never the tenant-level app_role.
-- The RESTRICTIVE `tenant_isolation` policy is left exactly as it is: it is load-bearing, it is
-- not ours to rewrite in passing, and every policy below composes with it rather than around it.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- ── INSERT: anyone may record their own action, and only their own. ──────────────────────────
DROP POLICY IF EXISTS "Staff insert own actions" ON public.paige_audit_log;
DROP POLICY IF EXISTS "Actors record their own actions" ON public.paige_audit_log;
CREATE POLICY "Actors record their own actions" ON public.paige_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());

-- ── SELECT: your own rows · your own tenant's rows if you administer it · all, if operator. ──
DROP POLICY IF EXISTS "Admins read all audit" ON public.paige_audit_log;
DROP POLICY IF EXISTS "Users read own audit" ON public.paige_audit_log;
DROP POLICY IF EXISTS "Read own audit rows" ON public.paige_audit_log;
DROP POLICY IF EXISTS "Tenant admins read their own tenant's audit" ON public.paige_audit_log;
DROP POLICY IF EXISTS "Platform operators read all audit" ON public.paige_audit_log;

CREATE POLICY "Read own audit rows" ON public.paige_audit_log
  FOR SELECT TO authenticated
  USING (actor_user_id = auth.uid());

-- `current_user_tenant_id()` resolves from the caller's own session, never from anything a caller
-- supplies, so this cannot be aimed at someone else's tenant. `tenant_id IS NOT NULL` is the part
-- that matters: without it, an admin whose own tenant resolves to NULL would read every untenanted
-- row again, which is defect 2 rebuilt.
CREATE POLICY "Tenant admins read their own tenant's audit" ON public.paige_audit_log
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
    AND public.has_any_role(auth.uid(), ARRAY['admin'])
  );

-- §53: cross-tenant reach is the operator tier, and only the operator tier.
CREATE POLICY "Platform operators read all audit" ON public.paige_audit_log
  FOR SELECT TO authenticated
  USING (public.is_platform_operator());

-- The write trail is read by tenant and recency. Without this, every operator read becomes a seq
-- scan once this table carries one row per write.
CREATE INDEX IF NOT EXISTS idx_paige_audit_log_tenant_created
  ON public.paige_audit_log (tenant_id, created_at DESC);
