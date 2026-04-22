-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New role: broker
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'broker';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. broker_profiles
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.broker_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  license_number TEXT,
  broker_type TEXT NOT NULL CHECK (broker_type IN (
    'credit_coach','mortgage_broker','financial_advisor',
    'real_estate_agent','insurance_agent','other'
  )),
  website TEXT,
  bio TEXT,
  referral_code TEXT UNIQUE,
  broker_referral_code TEXT,
  broker_client_discount_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','suspended')),
  approved_at TIMESTAMPTZ,
  client_count INTEGER NOT NULL DEFAULT 0,
  subscription_status TEXT NOT NULL DEFAULT 'inactive',
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  monthly_fee NUMERIC(10,2) NOT NULL DEFAULT 197.00,
  current_client_count INTEGER NOT NULL DEFAULT 0,
  client_count_quoted INTEGER,
  use_case TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_broker_profiles_user_id ON public.broker_profiles(user_id);
CREATE INDEX idx_broker_profiles_status ON public.broker_profiles(status);
CREATE INDEX idx_broker_profiles_referral_code ON public.broker_profiles(referral_code);
CREATE INDEX idx_broker_profiles_discount_code ON public.broker_profiles(broker_client_discount_code);

ALTER TABLE public.broker_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brokers view own profile"
  ON public.broker_profiles FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Brokers update own profile"
  ON public.broker_profiles FOR UPDATE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can submit broker application"
  ON public.broker_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete broker profile"
  ON public.broker_profiles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_broker_profiles_updated_at
  BEFORE UPDATE ON public.broker_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. broker_client_relationships
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.broker_client_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID NOT NULL REFERENCES public.broker_profiles(id) ON DELETE CASCADE,
  client_user_id UUID,
  client_email TEXT NOT NULL,
  client_first_name TEXT NOT NULL,
  client_last_name TEXT NOT NULL,
  client_phone TEXT,
  client_goal TEXT,
  client_subscription_status TEXT NOT NULL DEFAULT 'none'
    CHECK (client_subscription_status IN ('none','invited','trial','active','churned')),
  client_stripe_subscription_id TEXT,
  discount_code TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (broker_id, client_email)
);
CREATE INDEX idx_bcr_broker ON public.broker_client_relationships(broker_id);
CREATE INDEX idx_bcr_client_user ON public.broker_client_relationships(client_user_id);

ALTER TABLE public.broker_client_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brokers manage their clients"
  ON public.broker_client_relationships FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.broker_profiles bp
      WHERE bp.id = broker_client_relationships.broker_id AND bp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.broker_profiles bp
      WHERE bp.id = broker_client_relationships.broker_id AND bp.user_id = auth.uid()
    )
  );

CREATE POLICY "Clients can see their own broker link"
  ON public.broker_client_relationships FOR SELECT
  USING (auth.uid() = client_user_id);

CREATE TRIGGER trg_bcr_updated_at
  BEFORE UPDATE ON public.broker_client_relationships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. broker_team_members
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.broker_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID NOT NULL REFERENCES public.broker_profiles(id) ON DELETE CASCADE,
  user_id UUID,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL DEFAULT 'advisor'
    CHECK (role IN ('lead_broker','advisor','assistant')),
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited','active','suspended')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (broker_id, email)
);
CREATE INDEX idx_btm_broker ON public.broker_team_members(broker_id);
CREATE INDEX idx_btm_user ON public.broker_team_members(user_id);

ALTER TABLE public.broker_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brokers manage their team"
  ON public.broker_team_members FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.broker_profiles bp
      WHERE bp.id = broker_team_members.broker_id AND bp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.broker_profiles bp
      WHERE bp.id = broker_team_members.broker_id AND bp.user_id = auth.uid()
    )
  );

