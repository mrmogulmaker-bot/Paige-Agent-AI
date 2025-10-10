-- Create credit report verification tracking table
CREATE TABLE public.credit_report_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Verification status per bureau
  experian_verified BOOLEAN DEFAULT false,
  equifax_verified BOOLEAN DEFAULT false,
  transunion_verified BOOLEAN DEFAULT false,
  
  -- API integration metadata
  experian_api_user_id TEXT,
  equifax_api_user_id TEXT,
  transunion_api_user_id TEXT,
  
  -- Last verification attempts
  experian_verified_at TIMESTAMP WITH TIME ZONE,
  equifax_verified_at TIMESTAMP WITH TIME ZONE,
  transunion_verified_at TIMESTAMP WITH TIME ZONE,
  
  -- Verification expiry (APIs often require re-verification after 30-90 days)
  experian_expires_at TIMESTAMP WITH TIME ZONE,
  equifax_expires_at TIMESTAMP WITH TIME ZONE,
  transunion_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- KBA (Knowledge-Based Authentication) status
  kba_completed BOOLEAN DEFAULT false,
  kba_attempts INTEGER DEFAULT 0,
  kba_last_attempt_at TIMESTAMP WITH TIME ZONE,
  
  -- Personal info for verification
  ssn_last_4 TEXT,
  date_of_birth DATE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.credit_report_verifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own verification status
CREATE POLICY "Users can view own verification status"
  ON public.credit_report_verifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own verification record
CREATE POLICY "Users can create own verification"
  ON public.credit_report_verifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own verification
CREATE POLICY "Users can update own verification"
  ON public.credit_report_verifications
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_credit_report_verifications_updated_at
  BEFORE UPDATE ON public.credit_report_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_credit_verifications_user_id ON public.credit_report_verifications(user_id);