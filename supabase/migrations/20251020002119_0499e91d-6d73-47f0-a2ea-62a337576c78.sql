
-- Update Starter plan ($47/month) - BUILD Personal program
UPDATE subscription_plans
SET 
  features = jsonb_build_array(
    'Personal credit monitoring',
    '5 disputes/month',
    'A.C.C.E.L. Framework access',
    'B.U.I.L.D. Personal program',
    'Paige AI coaching',
    'Email support',
    'Credit score tracking'
  ),
  has_business_credit = false,
  has_funding_tools = false,
  updated_at = now()
WHERE slug = 'starter';

-- Update Professional plan ($97/month) - BUILD Business program + Funding marketplace
UPDATE subscription_plans
SET 
  features = jsonb_build_array(
    'Everything in Starter',
    'Unlimited disputes',
    'Business credit building',
    'B.U.I.L.D. Business program',
    'Funding marketplace access',
    'Priority AI coaching',
    'Priority support',
    'Fundability assessment'
  ),
  has_business_credit = true,
  has_funding_tools = true,
  updated_at = now()
WHERE slug = 'professional';

-- Update Premium plan ($197/month) - High-level funding marketplace
UPDATE subscription_plans
SET 
  features = jsonb_build_array(
    'Everything in Professional',
    'Premium funding marketplace',
    'Advanced analytics',
    'Custom funding strategies',
    'Dedicated account manager',
    'Monthly strategy sessions',
    'Priority lender matching'
  ),
  has_business_credit = true,
  has_funding_tools = true,
  updated_at = now()
WHERE slug = 'premium';

-- Update Enterprise plan ($497/month) - Enhanced with UCC access
UPDATE subscription_plans
SET 
  features = jsonb_build_array(
    'Everything in Premium',
    '3M Framework',
    'Dedicated success manager',
    'White-glove service',
    'Team collaboration',
    'Personalized training',
    'UCC legal framework access'
  ),
  has_business_credit = true,
  has_funding_tools = true,
  updated_at = now()
WHERE slug = 'enterprise';
