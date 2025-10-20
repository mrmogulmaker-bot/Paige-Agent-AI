-- Add document upload feature flag to subscription plans
ALTER TABLE public.subscription_plans
ADD COLUMN IF NOT EXISTS has_document_upload boolean NOT NULL DEFAULT false;

-- Update Professional and above plans to have document upload access
UPDATE public.subscription_plans
SET has_document_upload = true
WHERE slug IN ('professional', 'premium', 'enterprise');