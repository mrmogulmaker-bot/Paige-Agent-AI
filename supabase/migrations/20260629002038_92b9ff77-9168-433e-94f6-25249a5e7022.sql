
CREATE TABLE public.email_templates (
  template_key TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  preheader TEXT,
  body_markdown TEXT NOT NULL,
  body_html TEXT,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  category TEXT NOT NULL,
  product_scope TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email templates"
  ON public.email_templates FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- Writes are service-role only (MCP tools, admin edge functions). No INSERT/UPDATE/DELETE policy for authenticated.

CREATE INDEX idx_email_templates_active_category
  ON public.email_templates (category, product_scope) WHERE active = true;

CREATE TRIGGER trg_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
