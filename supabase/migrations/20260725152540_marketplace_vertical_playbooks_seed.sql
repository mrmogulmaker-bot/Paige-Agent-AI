-- ============================================================================
-- Slice 1c-xii — 5 net-new vertical Playbook cards as HONEST coming-soon rows.
--
-- Pure DML. No DDL — is_finance/featured/serves/metadata/current_version_id all
-- already exist on prod (added in 20260714161507/192450/270000/290000/340000).
-- Re-runnable: ON CONFLICT (slug) DO NOTHING (slug is the UNIQUE key).
--
-- These are ROADMAP cards: status='listed' so the catalog RPC surfaces them, but
-- NO published version is inserted → current_version_id stays NULL → the UI's
-- availableFor() is false → they render as "Coming soon" and feed the {soon}
-- counter. They never become installable until a version ships (§13 honest).
--
-- §2 HARD GATES (both literal constants, cannot vary per row):
--   is_finance = false            → none are finance; funding stays the only one.
--   default_for_new_tenants = false → opt-in only, never seeded to any tenant.
-- §10 config-as-data: coming-soon signal + roadmap note live in the metadata jsonb,
-- no new columns. §9: platform-level catalog rows under the first-party 'paige'
-- vendor, resolved by stable slug (never a literal UUID — trips the migration linter).
-- ============================================================================

BEGIN;

INSERT INTO public.marketplace_items
  (slug, item_type, vendor_id, origin, name, tagline, description,
   category, icon, scope, status, serves,
   is_finance, default_for_new_tenants, featured,
   pricing_model, price_cents, metadata)
SELECT
  v.slug, 'skill', ven.id, 'first_party', v.name, v.tagline, v.description,
  'verticals', v.icon, 'public', 'listed', 'operator',
  false, false, false,
  'free', 0,
  jsonb_build_object('coming_soon', true, 'roadmap_note', v.roadmap_note)
FROM (VALUES
  ('fitness',       'Fitness Coaching',  'Paige runs your fitness practice''s client journey.',
     'A Playbook preset that tunes Paige for fitness and wellness coaches — client intake, program check-ins, and accountability follow-ups, in your voice.',
     'Dumbbell',   'Vertical Playbook preset in development — switch on your fitness practice''s Paige when it ships.'),
  ('business_coach','Business Coaching', 'Paige handles your business-coaching pipeline.',
     'A Playbook preset for business and executive coaches — discovery intake, engagement milestones, and retainer follow-through, native to your practice.',
     'Briefcase',  'Vertical Playbook preset in development — switch it on when it ships.'),
  ('agency',        'Agency',            'Paige keeps every agency client moving.',
     'A Playbook preset for agencies — client onboarding, project touchpoints, and account nurture across your book of business.',
     'Building2',  'Vertical Playbook preset in development — switch it on when it ships.'),
  ('consulting',    'Consulting',        'Paige runs your consulting engagements end to end.',
     'A Playbook preset for consultants and advisors — scoping intake, engagement cadence, and outcome check-ins in your voice.',
     'LineChart',  'Vertical Playbook preset in development — switch it on when it ships.'),
  ('life_coach',    'Life Coaching',     'Paige gives your life-coaching clients a home.',
     'A Playbook preset for life and mindset coaches — welcome intake, session follow-ups, and momentum nudges under your brand.',
     'Sparkles',   'Vertical Playbook preset in development — switch it on when it ships.')
) AS v(slug, name, tagline, description, icon, roadmap_note)
CROSS JOIN (SELECT id FROM public.marketplace_vendors WHERE slug = 'paige') AS ven
ON CONFLICT (slug) DO NOTHING;

COMMIT;
