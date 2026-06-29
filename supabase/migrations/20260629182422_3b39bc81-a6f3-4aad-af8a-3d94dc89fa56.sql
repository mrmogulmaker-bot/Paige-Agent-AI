
-- =========================================
-- Tenant Storefront (Part 2)
-- =========================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS platform_fee_bps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS storefront_enabled boolean NOT NULL DEFAULT false;

-- ---------- tenant_stripe_accounts ----------
CREATE TABLE IF NOT EXISTS public.tenant_stripe_accounts (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL UNIQUE,
  account_type text NOT NULL DEFAULT 'standard',
  country text,
  default_currency text,
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  requirements jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_stripe_accounts TO authenticated;
GRANT ALL ON public.tenant_stripe_accounts TO service_role;

ALTER TABLE public.tenant_stripe_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tsa_admin_select ON public.tenant_stripe_accounts
  FOR SELECT TO authenticated
  USING (public.is_tenant_admin(tenant_id) OR public.is_platform_owner());

CREATE POLICY tsa_admin_manage ON public.tenant_stripe_accounts
  FOR ALL TO authenticated
  USING (public.is_tenant_admin(tenant_id) OR public.is_platform_owner())
  WITH CHECK (public.is_tenant_admin(tenant_id) OR public.is_platform_owner());

CREATE TRIGGER tsa_set_updated_at
  BEFORE UPDATE ON public.tenant_stripe_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tenant_set_updated_at();

-- ---------- tenant_products ----------
CREATE TABLE IF NOT EXISTS public.tenant_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  image_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  stripe_product_id text,
  product_type text NOT NULL DEFAULT 'one_time' CHECK (product_type IN ('one_time','recurring','service')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_products_tenant ON public.tenant_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_products_status ON public.tenant_products(tenant_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_products TO authenticated;
GRANT SELECT ON public.tenant_products TO anon;
GRANT ALL ON public.tenant_products TO service_role;

ALTER TABLE public.tenant_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY tp_members_read ON public.tenant_products
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id) OR public.is_platform_owner());

CREATE POLICY tp_public_active_read ON public.tenant_products
  FOR SELECT TO anon
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = tenant_products.tenant_id AND t.storefront_enabled = true
    )
  );

CREATE POLICY tp_admin_manage ON public.tenant_products
  FOR ALL TO authenticated
  USING (public.is_tenant_admin(tenant_id) OR public.is_platform_owner())
  WITH CHECK (public.is_tenant_admin(tenant_id) OR public.is_platform_owner());

CREATE TRIGGER tp_set_updated_at
  BEFORE UPDATE ON public.tenant_products
  FOR EACH ROW EXECUTE FUNCTION public.tenant_set_updated_at();

CREATE TRIGGER tp_stamp_tenant
  BEFORE INSERT ON public.tenant_products
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();

-- ---------- tenant_prices ----------
CREATE TABLE IF NOT EXISTS public.tenant_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  stripe_price_id text,
  nickname text,
  currency text NOT NULL DEFAULT 'usd',
  unit_amount integer NOT NULL CHECK (unit_amount >= 0),
  billing_interval text CHECK (billing_interval IN ('one_time','day','week','month','year')),
  interval_count integer DEFAULT 1 CHECK (interval_count > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_prices_product ON public.tenant_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_tenant_prices_tenant ON public.tenant_prices(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_prices TO authenticated;
GRANT SELECT ON public.tenant_prices TO anon;
GRANT ALL ON public.tenant_prices TO service_role;

ALTER TABLE public.tenant_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY tpr_members_read ON public.tenant_prices
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id) OR public.is_platform_owner());

CREATE POLICY tpr_public_active_read ON public.tenant_prices
  FOR SELECT TO anon
  USING (
    active = true
    AND EXISTS (
      SELECT 1 FROM public.tenant_products p
      JOIN public.tenants t ON t.id = p.tenant_id
      WHERE p.id = tenant_prices.product_id
        AND p.status = 'active'
        AND t.storefront_enabled = true
    )
  );

CREATE POLICY tpr_admin_manage ON public.tenant_prices
  FOR ALL TO authenticated
  USING (public.is_tenant_admin(tenant_id) OR public.is_platform_owner())
  WITH CHECK (public.is_tenant_admin(tenant_id) OR public.is_platform_owner());

CREATE TRIGGER tpr_stamp_tenant
  BEFORE INSERT ON public.tenant_prices
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();

-- ---------- tenant_orders ----------
CREATE TABLE IF NOT EXISTS public.tenant_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.tenant_products(id) ON DELETE SET NULL,
  price_id uuid REFERENCES public.tenant_prices(id) ON DELETE SET NULL,
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text,
  stripe_subscription_id text,
  customer_email text,
  customer_name text,
  amount_total integer,
  currency text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','complete','failed','refunded','cancelled')),
  application_fee_amount integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_orders_tenant ON public.tenant_orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_orders_session ON public.tenant_orders(stripe_session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_orders TO authenticated;
GRANT ALL ON public.tenant_orders TO service_role;

ALTER TABLE public.tenant_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY torders_admin_read ON public.tenant_orders
  FOR SELECT TO authenticated
  USING (public.is_tenant_admin(tenant_id) OR public.is_platform_owner());

CREATE TRIGGER torders_set_updated_at
  BEFORE UPDATE ON public.tenant_orders
  FOR EACH ROW EXECUTE FUNCTION public.tenant_set_updated_at();
