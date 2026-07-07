-- Seed the master tenant's email branding as DATA (Doctrine §200).
--
-- The auth-email engine reads tenants.brand to fill the generic email shell.
-- MMA's navy/gold/"Mogul Maker Academy" identity lives here as one tenant's
-- row — NOT in platform code. Any other tenant sets its own brand the same way
-- (via update_tenant_branding); an unset tenant gets the neutral platform
-- default. Shallow-merged into existing brand so no other keys are clobbered.

UPDATE public.tenants
SET brand = COALESCE(brand, '{}'::jsonb) || jsonb_build_object(
  'brand_name',      'Paige',
  'display_name',    'Paige',
  'wordmark',        'PAIGE',
  'tagline',         'Mogul Maker Academy',
  'primary_color',   '#0a1628',
  'accent_color',    '#CFAE70',
  'on_accent_color', '#0a1628',
  'bg_color',        '#F5F2EC',
  'site_url',        'https://paigeagent.ai',
  'support_email',   'support@paigeagent.ai'
)
WHERE slug = 'mma';
