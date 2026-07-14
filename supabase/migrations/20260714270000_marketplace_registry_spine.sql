-- ============================================================================
-- Marketplace Registry Spine — Phase 1 (declared catalog + third-party-ready schema)
--
-- Today the "marketplace" is a hardcoded TS list (src/lib/marketplace/skills.ts)
-- and "install" is set_tenant_skill() flipping a jsonb boolean — it seeds NO KB
-- and wires NO functions. This spine makes the catalog DECLARED DATA (so Paige can
-- read/recommend/install it — §10) and makes every item carry an INSTALL MANIFEST
-- (what KB it seeds + what functions it wires + what portal surface it adds).
--
-- Third-party-ready from day one (§12 extend-not-rebuild): items belong to a
-- VENDOR (first_party = us, or a tenant publisher), carry versioned, reviewable
-- payloads, and a payload_class fork — config_only installs freely; anything
-- carrying executable CODE must clear the existing forge/approval rail before it
-- can publish (§13/§14). Monetization is an EXCHANGE take-rate rail (§17), never a
-- consumer-demand marketplace — encoded so a listing structurally can't cross it.
--
-- §2/§9: the catalog is platform-level; a finance/credit item may be LISTED (a
-- tenant can opt in — the doctrine explicitly allows a choosable funding preset),
-- but may NEVER be an auto-installed DEFAULT for new tenants. That is the guard.
--
-- This migration = the declared registry + seed of the current 4 catalog items +
-- one coaching-generic kb_pack so the KB-seed install path is real and testable.
-- The install/uninstall RPCs land in the next migration.
-- ============================================================================

BEGIN;

-- ── Declared taxonomy (§12) ─────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='marketplace_item_type') THEN
    CREATE TYPE public.marketplace_item_type AS ENUM
      ('skin','skill','kb_pack','tool','portal_surface','automation','bundle');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='marketplace_version_status') THEN
    CREATE TYPE public.marketplace_version_status AS ENUM
      ('draft','submitted','in_review','changes_requested','approved','published','deprecated','rejected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='marketplace_item_status') THEN
    CREATE TYPE public.marketplace_item_status AS ENUM ('listed','unlisted','archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='marketplace_scope') THEN
    CREATE TYPE public.marketplace_scope AS ENUM ('public','tenant','agency');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='marketplace_origin') THEN
    CREATE TYPE public.marketplace_origin AS ENUM ('first_party','vendor');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='marketplace_payload_class') THEN
    CREATE TYPE public.marketplace_payload_class AS ENUM ('config_only','code');
  END IF;
END $$;

-- ── marketplace_vendors — the publisher entity ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketplace_vendors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  display_name    text NOT NULL,
  owner_tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE, -- NULL = first_party (us)
  origin          public.marketplace_origin NOT NULL DEFAULT 'vendor',
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','suspended')),
  stripe_connect_account_id text,          -- payout rail (§17), NULL until KYC'd
  payout_status   text NOT NULL DEFAULT 'unconfigured',
  contact_email   text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── marketplace_items — the shelf entry (one row per product) ───────────────
