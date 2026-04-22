
-- 1. Generic admin app settings table (singleton-style key/value)
CREATE TABLE IF NOT EXISTS public.admin_app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read app settings" ON public.admin_app_settings;
CREATE POLICY "Admins can read app settings"
ON public.admin_app_settings FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can write app settings" ON public.admin_app_settings;
CREATE POLICY "Admins can write app settings"
ON public.admin_app_settings FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Seed broker auto-approve = true (current behavior)
INSERT INTO public.admin_app_settings (key, value)
VALUES ('broker_auto_approve', jsonb_build_object('enabled', true))
ON CONFLICT (key) DO NOTHING;

-- 2. Add 'declined' to broker_profiles.status check + decline reason column
ALTER TABLE public.broker_profiles
  DROP CONSTRAINT IF EXISTS broker_profiles_status_check;

ALTER TABLE public.broker_profiles
  ADD CONSTRAINT broker_profiles_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'suspended'::text, 'declined'::text]));

ALTER TABLE public.broker_profiles
  ADD COLUMN IF NOT EXISTS decline_reason TEXT,
  ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ;

-- 3. Public read for the broker_auto_approve flag only (so /broker form can check)
DROP POLICY IF EXISTS "Anyone can read broker_auto_approve flag" ON public.admin_app_settings;
CREATE POLICY "Anyone can read broker_auto_approve flag"
ON public.admin_app_settings FOR SELECT
TO anon, authenticated
USING (key = 'broker_auto_approve');
