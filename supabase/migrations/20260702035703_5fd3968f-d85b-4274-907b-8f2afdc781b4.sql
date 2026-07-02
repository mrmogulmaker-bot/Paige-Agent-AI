
CREATE TABLE public.corporate_entity_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  legal_name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  state_of_formation TEXT NOT NULL,
  role TEXT NOT NULL,
  parent_slug TEXT,
  ip_licensor_slug TEXT,
  lane TEXT,
  lane_separated BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.corporate_entity_registry IS 'Portfolio corporate structure. Referenced by tenant_entity_relationships (§202) and public legal disclosures.';
GRANT SELECT ON public.corporate_entity_registry TO anon, authenticated;
GRANT ALL ON public.corporate_entity_registry TO service_role;
ALTER TABLE public.corporate_entity_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corp entities public read"
  ON public.corporate_entity_registry FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "corp entities service manage"
  ON public.corporate_entity_registry FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.corporate_entity_registry
  (slug, legal_name, entity_type, state_of_formation, role, parent_slug, ip_licensor_slug, lane, lane_separated, notes) VALUES
  ('givalli_heritage_holdings', 'Givalli Heritage Holdings Inc.', 'C-Corp', 'Delaware', 'parent', NULL, NULL, NULL, false, 'Portfolio parent'),
  ('aedis_brands', 'Aedis Brands LLC', 'LLC', 'Wyoming', 'ip_holder', 'givalli_heritage_holdings', NULL, NULL, false, 'IP holder; licenses marks/tech to operating subs'),
  ('paigeagent_ai', 'PaigeAgent AI LLC', 'LLC', 'Wyoming', 'platform', 'givalli_heritage_holdings', 'aedis_brands', 'paige', false, 'Platform entity for Paige Agent AI'),
  ('project_mogul_enterprise', 'Project Mogul Enterprise LLC', 'LLC', 'Wyoming', 'operating', 'givalli_heritage_holdings', 'aedis_brands', 'pme', false, 'Runs BTF $4,997 flagship'),
  ('mogul_maker_academy', 'Mogul Maker Academy LLC', 'LLC', 'Wyoming', 'operating', 'givalli_heritage_holdings', 'aedis_brands', 'mma', false, 'Education only'),
  ('mogul_credit_consulting', 'Mogul Credit Consulting LLC', 'LLC', 'Wyoming', 'operating', 'givalli_heritage_holdings', 'aedis_brands', 'mcc', true, 'CROA-regulated — LANE SEPARATED'),
  ('treasury_media_group', 'Treasury Media Group LLC', 'LLC', 'Wyoming', 'operating', 'givalli_heritage_holdings', 'aedis_brands', 'tmg', false, NULL),
  ('givalli_capital', 'Givalli Capital LLC', 'LLC', 'Wyoming', 'operating', 'givalli_heritage_holdings', 'aedis_brands', 'givalli_cap', false, NULL),
  ('mr_mogul_maker', 'Mr. Mogul Maker LLC', 'LLC', 'Wyoming', 'operating', 'givalli_heritage_holdings', 'aedis_brands', 'mmm', false, NULL),
  ('mogul_funding_solutions', 'Mogul Funding Solutions LLC', 'LLC', 'Wyoming', 'operating', 'givalli_heritage_holdings', 'aedis_brands', 'mfs', false, NULL),
  ('coreconnect_technologies_llc', 'CoreConnect Technologies LLC', 'LLC', 'Wyoming', 'operating', 'givalli_heritage_holdings', 'aedis_brands', 'coreconnect', true, 'Runs Disputera — LANE SEPARATED'),
  ('coreconnect_technologies_inc', 'CoreConnect Technologies Inc.', 'Corporation', 'Wyoming', 'sunset', 'givalli_heritage_holdings', NULL, 'coreconnect', false, 'Aged corp / liquidity vehicle, sunset planned. Distinct from CoreConnect Technologies LLC.');

