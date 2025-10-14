-- Drop existing policies and triggers to recreate them properly
DROP TRIGGER IF EXISTS trigger_log_profile_pii_access ON public.profiles;
DROP TRIGGER IF EXISTS trigger_log_credit_verification_pii_access ON public.credit_report_verifications;
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.pii_access_log;
DROP POLICY IF EXISTS "Users can view their own access logs" ON public.pii_access_log;

-- Recreate the policies
CREATE POLICY "Service role can insert audit logs"
ON public.pii_access_log
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Users can view their own access logs"
ON public.pii_access_log
FOR SELECT
USING (accessed_user_id = auth.uid() OR accessor_user_id = auth.uid());

-- Recreate the triggers
CREATE TRIGGER trigger_log_profile_pii_access
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.log_profile_pii_access();

CREATE TRIGGER trigger_log_credit_verification_pii_access
AFTER UPDATE ON public.credit_report_verifications
FOR EACH ROW
EXECUTE FUNCTION public.log_credit_verification_pii_access();