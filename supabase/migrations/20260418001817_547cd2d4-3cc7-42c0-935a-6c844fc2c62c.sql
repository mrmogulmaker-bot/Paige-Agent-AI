-- =========================================================================
-- 1. Fix v_affiliate_stats: remove auth.users join (causes permission denied)
-- =========================================================================
DROP VIEW IF EXISTS public.v_affiliate_stats;

CREATE VIEW public.v_affiliate_stats
WITH (security_invoker = on) AS
SELECT
  ap.id AS affiliate_id,
  ap.user_id,
  p.full_name,
  NULL::text AS email,  -- intentionally null; do not expose auth.users emails via view
  ap.referral_code,
  t.tier_key,
  t.display_name AS tier_name,
  t.commission_rate,
  ap.active,
  COALESCE(clicks.n, 0::bigint) AS clicks,
  COALESCE(signups.n, 0::bigint) AS signups,
  COALESCE(paid.n, 0::bigint) AS paid_conversions,
  COALESCE(paid.commission_owed_cents, 0::bigint) AS commission_owed_cents,
  COALESCE(payments.paid_ytd_cents, 0::bigint) AS commission_paid_ytd_cents
FROM public.affiliate_profiles ap
LEFT JOIN public.profiles p ON p.user_id = ap.user_id
LEFT JOIN public.affiliate_commission_tiers t ON t.id = ap.commission_tier_id
LEFT JOIN LATERAL (
  SELECT count(*) AS n
  FROM public.referral_clicks rc
  WHERE rc.affiliate_id = ap.id
) clicks ON true
LEFT JOIN LATERAL (
  SELECT count(DISTINCT rv.referred_user_id) AS n
  FROM public.referral_conversions rv
  WHERE rv.affiliate_id = ap.id
) signups ON true
LEFT JOIN LATERAL (
  SELECT
    count(*) AS n,
    COALESCE(sum(rv.commission_cents) FILTER (WHERE rv.status = 'attributed'::text), 0::bigint) AS commission_owed_cents
  FROM public.referral_conversions rv
  WHERE rv.affiliate_id = ap.id
) paid ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(sum(cp.amount_cents), 0::bigint) AS paid_ytd_cents
  FROM public.commission_payments cp
  WHERE cp.affiliate_id = ap.id
    AND cp.status = 'paid'::text
    AND cp.period_end >= date_trunc('year'::text, now())
) payments ON true;

GRANT SELECT ON public.v_affiliate_stats TO authenticated, anon;

-- =========================================================================
-- 2. affiliate_applications table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.affiliate_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,                  -- set if applicant was logged in
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NULL,
  website_url text NULL,
  social_links text NULL,
  audience_description text NULL,
  why_join text NULL,
  requested_tier_key text NOT NULL DEFAULT 'external'
    CHECK (requested_tier_key IN ('external','coach','admin')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid NULL,
  reviewed_at timestamptz NULL,
  review_notes text NULL,
  resulting_affiliate_id uuid NULL REFERENCES public.affiliate_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_applications_status ON public.affiliate_applications(status);
CREATE INDEX IF NOT EXISTS idx_affiliate_applications_email ON public.affiliate_applications(lower(email));
CREATE INDEX IF NOT EXISTS idx_affiliate_applications_user_id ON public.affiliate_applications(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.affiliate_applications ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anon) may submit an application
CREATE POLICY "Anyone can submit an affiliate application"
  ON public.affiliate_applications
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- if logged in, user_id must be null or match their own id
    user_id IS NULL OR user_id = auth.uid()
  );

-- Logged-in users can see their own applications
CREATE POLICY "Users can view own applications"
  ON public.affiliate_applications
  FOR SELECT
  TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid());

-- Admins can view all applications
CREATE POLICY "Admins can view all applications"
  ON public.affiliate_applications
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Admins can update applications (approve/reject)
CREATE POLICY "Admins can update applications"
  ON public.affiliate_applications
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- updated_at trigger
CREATE TRIGGER update_affiliate_applications_updated_at
  BEFORE UPDATE ON public.affiliate_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 3. Approve / reject RPCs (admin only, security definer)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.approve_affiliate_application(
  _application_id uuid,
  _tier_key text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _app          public.affiliate_applications%ROWTYPE;
  _tier_id      uuid;
  _final_tier   text;
  _matched_user uuid;
  _code         text;
  _affiliate_id uuid;
  _name_seed    text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  SELECT * INTO _app FROM public.affiliate_applications WHERE id = _application_id;
  IF _app.id IS NULL THEN
    RAISE EXCEPTION 'Application not found';
  END IF;
  IF _app.status <> 'pending' THEN
    RAISE EXCEPTION 'Application is not pending (current status: %)', _app.status;
  END IF;

  _final_tier := COALESCE(_tier_key, _app.requested_tier_key, 'external');

  SELECT id INTO _tier_id
  FROM public.affiliate_commission_tiers
  WHERE tier_key = _final_tier
  LIMIT 1;
  IF _tier_id IS NULL THEN
    RAISE EXCEPTION 'Unknown commission tier: %', _final_tier;
  END IF;

  -- Try to match application to an existing auth user by email
  _matched_user := _app.user_id;
  IF _matched_user IS NULL THEN
    SELECT id INTO _matched_user
    FROM auth.users
    WHERE lower(email) = lower(_app.email)
    LIMIT 1;
  END IF;

  -- If user already has an affiliate profile, just link the application
  IF _matched_user IS NOT NULL THEN
    SELECT id INTO _affiliate_id
    FROM public.affiliate_profiles
    WHERE user_id = _matched_user
    LIMIT 1;
  END IF;

  -- Otherwise create a new affiliate profile
  IF _affiliate_id IS NULL THEN
    IF _matched_user IS NULL THEN
      RAISE EXCEPTION 'Cannot approve: applicant has no account yet. Ask them to sign up at the email %s first, then re-approve.', _app.email;
    END IF;

    -- Generate a unique referral code (mirrors auto_enroll_affiliate logic)
    _name_seed := COALESCE(
      NULLIF(regexp_replace(_app.full_name, '[^a-zA-Z0-9]', '', 'g'), ''),
      'PAIGE'
    );
    _code := upper(substr(_name_seed, 1, 4))
          || upper(substr(md5(random()::text || _matched_user::text), 1, 4));

    FOR i IN 1..5 LOOP
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referral_codes WHERE code = _code);
      _code := upper(substr(_name_seed, 1, 4))
            || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    END LOOP;

    INSERT INTO public.affiliate_profiles
      (user_id, referral_code, commission_tier_id, enrolled_from, active)
    VALUES
      (_matched_user, _code, _tier_id, 'application_' || _final_tier, true)
    RETURNING id INTO _affiliate_id;

    INSERT INTO public.referral_codes (code, affiliate_id, active)
    VALUES (_code, _affiliate_id, true)
    ON CONFLICT (code) DO NOTHING;
  END IF;

  -- Mark application approved
  UPDATE public.affiliate_applications
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = _notes,
      resulting_affiliate_id = _affiliate_id,
      user_id = COALESCE(user_id, _matched_user)
  WHERE id = _application_id;

  RETURN json_build_object(
    'success', true,
    'affiliate_id', _affiliate_id,
    'matched_user_id', _matched_user
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_affiliate_application(
  _application_id uuid,
  _notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  UPDATE public.affiliate_applications
  SET status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = _notes
  WHERE id = _application_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found or not pending';
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_affiliate_application(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_affiliate_application(uuid, text) TO authenticated;