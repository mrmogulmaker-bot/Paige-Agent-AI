
-- 1) Tighten realtime.messages SELECT policy: remove public:% catch-all
DROP POLICY IF EXISTS "Users can subscribe to own topics" ON realtime.messages;
CREATE POLICY "Users can subscribe to own topics"
ON realtime.messages FOR SELECT TO authenticated
USING (
  realtime.topic() LIKE (auth.uid()::text || ':%')
  OR realtime.topic() = auth.uid()::text
  OR realtime.topic() LIKE ('tenant:' || COALESCE(public.current_user_tenant_id()::text, '__none__') || ':%')
);

-- 2) email_send_log admin read
CREATE POLICY "Admins can read send log"
ON public.email_send_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Revoke EXECUTE from anon on SECURITY DEFINER helper functions that don't need anon access
REVOKE EXECUTE ON FUNCTION public.scan_soft_subagents_for_tool_refs() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM anon, authenticated, public;

-- 4) Stripe product mappings table (replace hardcoded map)
CREATE TABLE IF NOT EXISTS public.stripe_product_mappings (
  stripe_product_id TEXT PRIMARY KEY,
  plan_slug TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stripe_product_mappings TO authenticated;
GRANT ALL ON public.stripe_product_mappings TO service_role;
ALTER TABLE public.stripe_product_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage product mappings"
ON public.stripe_product_mappings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read product mappings"
ON public.stripe_product_mappings FOR SELECT TO authenticated
USING (is_active = true);

INSERT INTO public.stripe_product_mappings (stripe_product_id, plan_slug, environment) VALUES
  ('prod_TEkkzqf6jscnks', 'starter', 'production'),
  ('prod_TEkk3Vr0rtOzrW', 'professional', 'production'),
  ('prod_TEkk1OV31G4sSk', 'premium', 'production'),
  ('prod_TEkkY2JB9BWsth', 'enterprise', 'production')
ON CONFLICT (stripe_product_id) DO NOTHING;

-- 5) Column-level restriction on profiles.ssn_last_4
-- Revoke direct column access; only owner can read via dedicated RPC, admins via audit-logged path.
REVOKE SELECT (ssn_last_4) ON public.profiles FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.get_my_ssn_last_4()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ssn_last_4 FROM public.profiles WHERE user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_ssn_last_4() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_ssn_last_4() TO authenticated;
