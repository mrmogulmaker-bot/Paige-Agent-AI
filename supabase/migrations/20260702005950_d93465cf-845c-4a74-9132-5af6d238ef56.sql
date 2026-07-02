
-- Ship #2.5 — Billing Model Foundation (Doctrine §197)

CREATE OR REPLACE FUNCTION public.is_platform_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  );
$$;

-- LAYER 1
CREATE TABLE public.platform_subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  monthly_price_cents integer NOT NULL DEFAULT 0,
  annual_price_cents integer,
  included_seats integer NOT NULL DEFAULT 1,
  included_contacts integer,
  metered_addons jsonb NOT NULL DEFAULT '{}'::jsonb,
  stripe_price_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.platform_subscription_plans IS 'LAYER 1 (Platform Subscriptions Tenant->Paige) per Doctrine §197';
GRANT SELECT ON public.platform_subscription_plans TO authenticated;
GRANT ALL ON public.platform_subscription_plans TO service_role;
ALTER TABLE public.platform_subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans readable by authenticated" ON public.platform_subscription_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "platform owner writes plans" ON public.platform_subscription_plans FOR ALL TO authenticated USING (public.is_platform_owner(auth.uid())) WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE TABLE public.platform_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.platform_subscription_plans(id),
  status text NOT NULL DEFAULT 'active',
  billing_period text NOT NULL DEFAULT 'monthly',
  current_period_start timestamptz,
  current_period_end timestamptz,
  stripe_subscription_id text,
  stripe_customer_id text,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, stripe_subscription_id)
);
COMMENT ON TABLE public.platform_subscriptions IS 'LAYER 1 (Platform Subscriptions Tenant->Paige) per Doctrine §197';
CREATE INDEX ON public.platform_subscriptions(tenant_id);
GRANT SELECT, INSERT, UPDATE ON public.platform_subscriptions TO authenticated;
GRANT ALL ON public.platform_subscriptions TO service_role;
ALTER TABLE public.platform_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenants read own platform sub" ON public.platform_subscriptions FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() OR public.is_platform_owner(auth.uid()));
CREATE POLICY "platform owner writes platform subs" ON public.platform_subscriptions FOR ALL TO authenticated USING (public.is_platform_owner(auth.uid())) WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE TABLE public.platform_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.platform_subscriptions(id) ON DELETE SET NULL,
  invoice_number text UNIQUE,
  status text NOT NULL DEFAULT 'draft',
  subtotal_cents integer NOT NULL DEFAULT 0,
  metering_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  period_start timestamptz,
  period_end timestamptz,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  stripe_invoice_id text,
  hosted_invoice_url text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.platform_invoices IS 'LAYER 1 (Platform Subscriptions Tenant->Paige) per Doctrine §197';
CREATE INDEX ON public.platform_invoices(tenant_id);
GRANT SELECT ON public.platform_invoices TO authenticated;
GRANT ALL ON public.platform_invoices TO service_role;
ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenants read own platform invoices" ON public.platform_invoices FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() OR public.is_platform_owner(auth.uid()));
CREATE POLICY "platform owner writes platform invoices" ON public.platform_invoices FOR ALL TO authenticated USING (public.is_platform_owner(auth.uid())) WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE TABLE public.platform_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reconciled_invoice_id uuid REFERENCES public.platform_invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.platform_usage_events IS 'LAYER 1 (Platform Subscriptions Tenant->Paige) per Doctrine §197';
CREATE INDEX ON public.platform_usage_events(tenant_id, occurred_at);
GRANT SELECT ON public.platform_usage_events TO authenticated;
GRANT ALL ON public.platform_usage_events TO service_role;
ALTER TABLE public.platform_usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenants read own platform usage" ON public.platform_usage_events FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() OR public.is_platform_owner(auth.uid()));
CREATE POLICY "platform owner writes platform usage" ON public.platform_usage_events FOR ALL TO authenticated USING (public.is_platform_owner(auth.uid())) WITH CHECK (public.is_platform_owner(auth.uid()));

