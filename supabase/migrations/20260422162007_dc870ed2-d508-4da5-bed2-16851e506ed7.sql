-- ============================================================
-- Multi-Business Support: Stage 1 (DB foundation)
-- ============================================================
-- Confirms: businesses.owner_user_id has NO unique constraint (verified).
-- Existing columns reused: parent_business_id, display_order, business_type,
-- organizational_level. Only adding what's missing per spec.

-- 1. Add missing columns to businesses
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS entity_role text,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Optional CHECK on entity_role values (nullable, validated when present)
ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_entity_role_check;
ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_entity_role_check
  CHECK (
    entity_role IS NULL OR entity_role IN (
      'holdco','opco','asset_co','management_co','real_estate_co','media_co','other'
    )
  );

-- Helpful indexes for selector queries
CREATE INDEX IF NOT EXISTS idx_businesses_owner_active
  ON public.businesses(owner_user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_businesses_owner_primary
  ON public.businesses(owner_user_id, is_primary);

-- 2. user_business_limits table
CREATE TABLE IF NOT EXISTS public.user_business_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  max_businesses integer NOT NULL DEFAULT 1,
  additional_businesses_count integer NOT NULL DEFAULT 0,
  additional_business_monthly_fee numeric(10,2) NOT NULL DEFAULT 10.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_business_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own business limits"
  ON public.user_business_limits;
CREATE POLICY "Users view own business limits"
  ON public.user_business_limits
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all business limits"
  ON public.user_business_limits;
CREATE POLICY "Admins view all business limits"
  ON public.user_business_limits
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Service role manages business limits"
  ON public.user_business_limits;
CREATE POLICY "Service role manages business limits"
  ON public.user_business_limits
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins manage business limits"
  ON public.user_business_limits;
CREATE POLICY "Admins manage business limits"
  ON public.user_business_limits
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_user_business_limits_updated_at
  ON public.user_business_limits;
CREATE TRIGGER trg_user_business_limits_updated_at
  BEFORE UPDATE ON public.user_business_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Map plan_slug -> default max_businesses
CREATE OR REPLACE FUNCTION public.default_max_businesses_for_plan(_plan_slug text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE COALESCE(_plan_slug, 'free')
    WHEN 'free' THEN 1
    WHEN 'starter' THEN 1
    WHEN 'professional' THEN 3
    WHEN 'growth' THEN 3
    WHEN 'premium' THEN 999
    WHEN 'scale' THEN 999
    WHEN 'broker' THEN 999
    WHEN 'broker_workspace' THEN 999
    WHEN 'enterprise' THEN 999
    ELSE 1
  END
$$;

-- 4. Effective limit lookup (max + paid add-ons)
CREATE OR REPLACE FUNCTION public.get_user_business_limit(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _max integer;
  _add integer;
  _plan text;
BEGIN
  SELECT max_businesses, additional_businesses_count
    INTO _max, _add
  FROM public.user_business_limits
  WHERE user_id = _user_id;

  IF _max IS NULL THEN
    SELECT plan_slug INTO _plan
    FROM public.user_subscriptions
    WHERE user_id = _user_id
    LIMIT 1;

    _max := public.default_max_businesses_for_plan(_plan);
    _add := 0;
  END IF;

  RETURN COALESCE(_max, 1) + COALESCE(_add, 0);
END;
$$;

-- 5. Backfill rows for every existing user, deriving from current subscription
INSERT INTO public.user_business_limits (user_id, max_businesses)
SELECT
  p.user_id,
  public.default_max_businesses_for_plan(us.plan_slug)
FROM public.profiles p
LEFT JOIN public.user_subscriptions us ON us.user_id = p.user_id
ON CONFLICT (user_id) DO NOTHING;

-- 6. Trigger: when a new user_subscription row is created or plan changes,
--    keep user_business_limits.max_businesses in sync (only if user has not
--    been granted a custom higher limit by admin).
CREATE OR REPLACE FUNCTION public.sync_user_business_limit_from_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_default integer;
  _existing_max integer;
BEGIN
  _new_default := public.default_max_businesses_for_plan(NEW.plan_slug);

  INSERT INTO public.user_business_limits (user_id, max_businesses)
  VALUES (NEW.user_id, _new_default)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT max_businesses INTO _existing_max
  FROM public.user_business_limits
  WHERE user_id = NEW.user_id;

  -- Upgrade automatically; never downgrade an admin-granted higher limit.
  IF _existing_max IS NOT NULL AND _new_default > _existing_max THEN
    UPDATE public.user_business_limits
    SET max_businesses = _new_default,
        updated_at = now()
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_business_limit_from_sub
  ON public.user_subscriptions;
CREATE TRIGGER trg_sync_business_limit_from_sub
  AFTER INSERT OR UPDATE OF plan_slug ON public.user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_business_limit_from_subscription();

-- 7. Trigger: when a profile is created (new signup), seed limits row
CREATE OR REPLACE FUNCTION public.create_default_business_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan text;
BEGIN
  SELECT plan_slug INTO _plan
  FROM public.user_subscriptions
  WHERE user_id = NEW.user_id
  LIMIT 1;

  INSERT INTO public.user_business_limits (user_id, max_businesses)
  VALUES (NEW.user_id, public.default_max_businesses_for_plan(_plan))
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_business_limit
  ON public.profiles;
CREATE TRIGGER trg_create_default_business_limit
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_business_limit();

-- 8. Mark each user's first/oldest business as primary if none exist
UPDATE public.businesses b
SET is_primary = true
WHERE b.id IN (
  SELECT DISTINCT ON (owner_user_id) id
  FROM public.businesses
  WHERE owner_user_id NOT IN (
    SELECT owner_user_id FROM public.businesses WHERE is_primary = true
  )
  ORDER BY owner_user_id, created_at ASC NULLS LAST
);

-- 9. Confirm RLS on businesses already lets users manage their own rows.
-- (Existing policies on businesses are unchanged.)