-- =========================================================================
-- Multi-tenant foundation
--
-- Introduces tenants (CRM-suite subscribers), tenant_members (which users
-- belong to which tenant + role), and tenant_invite_tokens (consumer
-- self-signup links). Adds tenant_id to the core CRM tables and backfills
-- every existing row to Antonio's tenant so nothing disappears.
--
-- RLS helpers: current_user_tenant_id(), is_tenant_member(_tenant),
-- is_tenant_admin(_tenant). Existing per-table RLS policies are NOT changed
-- in this migration — that comes in a follow-up so we can flag-flip safely.
-- =========================================================================

-- ----- tenant_role enum -----
DO $$ BEGIN
  CREATE TYPE public.tenant_role AS ENUM ('owner','admin','coach','member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tenant_status AS ENUM ('trial','active','past_due','canceled','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----- tenants -----
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  brand jsonb NOT NULL DEFAULT '{}'::jsonb,            -- { logo_url, primary_color, from_name, support_email }
  plan_offer text,                                     -- crm_coach | crm_agency | crm_enterprise
  stripe_customer_id text,
  stripe_subscription_id text,
  status public.tenant_status NOT NULL DEFAULT 'trial',
  seat_limit integer NOT NULL DEFAULT 1,
  customer_limit integer NOT NULL DEFAULT 25,
  owner_user_id uuid,
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tenants_owner ON public.tenants(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);

-- ----- tenant_members -----
CREATE TABLE IF NOT EXISTS public.tenant_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.tenant_role NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'active',               -- active | invited | suspended | removed
  invited_at timestamptz,
  joined_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_members TO authenticated;
GRANT ALL ON public.tenant_members TO service_role;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON public.tenant_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant ON public.tenant_members(tenant_id, status);

-- ----- tenant_invite_tokens -----
CREATE TABLE IF NOT EXISTS public.tenant_invite_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'consumer',               -- consumer | team
  default_role public.tenant_role NOT NULL DEFAULT 'member',
  created_by uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_invite_tokens TO authenticated;
GRANT ALL ON public.tenant_invite_tokens TO service_role;
ALTER TABLE public.tenant_invite_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tenant_invite_tokens_tenant ON public.tenant_invite_tokens(tenant_id);

-- ----- profiles.active_tenant_id (for platform-owner tenant switcher) -----
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;

-- ----- updated_at triggers -----
CREATE OR REPLACE FUNCTION public.tenant_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tenant_set_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_members_updated_at ON public.tenant_members;
CREATE TRIGGER trg_tenant_members_updated_at BEFORE UPDATE ON public.tenant_members
  FOR EACH ROW EXECUTE FUNCTION public.tenant_set_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_invite_tokens_updated_at ON public.tenant_invite_tokens;
CREATE TRIGGER trg_tenant_invite_tokens_updated_at BEFORE UPDATE ON public.tenant_invite_tokens
  FOR EACH ROW EXECUTE FUNCTION public.tenant_set_updated_at();

-- ----- SECURITY DEFINER helpers (used by future RLS rewrite) -----

-- Returns the tenant the caller is currently operating inside.
-- Priority: profiles.active_tenant_id (platform owner switcher) → first
-- active membership. NULL means caller is not part of any tenant.
CREATE OR REPLACE FUNCTION public.current_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT active_tenant_id FROM public.profiles WHERE user_id = auth.uid()),
    (SELECT tenant_id FROM public.tenant_members
       WHERE user_id = auth.uid() AND status = 'active'
       ORDER BY joined_at ASC LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
     WHERE tenant_id = _tenant AND user_id = auth.uid() AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
     WHERE tenant_id = _tenant AND user_id = auth.uid()
       AND status = 'active' AND role IN ('owner','admin')
  );
$$;

-- ----- RLS policies on the new tables -----

-- tenants
DROP POLICY IF EXISTS "Platform owner sees all tenants" ON public.tenants;
CREATE POLICY "Platform owner sees all tenants" ON public.tenants
  FOR SELECT TO authenticated
  USING (public.is_platform_owner() OR public.is_tenant_member(id));

DROP POLICY IF EXISTS "Tenant admins update their tenant" ON public.tenants;
CREATE POLICY "Tenant admins update their tenant" ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.is_platform_owner() OR public.is_tenant_admin(id))
  WITH CHECK (public.is_platform_owner() OR public.is_tenant_admin(id));

DROP POLICY IF EXISTS "Platform owner manages tenants" ON public.tenants;
CREATE POLICY "Platform owner manages tenants" ON public.tenants
  FOR ALL TO authenticated
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

-- tenant_members
DROP POLICY IF EXISTS "Member can see own membership" ON public.tenant_members;
CREATE POLICY "Member can see own membership" ON public.tenant_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_tenant_admin(tenant_id) OR public.is_platform_owner());

DROP POLICY IF EXISTS "Tenant admins manage members" ON public.tenant_members;
CREATE POLICY "Tenant admins manage members" ON public.tenant_members
  FOR ALL TO authenticated
  USING (public.is_platform_owner() OR public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_platform_owner() OR public.is_tenant_admin(tenant_id));

