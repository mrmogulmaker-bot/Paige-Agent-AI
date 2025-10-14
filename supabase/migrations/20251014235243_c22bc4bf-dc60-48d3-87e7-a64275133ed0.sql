-- Create audit logging table for PII access
CREATE TABLE IF NOT EXISTS public.pii_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accessed_user_id uuid NOT NULL,
  accessor_user_id uuid NOT NULL,
  table_name text NOT NULL,
  field_names text[] NOT NULL,
  access_type text NOT NULL CHECK (access_type IN ('read', 'update')),
  accessed_at timestamptz DEFAULT now(),
  ip_address inet,
  user_agent text
);

-- Enable RLS on audit log
ALTER TABLE public.pii_access_log ENABLE ROW LEVEL SECURITY;

-- Only allow service role to write to audit log
CREATE POLICY "Service role can insert audit logs"
ON public.pii_access_log
FOR INSERT
TO service_role
WITH CHECK (true);

-- Users can only view their own access logs
CREATE POLICY "Users can view their own access logs"
ON public.pii_access_log
FOR SELECT
USING (accessed_user_id = auth.uid() OR accessor_user_id = auth.uid());

-- Create index for efficient lookups
CREATE INDEX idx_pii_access_log_accessed_user ON public.pii_access_log(accessed_user_id, accessed_at DESC);
CREATE INDEX idx_pii_access_log_accessor_user ON public.pii_access_log(accessor_user_id, accessed_at DESC);

-- Create trigger function to log PII access on profiles table
CREATE OR REPLACE FUNCTION public.log_profile_pii_access()
RETURNS TRIGGER AS $$
BEGIN
  -- Log when sensitive PII fields are accessed via UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- Check if any sensitive fields were modified
    IF (OLD.ssn_encrypted IS DISTINCT FROM NEW.ssn_encrypted) OR
       (OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth) OR
       (OLD.ssn_last_4 IS DISTINCT FROM NEW.ssn_last_4) THEN
      
      INSERT INTO public.pii_access_log (
        accessed_user_id,
        accessor_user_id,
        table_name,
        field_names,
        access_type
      ) VALUES (
        NEW.user_id,
        auth.uid(),
        'profiles',
        ARRAY['ssn_encrypted', 'date_of_birth', 'ssn_last_4'],
        'update'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Attach trigger to profiles table
DROP TRIGGER IF EXISTS trigger_log_profile_pii_access ON public.profiles;
CREATE TRIGGER trigger_log_profile_pii_access
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.log_profile_pii_access();

-- Create trigger function to log PII access on credit_report_verifications table
CREATE OR REPLACE FUNCTION public.log_credit_verification_pii_access()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Check if any sensitive fields were modified
    IF (OLD.ssn_last_4 IS DISTINCT FROM NEW.ssn_last_4) OR
       (OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth) OR
       (OLD.experian_api_user_id IS DISTINCT FROM NEW.experian_api_user_id) OR
       (OLD.equifax_api_user_id IS DISTINCT FROM NEW.equifax_api_user_id) OR
       (OLD.transunion_api_user_id IS DISTINCT FROM NEW.transunion_api_user_id) THEN
      
      INSERT INTO public.pii_access_log (
        accessed_user_id,
        accessor_user_id,
        table_name,
        field_names,
        access_type
      ) VALUES (
        NEW.user_id,
        auth.uid(),
        'credit_report_verifications',
        ARRAY['ssn_last_4', 'date_of_birth', 'bureau_api_user_ids'],
        'update'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Attach trigger to credit_report_verifications table
DROP TRIGGER IF EXISTS trigger_log_credit_verification_pii_access ON public.credit_report_verifications;
CREATE TRIGGER trigger_log_credit_verification_pii_access
AFTER UPDATE ON public.credit_report_verifications
FOR EACH ROW
EXECUTE FUNCTION public.log_credit_verification_pii_access();