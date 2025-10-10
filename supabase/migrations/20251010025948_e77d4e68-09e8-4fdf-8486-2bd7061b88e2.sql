-- Add SSN and DOB fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS ssn_encrypted TEXT,
ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Note: SSN will be stored encrypted, only last 4 shown in UI