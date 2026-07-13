-- $100M Org Blueprint — Layer 1 (Org Brain), part 1: seed the 10 departments.
--
-- Extends the existing paige_departments table (SPINE #1 action bus) from the
-- pre-blueprint 2-department model to the blueprint's 10 named departments (§12
-- extend, never rebuild). Platform-default + coaching-generic: NO tenant_id, NO
-- credit/funding content (§2/§9). Adds structured org-brain columns (mandate,
-- kpis, escalation) so Paige can reason over each desk's purpose + what "good"
-- looks like. The two legacy slugs (owner_ops, client_experience) are KEPT
-- as-is — 15 existing action kinds route through them — and enriched in place;
-- client_experience is the blueprint's Fulfillment/Client Success desk.

ALTER TABLE public.paige_departments
  ADD COLUMN IF NOT EXISTS mandate    text,
  ADD COLUMN IF NOT EXISTS kpis       jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS escalation jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Enrich the two legacy desks in place (slugs unchanged → no FK breakage).
UPDATE public.paige_departments SET
  mandate = 'Cross-department owner operations desk. Routes owner-side follow-ups, nudges, scheduling, and the daily brief. (Legacy general desk; work is being routed into the specific departments as the org model rolls out.)',
  kpis = '["Actions filed vs. resolved","Owner response time","Daily brief delivered"]'::jsonb
WHERE slug = 'owner_ops';

UPDATE public.paige_departments SET
  name = 'Client Success',
  mandate = 'Deliver the transformation that was sold. Retention, results, referrals, and ascension all live here.',
  kpis = '["Milestone completion","Retention %","Churn","NPS","Testimonials/case studies","Ascension rate","Refund rate"]'::jsonb
WHERE slug = 'client_experience';

-- The 9 net-new blueprint departments (owner audience; client_experience already
-- covers the client-facing Fulfillment desk). Idempotent on slug.
INSERT INTO public.paige_departments (slug, name, audience, description, mandate, kpis, enabled, display_order) VALUES
  ('executive_office', 'Executive Office', 'owner',
   'Vision & Command — set direction, allocate capital, protect the brand.',
   'Set direction, allocate capital, protect the brand, make the calls no one else can make.',
   '["Revenue vs. plan","EBITDA margin","Quarterly rock completion %","Leadership team health"]'::jsonb, true, 3),
  ('marketing', 'Marketing', 'owner',
   'Demand & Brand — make the market know, like, and trust the brand.',
   'Make the market know, like, and trust the brand — and generate qualified demand at a predictable cost.',
   '["Qualified leads/month","CPL","CAC by channel","Email list growth","Content output vs. calendar","ROAS"]'::jsonb, true, 4),
  ('sales', 'Sales', 'owner',
   'Revenue Conversion — turn demand into revenue predictably.',
   'Convert demand into revenue with a predictable, coachable, measurable process.',
   '["Set rate","Show rate","Close rate","Cash collected","Average order value","Pipeline coverage","Speed-to-lead"]'::jsonb, true, 5),
  ('product_curriculum', 'Product & Curriculum', 'owner',
   'The IP — own the offers, methodology, and intellectual property.',
   'Own the offers, the methodology, and the intellectual property. Keep the product ahead of the market.',
   '["Course completion rates","Client outcome rates by program","Offer conversion rates","Time-to-launch on new products"]'::jsonb, true, 6),
  ('technology_automation', 'Technology & Automation', 'owner',
   'The Machine — systems that scale without linear headcount.',
   'Build and maintain the systems that let the company scale without headcount scaling linearly.',
   '["System uptime","Automation coverage %","Cost-per-workflow","Data accuracy","Ticket resolution time"]'::jsonb, true, 7),
  ('finance', 'Finance', 'owner',
   'The Scoreboard — protect the cash, know the numbers, fund the growth.',
   'Protect the cash, know the numbers, and fund the growth.',
   '["Cash position","Monthly close speed","Collection rate on payment plans","Gross margin by offer","Forecast accuracy"]'::jsonb, true, 8),
  ('people_talent', 'People & Talent', 'owner',
   'The Team — attract, develop, and retain the people who fill the seats.',
   'Attract, develop, and retain the people who fill the seats — and keep the culture intact at scale.',
   '["Time-to-fill","90-day new-hire retention","Employee NPS","Performance review completion"]'::jsonb, true, 9),
  ('legal_compliance', 'Legal & Compliance', 'owner',
   'The Shield — contracts, claims, IP, and regulatory exposure.',
   'Keep the company out of trouble — contracts, claims, IP, and regulatory exposure.',
   '["Contract turnaround time","Zero unreviewed public claims","IP filings current","Dispute count"]'::jsonb, true, 10),
  ('operations_pmo', 'Operations / PMO', 'owner',
   'The Glue — projects, SOPs, vendors, and the operating cadence.',
   'Make everything else run on time. Projects, SOPs, vendors, and the operating cadence.',
   '["On-time project delivery %","SOP coverage %","Vendor cost vs. budget"]'::jsonb, true, 11)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, audience = EXCLUDED.audience, description = EXCLUDED.description,
  mandate = EXCLUDED.mandate, kpis = EXCLUDED.kpis, display_order = EXCLUDED.display_order;
