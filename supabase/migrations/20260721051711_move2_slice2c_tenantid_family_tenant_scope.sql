-- Move 2 · Slice 2c (Family T) — tenant-scope the standalone has_role('admin') on the tenant_id-direct
-- business tables (26 tables total: 14 via the canonical Slice-1 template in Part 1, + 12 §18 grep-sweep
-- siblings in Part 2). No helper (tenant_id is on the row). Applied to prod as recorded migration
-- 20260721051711. §32 proof: Layer 1 fidelity = 0 residual bare-admin across all 30 altered policies;
-- Layer 2 behavioral = cross-tenant global admin DENIED, super_admin GRANTED, own-tenant admin GRANTED on
-- own tenant / DENIED cross-tenant, verified on all 4 shapes (P1 template, Shape A/B/C).
--
-- CANONICAL TEMPLATE (Slice-1 / businesses precedent):
--   operator escape = is_platform_owner()  (super_admin only)
--   tenant staff    = (tenant_id = current_user_tenant_id() AND has_role(<staff>))  — agency-aware &
--                     validated, so it neuters the global admin role's cross-tenant reach.
--
-- GROUNDING (§18): every table below has a tenant_id column (verified). deal_activities is the one
-- exception — no tenant_id; it reaches the tenant via deal_id → deals.tenant_id, so its admin policy is
-- scoped `has_role(admin) AND EXISTS(deals d WHERE d.id=deal_id AND d.tenant_id=current_user_tenant_id())`.
--
-- COACH HANDLING (differs from the finance cluster, deliberately): several policies OR the admin term
-- with an UNSCOPED `has_role('coach')` (a cross-tenant coach leak the compliance sweep flagged on
-- paige_coach_assignments). For those the whole staff role group is tenant-scoped by the template —
-- this TIGHTENS coach (pairs it with the active-tenant check), closing the leak; it is NOT a broadening
-- (§31 forbids broadening, not tightening). Where the coach term is already SELF-scoped
-- (paige_subagent_proposals `proposed_by=auth.uid()`, paige_workflow_runs `triggered_by_user_id=auth.uid()`)
-- that self-clause is preserved VERBATIM. is_platform_owner()/service_role/owner-self untouched.
--
-- DATA-SAFETY: near-empty pre-launch. (tasks is EXCLUDED — its tenant_id is NULL on all live rows, so
-- the tenant_id template dead-ends; it is a user_id-path table, handled separately via
-- tenant_staff_owns_user, and its NULL-tenant_id data issue is flagged to the owner.)

-- NULL-tenant_id NOTE (verifier caveat, RESOLVED): pipelines (3/9) and pipeline_stages (15/47) hold
-- NULL-tenant_id rows — verified to be is_default=true "Sales Pipeline" PLATFORM SEED templates (NULL by
-- design), not orphaned tenant data. Both tables ALSO carry a permissive `tenant_isolation` ALL policy
-- `(is_platform_owner() OR tenant_id IS NULL OR tenant_id = current_user_tenant_id())`; permissive policies
-- OR together, so the NULL defaults + own-tenant rows stay fully accessible to everyone via tenant_isolation.
-- Narrowing *_admin_all therefore removes ONLY the global admin's CROSS-tenant reach (other tenants' rows) —
-- zero access lost to the NULL seeds. (Two pre-existing, out-of-scope observations filed separately: the
-- *_coach_read standalone UNSCOPED coach cross-tenant SELECT, and tenant_isolation's role-less ALL write
-- grant — neither is the has_role('admin') bypass this slice narrows; §31 keeps this a pure admin-term fix.)

-- deals (tenant_id) — admin ALL
ALTER POLICY "deals_admin_all" ON public.deals
  USING (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)));

-- deal_activities (no tenant_id; via deal_id → deals.tenant_id) — admin ALL
ALTER POLICY "deal_activities_admin_all" ON public.deal_activities
  USING (public.is_platform_owner()
         OR (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
               SELECT 1 FROM public.deals d
               WHERE d.id = deal_activities.deal_id AND d.tenant_id = public.current_user_tenant_id())))
  WITH CHECK (public.is_platform_owner()
         OR (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
               SELECT 1 FROM public.deals d
               WHERE d.id = deal_activities.deal_id AND d.tenant_id = public.current_user_tenant_id())));

-- pipelines (tenant_id) — admin ALL
ALTER POLICY "pipelines_admin_all" ON public.pipelines
  USING (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)));

-- pipeline_stages (tenant_id) — admin ALL
ALTER POLICY "pipeline_stages_admin_all" ON public.pipeline_stages
  USING (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)));

-- email_templates (tenant_id) — admin insert/update/delete
ALTER POLICY "email_templates_delete_admin" ON public.email_templates
  USING (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)));