-- LAYER 2 additions
CREATE TABLE public.tenant_service_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  end_customer_user_id uuid,
  end_customer_contact_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.tenant_products(id) ON DELETE SET NULL,
  price_id uuid REFERENCES public.tenant_prices(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  billing_period text NOT NULL DEFAULT 'monthly',
  current_period_start timestamptz,
  current_period_end timestamptz,
  stripe_subscription_id text,
  stripe_customer_id text,
  application_fee_amount integer,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.tenant_service_subscriptions IS 'LAYER 2 (Tenant Service Offerings End Customer->Tenant) per Doctrine §197';
CREATE INDEX ON public.tenant_service_subscriptions(tenant_id);
CREATE INDEX ON public.tenant_service_subscriptions(end_customer_user_id);
GRANT SELECT, INSERT, UPDATE ON public.tenant_service_subscriptions TO authenticated;
GRANT ALL ON public.tenant_service_subscriptions TO service_role;
ALTER TABLE public.tenant_service_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant staff manages own service subs" ON public.tenant_service_subscriptions FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() OR public.is_platform_owner(auth.uid())) WITH CHECK (tenant_id = public.current_user_tenant_id() OR public.is_platform_owner(auth.uid()));
CREATE POLICY "end customer reads own service sub" ON public.tenant_service_subscriptions FOR SELECT TO authenticated USING (end_customer_user_id = auth.uid());

CREATE TABLE public.tenant_service_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.tenant_service_subscriptions(id) ON DELETE SET NULL,
  end_customer_user_id uuid,
  event_type text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price_cents integer,
  amount_cents integer,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.tenant_service_usage_events IS 'LAYER 2 (Tenant Service Offerings End Customer->Tenant) per Doctrine §197';
CREATE INDEX ON public.tenant_service_usage_events(tenant_id, occurred_at);
GRANT SELECT, INSERT ON public.tenant_service_usage_events TO authenticated;
GRANT ALL ON public.tenant_service_usage_events TO service_role;
ALTER TABLE public.tenant_service_usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant manages own service usage" ON public.tenant_service_usage_events FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id() OR public.is_platform_owner(auth.uid())) WITH CHECK (tenant_id = public.current_user_tenant_id() OR public.is_platform_owner(auth.uid()));

-- LAYER 3
CREATE TABLE public.platform_metered_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  end_customer_user_id uuid,
  end_customer_contact_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  service_category text NOT NULL,
  event_type text NOT NULL,
  provider text,
  quantity numeric NOT NULL DEFAULT 1,
  wholesale_cost_usd numeric(12,4) NOT NULL DEFAULT 0,
  tenant_billing_method text,
  tenant_retail_charge_usd numeric(12,4),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  reconciliation_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.platform_metered_events IS 'LAYER 3 (Platform Pass-Through Metering End Customer->Paige via Tenant) per Doctrine §197. Always bills tenant wholesale cost regardless of tenant billing_method.';
CREATE INDEX ON public.platform_metered_events(tenant_id, occurred_at);
CREATE INDEX ON public.platform_metered_events(service_category, occurred_at);
GRANT SELECT ON public.platform_metered_events TO authenticated;
GRANT ALL ON public.platform_metered_events TO service_role;
ALTER TABLE public.platform_metered_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenants read own metered events" ON public.platform_metered_events FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() OR public.is_platform_owner(auth.uid()));
CREATE POLICY "platform owner writes metered events" ON public.platform_metered_events FOR ALL TO authenticated USING (public.is_platform_owner(auth.uid())) WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE TABLE public.platform_metering_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  service_category text NOT NULL,
  event_count integer NOT NULL DEFAULT 0,
  total_wholesale_cost_usd numeric(14,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  invoice_id uuid REFERENCES public.platform_invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, period_start, period_end, service_category)
);
COMMENT ON TABLE public.platform_metering_reconciliation IS 'LAYER 3 (Platform Pass-Through Metering End Customer->Paige via Tenant) per Doctrine §197. Sole cross-layer bridge to LAYER 1 invoices.';
GRANT SELECT ON public.platform_metering_reconciliation TO authenticated;
GRANT ALL ON public.platform_metering_reconciliation TO service_role;
ALTER TABLE public.platform_metering_reconciliation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenants read own reconciliation" ON public.platform_metering_reconciliation FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id() OR public.is_platform_owner(auth.uid()));
CREATE POLICY "platform owner writes reconciliation" ON public.platform_metering_reconciliation FOR ALL TO authenticated USING (public.is_platform_owner(auth.uid())) WITH CHECK (public.is_platform_owner(auth.uid()));