UPDATE public.platform_legal_profile
SET legal_entity_name = 'PaigeAgent AI LLC',
    entity_type = 'LLC',
    state_of_formation = 'Wyoming',
    governing_law_state = 'Wyoming',
    product_name = 'Paige Agent AI',
    website_url = 'https://paigeagent.ai',
    support_email = 'support@paigeagent.ai',
    updated_at = now()
WHERE singleton = true;

CREATE TABLE public.tenant_entity_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES public.corporate_entity_registry(id) ON DELETE RESTRICT,
  relationship_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contact_id, entity_id, relationship_type)
);
COMMENT ON TABLE public.tenant_entity_relationships IS
  'Doctrine §202: a single contact may hold multiple relationships across portfolio entities. Never duplicate contacts.';
CREATE INDEX ON public.tenant_entity_relationships (contact_id);
CREATE INDEX ON public.tenant_entity_relationships (entity_id);
CREATE INDEX ON public.tenant_entity_relationships (tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_entity_relationships TO authenticated;
GRANT ALL ON public.tenant_entity_relationships TO service_role;
ALTER TABLE public.tenant_entity_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ter tenant admin manage"
  ON public.tenant_entity_relationships FOR ALL TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "ter self read"
  ON public.tenant_entity_relationships FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.clients c
            WHERE c.id = tenant_entity_relationships.contact_id
              AND c.linked_user_id = auth.uid())
  );

CREATE TRIGGER trg_ter_updated
  BEFORE UPDATE ON public.tenant_entity_relationships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Layer 1 tenant plans (Practice / Academy / Enterprise)
INSERT INTO public.platform_subscription_plans
  (slug, name, description, monthly_price_cents, annual_price_cents, included_seats, included_contacts, metered_addons, is_active)
VALUES
  ('practice', 'Practice',
    'For solo coaches and small teams launching on Paige.',
    14900, 149000, 3, 250,
    '{"credit_pulls_per_month": 25, "sms_included": 200}'::jsonb, true),
  ('academy', 'Academy',
    'For coaching academies and broker shops running Paige as their operating system.',
    39700, 397000, 10, 2000,
    '{"credit_pulls_per_month": 200, "sms_included": 2000, "white_label": true, "reseller_economics": true}'::jsonb, true),
  ('enterprise', 'Enterprise',
    'Multi-brand portfolios, dedicated infrastructure, SOC 2 / custom DPA.',
    0, 0, 0, 0,
    '{"custom_quote": true}'::jsonb, true);

-- Layer 4 consumer plans (Founder / Growth / Scale)
INSERT INTO public.consumer_subscription_plans
  (slug, name, description, monthly_price_cents, annual_price_cents, features, is_active)
VALUES
  ('founder', 'Founder',
    'For business owners just getting started with Paige.',
    2700, 27000,
    '{"business_profiles": 1, "credit_pulls_per_month": 5, "paige_chat": "unlimited", "subagents": ["email-composer"], "mcp_access": "none", "funding_recommendations": "monthly", "support": "email_48h"}'::jsonb,
    true),
  ('growth', 'Growth',
    'For owners scaling operations with Paige as their co-pilot.',
    6700, 67000,
    '{"business_profiles": 3, "credit_pulls_per_month": 20, "paige_chat": "unlimited", "subagents": "all", "mcp_access": "read_only", "funding_recommendations": "weekly", "coaching_hours_per_month": 1, "support": "email_24h"}'::jsonb,
    true),
  ('scale', 'Scale',
    'For serious operators running multiple businesses with Paige embedded.',
    29700, 297000,
    '{"business_profiles": "unlimited", "credit_pulls_per_month": 100, "paige_chat": "unlimited_priority", "subagents": "all", "mcp_access": "full", "funding_recommendations": "on_demand", "coaching_hours_per_month": 4, "support": "priority_chat"}'::jsonb,
    true);