ALTER POLICY "email_templates_update_admin" ON public.email_templates
  USING (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)));
ALTER POLICY "email_templates_write_admin" ON public.email_templates
  WITH CHECK (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)));

-- email_send_log (tenant_id) — admin read
ALTER POLICY "Admins can read send log" ON public.email_send_log
  USING (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)));

-- invitations (tenant_id) — admin ALL
ALTER POLICY "Admins can manage all invitations" ON public.invitations
  USING (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)));

-- communications_consents (tenant_id) — admin OR super_admin read → operator escape + tenant admin
ALTER POLICY "comms_consents admin read" ON public.communications_consents
  USING (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)));

-- paige_approval_policies (tenant_id) — admin ALL + read-for-routing (admin OR coach; tenant-scope both)
ALTER POLICY "policies_admin_manage" ON public.paige_approval_policies
  USING (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)));
ALTER POLICY "policies_read_for_routing" ON public.paige_approval_policies
  USING ((active = true) AND (public.is_platform_owner()
          OR (tenant_id = public.current_user_tenant_id()
              AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'coach'::app_role)))));

-- paige_coach_assignments (tenant_id) — admin OR coach ALL (BOTH unscoped → tenant-scope both; closes leak)
ALTER POLICY "Admins and coaches write coach assignments" ON public.paige_coach_assignments
  USING (public.is_platform_owner()
         OR (tenant_id = public.current_user_tenant_id()
             AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'coach'::app_role))))
  WITH CHECK (public.is_platform_owner()
         OR (tenant_id = public.current_user_tenant_id()
             AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'coach'::app_role))));

-- paige_ingestion_proposals (tenant_id) — admin ALL
ALTER POLICY "Admins manage ingestion proposals" ON public.paige_ingestion_proposals
  USING (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)));

-- paige_subagent_factory_quota (tenant_id) — admin read
ALTER POLICY "admins read quota" ON public.paige_subagent_factory_quota
  USING (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)));

-- paige_subagent_proposals (tenant_id) — admin ALL + coaches-read-own (coach self-scope preserved verbatim)
ALTER POLICY "admins manage proposals" ON public.paige_subagent_proposals
  USING (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)));
ALTER POLICY "coaches read own proposals" ON public.paige_subagent_proposals
  USING (public.is_platform_owner()
         OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role))
         OR (has_role(auth.uid(), 'coach'::app_role) AND (proposed_by = auth.uid())));

-- paige_workflow_runs (tenant_id) — admin view + admin/coach insert (self-clause triggered_by preserved)
ALTER POLICY "Admins view all runs" ON public.paige_workflow_runs
  USING (public.is_platform_owner() OR (tenant_id = public.current_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role)));
ALTER POLICY "Admins and coaches insert runs" ON public.paige_workflow_runs
  WITH CHECK ((public.is_platform_owner()
               OR (tenant_id = public.current_user_tenant_id()
                   AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'coach'::app_role))))
              AND (triggered_by_user_id = auth.uid()));

-- =====================================================================================================
-- PART 2 — §18 grep-sweep folded-in siblings (compliance ITERATE). 12 more tenant_id-direct tables that
-- ALREADY carry a tenant term but leak via a BARE `OR has_role('admin')` disjunct (cross-tenant global
-- admin). Lower-risk than Part 1: the fix is a PURE NARROWING that swaps ONLY the bare admin disjunct for
-- the operator escape is_platform_owner(); the existing tenant term is preserved VERBATIM. These are the
-- tenant's most valuable surfaces (Studio deliverables, growth pages/funnels/forms, custom fields, the §8
-- action bus) — leaving them out would fix half the family (§18).
--
-- SHAPE A — role-less tenant term `(tenant_id=current OR has_role(admin))`: the tenant term already grants
-- own-tenant access (no role gate); the bare admin is the only cross-tenant bypass → drop it, add operator
-- escape. Result: `(tenant_id=current OR is_platform_owner())`. Own-tenant users unchanged; global admin
-- of another tenant DENIED; super_admin keeps cross-tenant via is_platform_owner().

-- growth_pages
ALTER POLICY "growth_pages_tenant_manage" ON public.growth_pages
  USING ((tenant_id = public.current_user_tenant_id()) OR public.is_platform_owner())
  WITH CHECK ((tenant_id = public.current_user_tenant_id()) OR public.is_platform_owner());
-- growth_funnels
ALTER POLICY "growth_funnels_tenant_manage" ON public.growth_funnels
  USING ((tenant_id = public.current_user_tenant_id()) OR public.is_platform_owner())
  WITH CHECK ((tenant_id = public.current_user_tenant_id()) OR public.is_platform_owner());
