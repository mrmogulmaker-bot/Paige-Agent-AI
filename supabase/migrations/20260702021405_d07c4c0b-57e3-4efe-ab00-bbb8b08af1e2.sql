
DROP POLICY IF EXISTS "Coaches can view client profiles" ON public.profiles;

CREATE OR REPLACE VIEW public.coach_client_profiles_safe
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.user_id,
  p.full_name,
  p.avatar_url,
  p.pme_phase,
  p.dashboard_mode,
  p.onboarding_completed,
  p.onboarding_step,
  p.intake_completed,
  p.intake_completed_at,
  p.primary_goal,
  p.primary_goal_category,
  p.goal_timeline,
  p.experience_level,
  p.is_complimentary,
  p.has_broker_access,
  p.active_tenant_id,
  p.business_name,
  p.work_email,
  p.website_url,
  p.staff_notes,
  p.created_at,
  p.updated_at
FROM public.profiles p
WHERE EXISTS (
  SELECT 1
  FROM public.coach_clients cc
  WHERE cc.coach_user_id = auth.uid()
    AND cc.client_user_id = p.user_id
    AND cc.status = 'active'
)
OR public.has_role(auth.uid(), 'admin'::app_role)
OR p.user_id = auth.uid();

GRANT SELECT ON public.coach_client_profiles_safe TO authenticated;
GRANT ALL ON public.coach_client_profiles_safe TO service_role;

COMMENT ON VIEW public.coach_client_profiles_safe IS
  'Non-sensitive profile projection for coach dashboards. Sensitive PII (SSN, DOB, address, phone, FICO, intake_responses, demographic fields) must be accessed through the audited get_profile_with_pii_log RPC.';