-- tenant_invite_tokens (tokens themselves are sensitive; only admins read; service role writes)
DROP POLICY IF EXISTS "Tenant admins manage invite tokens" ON public.tenant_invite_tokens;
CREATE POLICY "Tenant admins manage invite tokens" ON public.tenant_invite_tokens
  FOR ALL TO authenticated
  USING (public.is_platform_owner() OR public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_platform_owner() OR public.is_tenant_admin(tenant_id));

-- =========================================================================
-- Add tenant_id to in-scope CRM tables (non-nullable enforced AFTER backfill).
-- =========================================================================

ALTER TABLE public.clients                  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.deals                    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.pipelines                ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.pipeline_stages          ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.tasks                    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.paige_coach_assignments  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.paige_pending_approvals  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.invitations              ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.email_send_log           ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.email_templates          ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.paige_conversations      ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.paige_workflow_runs      ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.paige_audit_log          ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_tenant                  ON public.clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_deals_tenant                    ON public.deals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant                    ON public.tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_paige_coach_assignments_tenant  ON public.paige_coach_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_paige_pending_approvals_tenant  ON public.paige_pending_approvals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_send_log_tenant           ON public.email_send_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_paige_conversations_tenant      ON public.paige_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_paige_workflow_runs_tenant      ON public.paige_workflow_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_paige_audit_log_tenant          ON public.paige_audit_log(tenant_id);

-- =========================================================================
-- Backfill: create Antonio's tenant ("Mogul Maker Academy") as tenant #1,
-- enroll him as owner, and stamp every existing CRM row with that tenant_id.
-- Idempotent — safe to re-run.
-- =========================================================================

DO $$
DECLARE
  _owner_email text;
  _owner_id uuid;
  _tenant_id uuid;
BEGIN
  SELECT owner_email INTO _owner_email FROM public.app_settings_owner LIMIT 1;
  IF _owner_email IS NULL THEN
    RAISE NOTICE 'No platform owner configured; skipping tenant backfill.';
    RETURN;
  END IF;

  SELECT id INTO _owner_id FROM auth.users WHERE lower(email) = lower(_owner_email) LIMIT 1;
  IF _owner_id IS NULL THEN
    RAISE NOTICE 'Platform owner user not found; skipping tenant backfill.';
    RETURN;
  END IF;

  SELECT id INTO _tenant_id FROM public.tenants WHERE slug = 'mma' LIMIT 1;
  IF _tenant_id IS NULL THEN
    INSERT INTO public.tenants (slug, name, plan_offer, status, seat_limit, customer_limit, owner_user_id, brand)
    VALUES (
      'mma',
      'Mogul Maker Academy',
      'crm_enterprise',
      'active',
      999,
      99999,
      _owner_id,
      jsonb_build_object(
        'from_name', 'Mogul Maker Academy',
        'support_email', 'support@news.mrmogulmaker.com',
        'primary_color', '#CFAE70'
      )
    )
    RETURNING id INTO _tenant_id;
  END IF;

  -- Owner membership
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (_tenant_id, _owner_id, 'owner', 'active', now())
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'owner', status = 'active';

  -- Stamp every existing CRM row with the home tenant
  UPDATE public.clients                  SET tenant_id = _tenant_id WHERE tenant_id IS NULL;
  UPDATE public.deals                    SET tenant_id = _tenant_id WHERE tenant_id IS NULL;
  UPDATE public.pipelines                SET tenant_id = _tenant_id WHERE tenant_id IS NULL;
  UPDATE public.pipeline_stages          SET tenant_id = _tenant_id WHERE tenant_id IS NULL;
  UPDATE public.tasks                    SET tenant_id = _tenant_id WHERE tenant_id IS NULL;
  UPDATE public.paige_coach_assignments  SET tenant_id = _tenant_id WHERE tenant_id IS NULL;
  UPDATE public.paige_pending_approvals  SET tenant_id = _tenant_id WHERE tenant_id IS NULL;
  UPDATE public.invitations              SET tenant_id = _tenant_id WHERE tenant_id IS NULL;
  UPDATE public.email_send_log           SET tenant_id = _tenant_id WHERE tenant_id IS NULL;
  UPDATE public.email_templates          SET tenant_id = _tenant_id WHERE tenant_id IS NULL;
  UPDATE public.paige_conversations      SET tenant_id = _tenant_id WHERE tenant_id IS NULL;
  UPDATE public.paige_workflow_runs      SET tenant_id = _tenant_id WHERE tenant_id IS NULL;
  UPDATE public.paige_audit_log          SET tenant_id = _tenant_id WHERE tenant_id IS NULL;

  -- Enroll every existing staff user (admin / coach / sales_rep / cs_rep) under the home tenant
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
  SELECT _tenant_id, ur.user_id,
         CASE
           WHEN ur.role = 'admin'::app_role THEN 'admin'::tenant_role
           WHEN ur.role = 'coach'::app_role THEN 'coach'::tenant_role
           ELSE 'member'::tenant_role
         END,
         'active', now()
    FROM public.user_roles ur
   WHERE ur.role IN ('admin'::app_role,'coach'::app_role,'sales_rep'::app_role,'cs_rep'::app_role,'super_admin'::app_role)
     AND ur.user_id <> _owner_id
  ON CONFLICT (tenant_id, user_id) DO NOTHING;
END $$;