-- growth_funnel_steps
ALTER POLICY "growth_funnel_steps_tenant_manage" ON public.growth_funnel_steps
  USING ((tenant_id = public.current_user_tenant_id()) OR public.is_platform_owner())
  WITH CHECK ((tenant_id = public.current_user_tenant_id()) OR public.is_platform_owner());
-- growth_forms
ALTER POLICY "growth_forms_tenant_manage" ON public.growth_forms
  USING ((tenant_id = public.current_user_tenant_id()) OR public.is_platform_owner())
  WITH CHECK ((tenant_id = public.current_user_tenant_id()) OR public.is_platform_owner());
-- growth_external_sources
ALTER POLICY "growth_external_sources_tenant_manage" ON public.growth_external_sources
  USING ((tenant_id = public.current_user_tenant_id()) OR public.is_platform_owner())
  WITH CHECK ((tenant_id = public.current_user_tenant_id()) OR public.is_platform_owner());
-- custom_field_definitions
ALTER POLICY "custom_field_definitions_tenant_manage" ON public.custom_field_definitions
  USING ((tenant_id = public.current_user_tenant_id()) OR public.is_platform_owner())
  WITH CHECK ((tenant_id = public.current_user_tenant_id()) OR public.is_platform_owner());
-- client_custom_field_values
ALTER POLICY "client_custom_field_values_tenant_manage" ON public.client_custom_field_values
  USING ((tenant_id = public.current_user_tenant_id()) OR public.is_platform_owner())
  WITH CHECK ((tenant_id = public.current_user_tenant_id()) OR public.is_platform_owner());

-- SHAPE C — role-less tenant term with TWO bare role disjuncts `(tenant_id=current OR has_role(admin) OR
-- has_role(coach))`: both bare roles are cross-tenant bypasses; the tenant term already covers own-tenant
-- staff → collapse both to the operator escape. Result: `(tenant_id=current OR is_platform_owner())`.
-- growth_funnel_sessions (SELECT)
ALTER POLICY "growth_funnel_sessions_tenant_read" ON public.growth_funnel_sessions
  USING ((tenant_id = public.current_user_tenant_id()) OR public.is_platform_owner());

-- SHAPE B — role-GATED tenant term with a TRAILING bare admin
-- `((tenant_id=current AND has_any_role[admin,super_admin,coach]) OR has_role(admin))`: the first disjunct
-- is the legitimate own-tenant staff grant (preserved VERBATIM); the trailing bare `OR has_role(admin)` is
-- the cross-tenant bypass → drop it, add operator escape. Result keeps own-tenant staff, adds super_admin
-- cross-tenant via is_platform_owner(), denies cross-tenant global admin.

-- marketing_content (ALL)
ALTER POLICY "marketing_content_tenant_manage" ON public.marketing_content
  USING (((tenant_id = public.current_user_tenant_id()) AND has_any_role(auth.uid(), ARRAY['admin'::text, 'super_admin'::text, 'coach'::text])) OR public.is_platform_owner())
  WITH CHECK (((tenant_id = public.current_user_tenant_id()) AND has_any_role(auth.uid(), ARRAY['admin'::text, 'super_admin'::text, 'coach'::text])) OR public.is_platform_owner());
-- studio_deliverable (ALL)
ALTER POLICY "studio_deliverable_tenant_manage" ON public.studio_deliverable
  USING (((tenant_id = public.current_user_tenant_id()) AND has_any_role(auth.uid(), ARRAY['admin'::text, 'super_admin'::text, 'coach'::text])) OR public.is_platform_owner())
  WITH CHECK (((tenant_id = public.current_user_tenant_id()) AND has_any_role(auth.uid(), ARRAY['admin'::text, 'super_admin'::text, 'coach'::text])) OR public.is_platform_owner());
-- studio_library_items (ALL)
ALTER POLICY "studio_library_items_tenant_manage" ON public.studio_library_items
  USING (((tenant_id = public.current_user_tenant_id()) AND has_any_role(auth.uid(), ARRAY['admin'::text, 'super_admin'::text, 'coach'::text])) OR public.is_platform_owner())
  WITH CHECK (((tenant_id = public.current_user_tenant_id()) AND has_any_role(auth.uid(), ARRAY['admin'::text, 'super_admin'::text, 'coach'::text])) OR public.is_platform_owner());
-- paige_actions (SELECT) — §8 action bus
ALTER POLICY "pa_tenant_staff_read" ON public.paige_actions
  USING (((tenant_id = public.current_user_tenant_id()) AND has_any_role(auth.uid(), ARRAY['admin'::text, 'super_admin'::text, 'coach'::text])) OR public.is_platform_owner());