CREATE TABLE IF NOT EXISTS public.marketplace_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9_]+$'),  -- matches enabled_skills grammar
  item_type       public.marketplace_item_type NOT NULL,
  vendor_id       uuid NOT NULL REFERENCES public.marketplace_vendors(id),
  origin          public.marketplace_origin NOT NULL,                   -- denormalized for fast gates
  name            text NOT NULL,
  tagline         text,
  description     text,
  category        text NOT NULL,                                        -- 'verticals'|'experience'|'growth'|...
  icon            text,                                                 -- lucide name
  scope           public.marketplace_scope NOT NULL DEFAULT 'public',
  visible_to_tenant_id uuid REFERENCES public.tenants(id),              -- required when scope='tenant'
  visible_to_agency_id uuid REFERENCES public.tenants(id),              -- required when scope='agency'
  status          public.marketplace_item_status NOT NULL DEFAULT 'unlisted',
  current_version_id uuid,                                              -- FK added after versions table
  -- §2/§9: an item may be LISTED and opt-in installable, but a finance item can
  -- never be auto-installed for every new tenant. This flag is the default seam.
  default_for_new_tenants boolean NOT NULL DEFAULT false,
  -- §17 Commerce Line (rails, not demand aggregation):
  pricing_model   text NOT NULL DEFAULT 'free' CHECK (pricing_model IN ('free','one_time','subscription')),
  price_cents     integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  billing_period  text CHECK (billing_period IN ('monthly','annual') OR billing_period IS NULL),
  take_rate_bps   integer NOT NULL DEFAULT 2000 CHECK (take_rate_bps BETWEEN 0 AND 10000),
  serves          text NOT NULL DEFAULT 'operator' CHECK (serves IN ('operator','operator_client')),
  install_count   integer NOT NULL DEFAULT 0,
  rating_avg      numeric(3,2),
  rating_count    integer NOT NULL DEFAULT 0,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mp_scope_target_ck CHECK (
    (scope='public' AND visible_to_tenant_id IS NULL AND visible_to_agency_id IS NULL) OR
    (scope='tenant' AND visible_to_tenant_id IS NOT NULL) OR
    (scope='agency' AND visible_to_agency_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_mp_items_type_status ON public.marketplace_items (item_type, status);
CREATE INDEX IF NOT EXISTS idx_mp_items_scope ON public.marketplace_items (scope, visible_to_tenant_id, visible_to_agency_id);

-- ── marketplace_item_versions — the versioned, reviewable payload ───────────
CREATE TABLE IF NOT EXISTS public.marketplace_item_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  semver          text NOT NULL CHECK (semver ~ '^\d+\.\d+\.\d+$'),
  status          public.marketplace_version_status NOT NULL DEFAULT 'draft',
  payload_class   public.marketplace_payload_class NOT NULL DEFAULT 'config_only',  -- THE FORK
  install_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,  -- kb_pack / functions / persona_overlay / portal_surface / skin / requires / bundle_items
  code_ref        jsonb,          -- code items only: pointer to the approved forge skill/proposal (never inline code)
  changelog       text,
  review_proposal_id uuid,        -- FK to paige_skill_proposals (code path); soft ref to avoid hard dep
  reviewed_by     uuid REFERENCES auth.users(id),
  reviewer_notes  text,
  submitted_at    timestamptz, approved_at timestamptz, published_at timestamptz, deprecated_at timestamptz,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, semver)
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mp_items_current_version_fk') THEN
    ALTER TABLE public.marketplace_items
      ADD CONSTRAINT mp_items_current_version_fk
      FOREIGN KEY (current_version_id) REFERENCES public.marketplace_item_versions(id);
  END IF;
END $$;

-- ── marketplace_installs — a tenant's declared, queryable installed items ────
CREATE TABLE IF NOT EXISTS public.marketplace_installs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id         uuid NOT NULL REFERENCES public.marketplace_items(id),
  version_id      uuid NOT NULL REFERENCES public.marketplace_item_versions(id),
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','disabled','uninstalled','update_available')),
  -- Exact provenance of what install WROTE, so uninstall is precise + reversible (§13):
  seeded_refs     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {kb_doc_ids:[], skill_slugs:[], portal_surface_slugs:[], features_keys:[]}
  installed_by    uuid REFERENCES auth.users(id),
  installed_by_agent text,                              -- 'paige' when installed from chat (§10)
  service_subscription_id uuid,                         -- paid installs → L2 billing (soft ref)
  installed_at    timestamptz NOT NULL DEFAULT now(),
  uninstalled_at  timestamptz,
  UNIQUE (tenant_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_mp_installs_tenant ON public.marketplace_installs (tenant_id, status);

-- ── marketplace_install_ledger — append-only take-rate/payout audit (§17) ────
CREATE TABLE IF NOT EXISTS public.marketplace_install_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  install_id      uuid REFERENCES public.marketplace_installs(id),
  item_id         uuid NOT NULL REFERENCES public.marketplace_items(id),
  vendor_id       uuid NOT NULL REFERENCES public.marketplace_vendors(id),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id),
  event_type      text NOT NULL CHECK (event_type IN ('install','subscription_renewal','uninstall','refund')),
  gross_cents     integer NOT NULL DEFAULT 0,
  take_rate_bps   integer NOT NULL DEFAULT 0,
  platform_fee_cents integer NOT NULL DEFAULT 0,
  vendor_net_cents   integer NOT NULL DEFAULT 0,
  stripe_ref      text,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);

-- ── §2/§9 guard: a finance/credit item may be listed (opt-in) but NEVER an
--    auto-installed default, and never a public first_party finance DEFAULT. ──
CREATE OR REPLACE FUNCTION public.marketplace_item_guard()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE _hay text;
BEGIN
  IF NEW.default_for_new_tenants THEN
    _hay := lower(coalesce(NEW.slug,'')||' '||coalesce(NEW.name,'')||' '||coalesce(NEW.tagline,'')||' '||coalesce(NEW.description,'')||' '||coalesce(NEW.category,''));
    IF _hay ~ '(credit|funding|lending|lender|loan|financing|capital[- ]rais|tradeline|underwrit)' THEN
      RAISE EXCEPTION 'A finance/credit marketplace item cannot be a default for new tenants (§2). It may be listed as an opt-in item only.'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_marketplace_item_guard ON public.marketplace_items;
