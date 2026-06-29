
-- paige_invoices: invoices created via MCP create_invoice / send_invoice tools.
CREATE TABLE IF NOT EXISTS public.paige_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  invoice_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','paid','void','uncollectible')),
  amount_total_cents integer NOT NULL CHECK (amount_total_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  due_date date,
  memo text,
  payment_plan_key text,
  hosted_invoice_url text,
  stripe_invoice_id text,
  sent_at timestamptz,
  sent_to_email text,
  paid_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paige_invoices_tenant ON public.paige_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_paige_invoices_contact ON public.paige_invoices(contact_id);
CREATE INDEX IF NOT EXISTS idx_paige_invoices_status ON public.paige_invoices(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_invoices TO authenticated;
GRANT ALL ON public.paige_invoices TO service_role;

ALTER TABLE public.paige_invoices ENABLE ROW LEVEL SECURITY;

-- Tenant members can view + manage their tenant's invoices.
CREATE POLICY "tenant_members_select_invoices" ON public.paige_invoices
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "tenant_members_insert_invoices" ON public.paige_invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "tenant_members_update_invoices" ON public.paige_invoices
  FOR UPDATE TO authenticated
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()
    )
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_paige_invoices_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_paige_invoices_touch ON public.paige_invoices;
CREATE TRIGGER trg_paige_invoices_touch
  BEFORE UPDATE ON public.paige_invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_paige_invoices_updated_at();

-- Auto-generate human-readable invoice_number (INV-YYYYMM-XXXX) when not provided.
CREATE OR REPLACE FUNCTION public.generate_paige_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  prefix text := 'INV-' || to_char(now(), 'YYYYMM') || '-';
  next_seq int;
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    SELECT COALESCE(MAX( (regexp_replace(invoice_number, '^.*-', ''))::int ), 0) + 1
      INTO next_seq
      FROM public.paige_invoices
     WHERE invoice_number LIKE prefix || '%';
    NEW.invoice_number := prefix || lpad(next_seq::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_paige_invoices_number ON public.paige_invoices;
CREATE TRIGGER trg_paige_invoices_number
  BEFORE INSERT ON public.paige_invoices
  FOR EACH ROW EXECUTE FUNCTION public.generate_paige_invoice_number();
