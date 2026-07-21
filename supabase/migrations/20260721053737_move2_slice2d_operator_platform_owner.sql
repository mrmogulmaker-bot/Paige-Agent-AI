-- Move 2 · Slice 2d (Family O — operator platform-internal) — narrow the standalone has_role('admin')
-- MANAGE/READ bypass to is_platform_owner() (super_admin operator ONLY) on platform-operator infrastructure
-- tables. These have NO tenant_id and NO per-tenant/per-user ownership that the admin policy respects —
-- they are the operator layer (§9 "us"): platform settings, billing/stripe logs, webhooks, API keys,
-- security logs, AI-quality logs, the operator KB/RAG/LMS catalog, platform connectors. A tenant admin
-- must never manage these; only the super_admin operator. Same pattern as F5 (operator catalog).
--
-- §9 CLASSIFICATION (compliance to challenge): the following are TODAY platform-level (no tenant column),
-- so is_platform_owner() is the correct current-schema call — flagged for the crew to confirm none is
-- actually tenant-authored data missing its scoping column: courses, lessons, knowledge_base (operator
-- catalog, distinct from the per-tenant KB tables), paige_mcp_connections, paige_n8n_connections
-- (platform connectors; per-tenant registry is future #131/#64), build_milestones (platform build catalog,
-- no user/tenant col), paige_social_posts (flagged schema-gap: no tenant col — operator until per-tenant).
--
-- legal_documents / platform_metered_events_dead_letter carry `admin OR super_admin`; is_platform_owner()
-- (= super_admin) folds the super_admin term and drops plain admin — no super_admin regression.
--
-- EXCLUDED (not this slice): rag_documents (a published-doc READ-visibility policy with self+staff terms,
-- not an operator-management bypass), analytics_events (a RESTRICTIVE block-policy + governance → Slice 2f),
-- the broker cluster (#393 → Slice 2e), the governance set (profiles/audit_logs/support_*/feature_* → 2f),
-- and the already-filed #390/#391/#392 deferrals.
--
-- DATA-SAFETY: operator infrastructure, near-empty pre-launch; narrowing removes tenant-admin write/read of
-- platform internals (the §9 correction) and loses no tenant data (there is none on these tables).

-- ===== SELECT-only admin reads → is_platform_owner() =====
ALTER POLICY "Admins can read app settings" ON public.admin_app_settings USING (public.is_platform_owner());
ALTER POLICY "Admins can view all modification logs" ON public.account_modifications USING (public.is_platform_owner());
ALTER POLICY "corp entities admin read" ON public.corporate_entity_registry USING (public.is_platform_owner());
ALTER POLICY "Admins read bridge auth failures" ON public.paige_bridge_auth_failures USING (public.is_platform_owner());
ALTER POLICY "Admins can read retrieval log" ON public.rag_retrieval_log USING (public.is_platform_owner());
ALTER POLICY "security_canary_runs_admin_read" ON public.security_canary_runs USING (public.is_platform_owner());
ALTER POLICY "admins read stripe_event_log" ON public.stripe_event_log USING (public.is_platform_owner());
ALTER POLICY "Admins can view webhook logs" ON public.webhook_event_log USING (public.is_platform_owner());
ALTER POLICY "admins read dead letter" ON public.platform_metered_events_dead_letter USING (public.is_platform_owner());
ALTER POLICY "Admins can view all applications" ON public.affiliate_applications USING (public.is_platform_owner());

-- ===== INSERT admin checks → is_platform_owner() =====
-- webhook_event_log INSERT: narrowed — verified every real inserter uses SERVICE_ROLE (RLS-bypassing:
-- handle-inbound-webhook / fire-outbound-webhooks / handle-paige-plaid-webhook), so no plain-admin JWT
-- insert path exists; narrowing breaks nothing.
ALTER POLICY "Service can insert webhook logs" ON public.webhook_event_log WITH CHECK (public.is_platform_owner());
-- DELIBERATELY NOT NARROWED (§13 — verifier-flagged live browser-JWT write paths): the INSERT policies on
-- extraction_quality_log ("Admins can insert quality logs", written by useClientChatContext.ts:578) and
-- response_quality_feedback ("Admins can insert feedback", written by ResponseFeedback.tsx) run under the
-- active user's JWT during normal app use. These no-tenant telemetry tables have NO cross-tenant dimension
-- for Move 2 to close, and narrowing their INSERT to super_admin-only would SILENTLY break telemetry
-- capture for the 8 admins currently writing. Their operator-READ ("view all") + UPDATE are still narrowed
-- below (only the operator reads/edits all telemetry). The mis-scoped admin-gated INSERT (should be a
-- service-role/authenticated write) is a separate design fix, filed as a follow-up — NOT a Move-2 bypass.

-- ===== UPDATE / DELETE admin → is_platform_owner() =====
ALTER POLICY "Admins can update applications" ON public.affiliate_applications
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "Admins can update quality logs" ON public.extraction_quality_log USING (public.is_platform_owner());
ALTER POLICY "Admins can view all quality logs" ON public.extraction_quality_log USING (public.is_platform_owner());
ALTER POLICY "Admins can update feedback" ON public.response_quality_feedback USING (public.is_platform_owner());
ALTER POLICY "Admins can view all feedback" ON public.response_quality_feedback USING (public.is_platform_owner());
ALTER POLICY "Admins can delete elite waitlist" ON public.elite_waitlist USING (public.is_platform_owner());
ALTER POLICY "Admins can update elite waitlist" ON public.elite_waitlist USING (public.is_platform_owner());
ALTER POLICY "Admins can view elite waitlist" ON public.elite_waitlist USING (public.is_platform_owner());

-- ===== ALL (manage) admin → is_platform_owner() (USING + WITH CHECK) =====
ALTER POLICY "Admins can write app settings" ON public.admin_app_settings
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "build_milestones admin manage" ON public.build_milestones
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "Admins can manage courses" ON public.courses
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "Admins can manage lessons" ON public.lessons
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "Admins can manage knowledge base" ON public.knowledge_base
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "legal_documents admin write" ON public.legal_documents
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "Admins can manage outbound webhooks" ON public.outbound_webhook_configs
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "admins manage mcp connections" ON public.paige_mcp_connections
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "admins manage n8n connections" ON public.paige_n8n_connections
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "Admins manage social posts" ON public.paige_social_posts
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "admins manage telegram config" ON public.paige_telegram_config
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "Admins can manage API keys" ON public.platform_api_keys
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "Admins manage product mappings" ON public.stripe_product_mappings
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