CREATE TRIGGER trg_marketplace_item_guard
  BEFORE INSERT OR UPDATE ON public.marketplace_items
  FOR EACH ROW EXECUTE FUNCTION public.marketplace_item_guard();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.marketplace_vendors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_item_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_installs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_install_ledger ENABLE ROW LEVEL SECURITY;

-- Catalog: any authenticated user can read a LISTED item visible to them; the
-- visibility rides the DECLARED agency rail (Tier Rail lesson — never inferred).
DROP POLICY IF EXISTS mp_items_read ON public.marketplace_items;
CREATE POLICY mp_items_read ON public.marketplace_items FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR (status='listed' AND (
         scope='public'
         OR (scope='tenant' AND visible_to_tenant_id = public.current_user_tenant_id())
         OR (scope='agency' AND public.agency_team_role(visible_to_agency_id, auth.uid()) IS NOT NULL)
       ))
  );
DROP POLICY IF EXISTS mp_items_write ON public.marketplace_items;
CREATE POLICY mp_items_write ON public.marketplace_items FOR ALL TO authenticated
  USING (public.is_platform_owner()
         OR EXISTS (SELECT 1 FROM public.marketplace_vendors v
                     WHERE v.id = marketplace_items.vendor_id
                       AND v.owner_tenant_id IS NOT NULL
                       AND public.is_tenant_admin(v.owner_tenant_id)))
  WITH CHECK (public.is_platform_owner()
         OR EXISTS (SELECT 1 FROM public.marketplace_vendors v
                     WHERE v.id = marketplace_items.vendor_id
                       AND v.owner_tenant_id IS NOT NULL
                       AND public.is_tenant_admin(v.owner_tenant_id)));

-- Versions: read published versions of readable items; platform owner + owning vendor read all.
DROP POLICY IF EXISTS mp_versions_read ON public.marketplace_item_versions;
CREATE POLICY mp_versions_read ON public.marketplace_item_versions FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR (status='published' AND EXISTS (SELECT 1 FROM public.marketplace_items i WHERE i.id = item_id))
    OR EXISTS (SELECT 1 FROM public.marketplace_items i JOIN public.marketplace_vendors v ON v.id=i.vendor_id
               WHERE i.id = item_id AND v.owner_tenant_id IS NOT NULL AND public.is_tenant_admin(v.owner_tenant_id))
  );

-- Installs: a tenant admin sees/writes only their OWN installs; platform owner all.
DROP POLICY IF EXISTS mp_installs_rw ON public.marketplace_installs;
CREATE POLICY mp_installs_rw ON public.marketplace_installs FOR ALL TO authenticated
  USING (public.is_platform_owner() OR public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_platform_owner() OR public.is_tenant_admin(tenant_id));

-- Vendors: own row or platform owner.
DROP POLICY IF EXISTS mp_vendors_rw ON public.marketplace_vendors;
CREATE POLICY mp_vendors_rw ON public.marketplace_vendors FOR ALL TO authenticated
  USING (public.is_platform_owner() OR (owner_tenant_id IS NOT NULL AND public.is_tenant_admin(owner_tenant_id)))
  WITH CHECK (public.is_platform_owner() OR (owner_tenant_id IS NOT NULL AND public.is_tenant_admin(owner_tenant_id)));

-- Ledger: platform owner + the vendor's own rows; append-only (no client write policy).
DROP POLICY IF EXISTS mp_ledger_read ON public.marketplace_install_ledger;
CREATE POLICY mp_ledger_read ON public.marketplace_install_ledger FOR SELECT TO authenticated
  USING (public.is_platform_owner()
         OR EXISTS (SELECT 1 FROM public.marketplace_vendors v
                     WHERE v.id = marketplace_install_ledger.vendor_id
                       AND v.owner_tenant_id IS NOT NULL AND public.is_tenant_admin(v.owner_tenant_id)));

-- ── Seed: the first-party "Paige" vendor + the current catalog as data ───────
-- No hard-coded id — the vendor is always resolved by its stable slug below, and
-- a literal UUID trips the migration linter (FK-to-auth.users rebuild guard).
INSERT INTO public.marketplace_vendors (slug, display_name, owner_tenant_id, origin, status, contact_email)
VALUES ('paige', 'Paige Agent AI', NULL, 'first_party', 'verified', 'support@paigeagent.ai')
ON CONFLICT (slug) DO NOTHING;