-- LAYER 4
CREATE TABLE public.consumer_subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  monthly_price_cents integer NOT NULL DEFAULT 0,
  annual_price_cents integer,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  stripe_price_id text,
  is_active boolean NOT NULL DEFAULT false,
  launch_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.consumer_subscription_plans IS 'LAYER 4 (Consumer Direct Consumer->Paige) per Doctrine §197. Empty until 2027 launch.';
GRANT SELECT ON public.consumer_subscription_plans TO authenticated;
GRANT SELECT ON public.consumer_subscription_plans TO anon;
GRANT ALL ON public.consumer_subscription_plans TO service_role;
ALTER TABLE public.consumer_subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consumer plans public read" ON public.consumer_subscription_plans FOR SELECT USING (is_active = true);
CREATE POLICY "platform owner writes consumer plans" ON public.consumer_subscription_plans FOR ALL TO authenticated USING (public.is_platform_owner(auth.uid())) WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE TABLE public.consumer_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.consumer_subscription_plans(id),
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  stripe_subscription_id text,
  stripe_customer_id text,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.consumer_subscriptions IS 'LAYER 4 (Consumer Direct Consumer->Paige) per Doctrine §197.';
CREATE INDEX ON public.consumer_subscriptions(user_id);
GRANT SELECT ON public.consumer_subscriptions TO authenticated;
GRANT ALL ON public.consumer_subscriptions TO service_role;
ALTER TABLE public.consumer_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consumer reads own sub" ON public.consumer_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_platform_owner(auth.uid()));
CREATE POLICY "platform owner writes consumer subs" ON public.consumer_subscriptions FOR ALL TO authenticated USING (public.is_platform_owner(auth.uid())) WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE TABLE public.consumer_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subscription_id uuid REFERENCES public.consumer_subscriptions(id) ON DELETE SET NULL,
  invoice_number text UNIQUE,
  status text NOT NULL DEFAULT 'draft',
  total_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  stripe_invoice_id text,
  hosted_invoice_url text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.consumer_invoices IS 'LAYER 4 (Consumer Direct Consumer->Paige) per Doctrine §197.';
CREATE INDEX ON public.consumer_invoices(user_id);
GRANT SELECT ON public.consumer_invoices TO authenticated;
GRANT ALL ON public.consumer_invoices TO service_role;
ALTER TABLE public.consumer_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consumer reads own invoices" ON public.consumer_invoices FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_platform_owner(auth.uid()));
CREATE POLICY "platform owner writes consumer invoices" ON public.consumer_invoices FOR ALL TO authenticated USING (public.is_platform_owner(auth.uid())) WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE TABLE public.consumer_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.consumer_waitlist IS 'LAYER 4 (Consumer Direct Consumer->Paige) waitlist per Doctrine §197.';
GRANT INSERT ON public.consumer_waitlist TO anon, authenticated;
GRANT ALL ON public.consumer_waitlist TO service_role;
ALTER TABLE public.consumer_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone joins waitlist" ON public.consumer_waitlist FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "platform owner reads waitlist" ON public.consumer_waitlist FOR SELECT TO authenticated USING (public.is_platform_owner(auth.uid()));

-- updated_at triggers
CREATE TRIGGER trg_psp_updated BEFORE UPDATE ON public.platform_subscription_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ps_updated BEFORE UPDATE ON public.platform_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pi_updated BEFORE UPDATE ON public.platform_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tss_updated BEFORE UPDATE ON public.tenant_service_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pmr_updated BEFORE UPDATE ON public.platform_metering_reconciliation FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_csp_updated BEFORE UPDATE ON public.consumer_subscription_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cs_updated BEFORE UPDATE ON public.consumer_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ci_updated BEFORE UPDATE ON public.consumer_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
