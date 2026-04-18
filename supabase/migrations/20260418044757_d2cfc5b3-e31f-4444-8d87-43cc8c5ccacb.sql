-- Tier rebrand for the funding-intelligence repositioning
-- Spec: paige_repositioning_spec.md §6

-- Free trial → Free (display name only)
UPDATE public.subscription_plans
SET name = 'Free',
    features = '["Personal three-bureau snapshot (weekly)", "Basic credit factor overview", "5 Paige messages/day", "Funding education library"]'::jsonb,
    dispute_limit = 0,
    updated_at = now()
WHERE slug = 'free';

-- Starter: $47 → $49 + new feature framing
UPDATE public.subscription_plans
SET name = 'Starter',
    price = 49,
    features = '["Daily personal credit monitoring", "Business credit (D&B / Experian Biz / Equifax Biz)", "Funding Readiness Score", "Funding product eligibility matrix", "Credit to funding impact translator", "Personal/business separation audit", "Full Paige AI access (text + voice)", "Email support"]'::jsonb,
    dispute_limit = 0,
    has_business_credit = true,
    has_funding_tools = true,
    updated_at = now()
WHERE slug = 'starter';

-- Professional → Growth: $97 → $149
UPDATE public.subscription_plans
SET name = 'Growth',
    price = 149,
    features = '["Everything in Starter", "Business banking integration (Plaid)", "SBA loan evaluator", "Document prep assistant", "Lender marketplace access", "Priority Paige AI", "Priority support"]'::jsonb,
    dispute_limit = 0,
    has_business_credit = true,
    has_funding_tools = true,
    updated_at = now()
WHERE slug = 'professional';

-- Premium → Scale: $197 → $397
UPDATE public.subscription_plans
SET name = 'Scale',
    price = 397,
    features = '["Everything in Growth", "Priority lender placement", "Dedicated funding advisor", "Monthly funding strategy session", "Advanced funding analytics"]'::jsonb,
    dispute_limit = 0,
    has_business_credit = true,
    has_funding_tools = true,
    updated_at = now()
WHERE slug = 'premium';

-- Enterprise: keep the slug, refresh framing
UPDATE public.subscription_plans
SET name = 'Enterprise',
    features = '["Everything in Scale", "Custom funding desk integration", "Dedicated success manager", "White-glove service", "Team collaboration", "Personalized training", "Custom contracts and SLAs"]'::jsonb,
    dispute_limit = 0,
    has_business_credit = true,
    has_funding_tools = true,
    updated_at = now()
WHERE slug = 'enterprise';

-- New Broker tier
INSERT INTO public.subscription_plans (
  slug, name, price, features,
  dispute_limit, ai_chat_limit,
  has_business_credit, has_funding_tools,
  has_document_upload, has_personal_document_upload, has_business_document_upload
)
VALUES (
  'broker', 'Broker', 497,
  '["Everything in Growth", "Multi-client dashboard", "Unlimited active client seats", "White-label client portal", "Affiliate commission tracking", "GHL pipeline integration", "Multi-client Paige AI"]'::jsonb,
  0, NULL,
  true, true, true, true, true
)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    price = EXCLUDED.price,
    features = EXCLUDED.features,
    has_business_credit = EXCLUDED.has_business_credit,
    has_funding_tools = EXCLUDED.has_funding_tools,
    updated_at = now();