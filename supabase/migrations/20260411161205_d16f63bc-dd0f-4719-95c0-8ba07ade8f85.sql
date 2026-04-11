
-- ============================================================
-- FIX 1: Replace current_setting('role') with auth.role()
-- ============================================================

-- 1. data_deletion_requests
DROP POLICY IF EXISTS "Service role can manage deletion requests" ON public.data_deletion_requests;
CREATE POLICY "Service role can manage deletion requests" ON public.data_deletion_requests FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 2. financial_api_logs
DROP POLICY IF EXISTS "Service role can manage API logs" ON public.financial_api_logs;
CREATE POLICY "Service role can manage API logs" ON public.financial_api_logs FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 3. funding_matches
DROP POLICY IF EXISTS "Service role can manage matches" ON public.funding_matches;
CREATE POLICY "Service role can manage matches" ON public.funding_matches FOR ALL TO authenticated USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 4. credit_negative_items
DROP POLICY IF EXISTS "Service role manages negative items" ON public.credit_negative_items;
CREATE POLICY "Service role manages negative items" ON public.credit_negative_items FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 5. plaid_transactions
DROP POLICY IF EXISTS "Service role can manage transactions" ON public.plaid_transactions;
CREATE POLICY "Service role can manage transactions" ON public.plaid_transactions FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 6. plaid_webhook_events
DROP POLICY IF EXISTS "Service role can manage webhook events" ON public.plaid_webhook_events;
CREATE POLICY "Service role can manage webhook events" ON public.plaid_webhook_events FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 7. credit_utilization_snapshots
DROP POLICY IF EXISTS "Service role manages utilization" ON public.credit_utilization_snapshots;
CREATE POLICY "Service role manages utilization" ON public.credit_utilization_snapshots FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 8. plaid_notifications
DROP POLICY IF EXISTS "Service role can manage notifications" ON public.plaid_notifications;
CREATE POLICY "Service role can manage notifications" ON public.plaid_notifications FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 9. consent_events
DROP POLICY IF EXISTS "Service role can manage consent events" ON public.consent_events;
CREATE POLICY "Service role can manage consent events" ON public.consent_events FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 10. funding_projections
DROP POLICY IF EXISTS "Service role manages projections" ON public.funding_projections;
CREATE POLICY "Service role manages projections" ON public.funding_projections FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 11. balance_snapshots
DROP POLICY IF EXISTS "Service role can manage snapshots" ON public.balance_snapshots;
CREATE POLICY "Service role can manage snapshots" ON public.balance_snapshots FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 12. credit_factor_scores
DROP POLICY IF EXISTS "Service role manages factor scores" ON public.credit_factor_scores;
CREATE POLICY "Service role manages factor scores" ON public.credit_factor_scores FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 13. build_scores
DROP POLICY IF EXISTS "Service role can manage BUILD scores" ON public.build_scores;
CREATE POLICY "Service role can manage BUILD scores" ON public.build_scores FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 14. funding_application_sequence
DROP POLICY IF EXISTS "Service role manages sequences" ON public.funding_application_sequence;
CREATE POLICY "Service role manages sequences" ON public.funding_application_sequence FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 15. user_funding_matches
DROP POLICY IF EXISTS "Service role manages funding matches" ON public.user_funding_matches;
CREATE POLICY "Service role manages funding matches" ON public.user_funding_matches FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 16. financial_kpis
DROP POLICY IF EXISTS "Service role can manage KPIs" ON public.financial_kpis;
CREATE POLICY "Service role can manage KPIs" ON public.financial_kpis FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 17. referral_conversions
DROP POLICY IF EXISTS "System can insert conversions" ON public.referral_conversions;
CREATE POLICY "System can insert conversions" ON public.referral_conversions FOR INSERT TO public WITH CHECK (auth.role() = 'service_role');

-- 18. funding_readiness_scores
DROP POLICY IF EXISTS "Service role can manage funding readiness scores" ON public.funding_readiness_scores;
CREATE POLICY "Service role can manage funding readiness scores" ON public.funding_readiness_scores FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 19. compliance_checkpoints
DROP POLICY IF EXISTS "Service role can manage checkpoints" ON public.compliance_checkpoints;
CREATE POLICY "Service role can manage checkpoints" ON public.compliance_checkpoints FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 20. credit_inquiries
DROP POLICY IF EXISTS "Service role manages inquiries" ON public.credit_inquiries;
CREATE POLICY "Service role manages inquiries" ON public.credit_inquiries FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 21. voice_command_logs
DROP POLICY IF EXISTS "Service role can insert command logs" ON public.voice_command_logs;
CREATE POLICY "Service role can insert command logs" ON public.voice_command_logs FOR INSERT TO public WITH CHECK (auth.role() = 'service_role');

-- 22. pii_access_log
DROP POLICY IF EXISTS "Service role can manage all audit logs" ON public.pii_access_log;
CREATE POLICY "Service role can manage all audit logs" ON public.pii_access_log FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 23. api_rate_limits
DROP POLICY IF EXISTS "Service role manages rate limits" ON public.api_rate_limits;
CREATE POLICY "Service role manages rate limits" ON public.api_rate_limits FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 24. chat_messages
DROP POLICY IF EXISTS "Service role can manage chat messages" ON public.chat_messages;
CREATE POLICY "Service role can manage chat messages" ON public.chat_messages FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 25. course_certificates
DROP POLICY IF EXISTS "Service role can issue certificates" ON public.course_certificates;
CREATE POLICY "Service role can issue certificates" ON public.course_certificates FOR INSERT TO public WITH CHECK (auth.role() = 'service_role');

-- 26. notifications
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
CREATE POLICY "Service role can insert notifications" ON public.notifications FOR INSERT TO public WITH CHECK (auth.role() = 'service_role');

-- 27. conversation_context
DROP POLICY IF EXISTS "Service role can manage context" ON public.conversation_context;
CREATE POLICY "Service role can manage context" ON public.conversation_context FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 28. lender_research_results
DROP POLICY IF EXISTS "Service role can manage all research" ON public.lender_research_results;
CREATE POLICY "Service role can manage all research" ON public.lender_research_results FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- FIX 3: Credit report upload policy hardening
-- ============================================================

-- Drop and recreate coach INSERT policy with uploaded_by enforcement
DROP POLICY IF EXISTS "Coaches can create client report uploads" ON public.credit_report_uploads;
CREATE POLICY "Coaches can create client report uploads" ON public.credit_report_uploads FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM coach_clients cc
    WHERE cc.coach_user_id = auth.uid()
      AND cc.client_user_id = credit_report_uploads.user_id
      AND cc.status = 'active'
  )
);

-- Drop and recreate admin ALL policy with uploaded_by enforcement on inserts
DROP POLICY IF EXISTS "Admins can manage all report uploads" ON public.credit_report_uploads;
CREATE POLICY "Admins can manage all report uploads" ON public.credit_report_uploads FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND uploaded_by = auth.uid());

-- Add user INSERT policy for consumer portal
CREATE POLICY "Users can upload own credit reports" ON public.credit_report_uploads FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND uploaded_by = auth.uid());
