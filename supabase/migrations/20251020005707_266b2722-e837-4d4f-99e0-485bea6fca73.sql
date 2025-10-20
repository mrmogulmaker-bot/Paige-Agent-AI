-- Add separate flags for personal and business document uploads
ALTER TABLE public.subscription_plans
ADD COLUMN IF NOT EXISTS has_personal_document_upload boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS has_business_document_upload boolean NOT NULL DEFAULT false;

-- Enable personal document upload on Starter and above
UPDATE public.subscription_plans
SET has_personal_document_upload = true
WHERE slug IN ('starter', 'professional', 'premium', 'enterprise');

-- Enable business document upload on Professional and above
UPDATE public.subscription_plans
SET has_business_document_upload = true
WHERE slug IN ('professional', 'premium', 'enterprise');

-- Update the old has_document_upload flag to match business documents for compatibility
UPDATE public.subscription_plans
SET has_document_upload = has_business_document_upload;