-- Helper to seed an item + its published v1 in one shot.
DO $$
DECLARE _vendor uuid; _item uuid; _ver uuid;
BEGIN
  SELECT id INTO _vendor FROM public.marketplace_vendors WHERE slug='paige';

  -- (1) funding — LISTED + opt-in (choosable), NEVER a default (§2). Config gate reuses enabled_skills.
  INSERT INTO public.marketplace_items (slug,item_type,vendor_id,origin,name,tagline,description,category,icon,scope,status,default_for_new_tenants)
  VALUES ('funding','skill',_vendor,'first_party','Funding & Capital-Raising',
          'Turn Paige into a funding-desk strategist.',
          'Adds funding-readiness, lender matching, and a funding knowledge base to Paige. Opt-in; layers on top of any practice — coach, consultant, agency, or advisor.',
          'verticals','TrendingUp','public','listed',false)
  ON CONFLICT (slug) DO NOTHING RETURNING id INTO _item;
  IF _item IS NOT NULL THEN
    INSERT INTO public.marketplace_item_versions (item_id,semver,status,payload_class,install_manifest,published_at)
    VALUES (_item,'1.0.0','published','config_only',
            '{"functions":[{"kind":"skill_flag","slug":"funding"}]}'::jsonb, now()) RETURNING id INTO _ver;
    UPDATE public.marketplace_items SET current_version_id=_ver WHERE id=_item;
  END IF;

  -- (2)(3)(4) coming-soon items → unlisted, no published version yet.
  INSERT INTO public.marketplace_items (slug,item_type,vendor_id,origin,name,tagline,description,category,icon,scope,status)
  VALUES
    ('portal_theming','skin',_vendor,'first_party','Portal Theming','Make the client portal unmistakably yours.','Custom skins, layouts, and module arrangements beyond logo and color.','experience','Palette','public','unlisted'),
    ('voice_agent','tool',_vendor,'first_party','Voice Agent','Let clients talk to Paige.','A voice-first Paige that answers, intakes, and follows up by phone under your brand.','experience','Mic','public','unlisted'),
    ('automations','automation',_vendor,'first_party','Automations','Paige builds and runs your plays.','Describe an automation in plain language and Paige builds it on your connected workflow engine.','growth','Workflow','public','unlisted')
  ON CONFLICT (slug) DO NOTHING;

  -- (5) client_onboarding_essentials — a coaching-generic kb_pack so the KB-seed
  --     install path is REAL + testable (§2-clean: no finance content).
  INSERT INTO public.marketplace_items (slug,item_type,vendor_id,origin,name,tagline,description,category,icon,scope,status,default_for_new_tenants)
  VALUES ('client_onboarding_essentials','kb_pack',_vendor,'first_party','Client Onboarding Essentials',
          'Give Paige a proven onboarding playbook.',
          'Seeds your knowledge base with a proven client-onboarding framework Paige uses to welcome, orient, and set expectations with every new client — for any practice.',
          'experience','BookOpen','public','listed',false)
  ON CONFLICT (slug) DO NOTHING RETURNING id INTO _item;
  IF _item IS NOT NULL THEN
    INSERT INTO public.marketplace_item_versions (item_id,semver,status,payload_class,install_manifest,published_at)
    VALUES (_item,'1.0.0','published','config_only',
      jsonb_build_object(
        'kb_pack', jsonb_build_object('docs', jsonb_build_array(
          jsonb_build_object('title','Client Onboarding — First 7 Days','category','onboarding','tags',jsonb_build_array('onboarding','framework'),
            'content','A first-week onboarding framework for a client-based practice: Day 1 welcome + expectation-setting; Day 2 intake review and goal confirmation; Day 3 first working session; Day 5 quick-win check-in; Day 7 cadence + next-steps agreement. Keep it warm, specific, and outcome-focused.'),
          jsonb_build_object('title','Setting Client Expectations','category','onboarding','tags',jsonb_build_array('onboarding','communication'),
            'content','How to set expectations early: define the engagement scope, the communication cadence and channels, what the client is responsible for, response-time norms, and how progress is measured. Confirm in writing and revisit at the first check-in.')
        )),
        'functions', jsonb_build_array()
      ), now()) RETURNING id INTO _ver;
    UPDATE public.marketplace_items SET current_version_id=_ver WHERE id=_item;
  END IF;
END $$;

COMMIT;
