UPDATE public.subscription_plans
SET has_business_credit = true,
    has_funding_tools = true,
    has_document_upload = true,
    has_personal_document_upload = true,
    has_business_document_upload = true,
    dispute_limit = NULL
WHERE slug IN ('free', 'starter', 'professional', 'premium', 'enterprise');