CREATE POLICY "Team members see their own row"
  ON public.broker_team_members FOR SELECT
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_btm_updated_at
  BEFORE UPDATE ON public.broker_team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. broker_paige_sessions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.broker_paige_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID NOT NULL REFERENCES public.broker_profiles(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES public.broker_team_members(id) ON DELETE SET NULL,
  client_relationship_id UUID NOT NULL REFERENCES public.broker_client_relationships(id) ON DELETE CASCADE,
  session_type TEXT NOT NULL DEFAULT 'broker_private'
    CHECK (session_type IN ('broker_private','shared_with_client')),
  conversation JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  summary_shared_at TIMESTAMPTZ,
  key_insights JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bps_broker ON public.broker_paige_sessions(broker_id);
CREATE INDEX idx_bps_client_rel ON public.broker_paige_sessions(client_relationship_id);

ALTER TABLE public.broker_paige_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brokers manage their sessions"
  ON public.broker_paige_sessions FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.broker_profiles bp
      WHERE bp.id = broker_paige_sessions.broker_id AND bp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.broker_profiles bp
      WHERE bp.id = broker_paige_sessions.broker_id AND bp.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_bps_updated_at
  BEFORE UPDATE ON public.broker_paige_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. broker_referral_commissions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.broker_referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referring_broker_id UUID NOT NULL REFERENCES public.broker_profiles(id) ON DELETE CASCADE,
  referred_broker_id UUID NOT NULL REFERENCES public.broker_profiles(id) ON DELETE CASCADE,
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.15,
  duration_months INTEGER NOT NULL DEFAULT 12,
  monthly_amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','expired','paused','cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (referring_broker_id, referred_broker_id)
);
CREATE INDEX idx_brc_referring ON public.broker_referral_commissions(referring_broker_id);
CREATE INDEX idx_brc_referred ON public.broker_referral_commissions(referred_broker_id);

ALTER TABLE public.broker_referral_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brokers see their own referral commissions"
  ON public.broker_referral_commissions FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.broker_profiles bp
      WHERE (bp.id = broker_referral_commissions.referring_broker_id
          OR bp.id = broker_referral_commissions.referred_broker_id)
        AND bp.user_id = auth.uid()
    )
  );
CREATE POLICY "Admins manage broker referral commissions"
  ON public.broker_referral_commissions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. mcc_service_requests
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.mcc_service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID NOT NULL REFERENCES public.broker_profiles(id) ON DELETE CASCADE,
  client_relationship_id UUID NOT NULL REFERENCES public.broker_client_relationships(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL CHECK (service_type IN (
    'credit_dispute','credit_coaching','tradeline_service','full_credit_restoration'
  )),
  priority TEXT NOT NULL DEFAULT 'standard' CHECK (priority IN ('standard','expedited')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','complete','cancelled')),
  notes TEXT,
  webhook_dispatched_at TIMESTAMPTZ,
  webhook_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mcc_broker ON public.mcc_service_requests(broker_id);
CREATE INDEX idx_mcc_status ON public.mcc_service_requests(status);

ALTER TABLE public.mcc_service_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brokers manage their MCC requests"
  ON public.mcc_service_requests FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.broker_profiles bp
      WHERE bp.id = mcc_service_requests.broker_id AND bp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.broker_profiles bp
      WHERE bp.id = mcc_service_requests.broker_id AND bp.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_mcc_updated_at
  BEFORE UPDATE ON public.mcc_service_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. broker_referral commission tier (20% lifetime, client subscriptions)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.affiliate_commission_tiers
  (tier_key, display_name, commission_rate, duration_months, is_recurring, notes)
VALUES
  ('broker_referral','Broker (client subscriptions)', 0.20, NULL, true,
   '20% lifetime commission to brokers on client subscriptions attributed to their broker referral code.')
ON CONFLICT (tier_key) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      commission_rate = EXCLUDED.commission_rate,
      duration_months = EXCLUDED.duration_months,
      is_recurring = EXCLUDED.is_recurring,
      notes = EXCLUDED.notes;