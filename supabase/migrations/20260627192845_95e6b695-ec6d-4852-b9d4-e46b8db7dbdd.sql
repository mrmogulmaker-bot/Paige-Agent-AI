
-- =========================================================
-- Phase 2: Connector tables
-- =========================================================

-- 1. paige_mcp_connections ---------------------------------
CREATE TABLE public.paige_mcp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  server_url text NOT NULL,
  transport text NOT NULL DEFAULT 'http' CHECK (transport IN ('http','sse','stdio')),
  auth_token_ref text,
  auth_token_last4 text,
  enabled boolean NOT NULL DEFAULT true,
  tools_cache jsonb,
  last_probed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_mcp_connections TO authenticated;
GRANT ALL ON public.paige_mcp_connections TO service_role;
ALTER TABLE public.paige_mcp_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage mcp connections"
  ON public.paige_mcp_connections FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_paige_mcp_connections_enabled ON public.paige_mcp_connections(enabled);

-- 2. paige_n8n_connections ---------------------------------
CREATE TABLE public.paige_n8n_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  base_url text NOT NULL,
  api_key_ref text,
  api_key_last4 text,
  is_default boolean NOT NULL DEFAULT false,
  workflows_cache jsonb,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_n8n_connections TO authenticated;
GRANT ALL ON public.paige_n8n_connections TO service_role;
ALTER TABLE public.paige_n8n_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage n8n connections"
  ON public.paige_n8n_connections FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE UNIQUE INDEX uniq_paige_n8n_default ON public.paige_n8n_connections(is_default) WHERE is_default;

-- 3. paige_subscription_events -----------------------------
CREATE TABLE public.paige_subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE NOT NULL,
  stripe_customer_id text,
  contact_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  tier_before text,
  tier_after text,
  mrr_delta_cents integer,
  currency text DEFAULT 'usd',
  raw jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.paige_subscription_events TO authenticated;
GRANT ALL ON public.paige_subscription_events TO service_role;
ALTER TABLE public.paige_subscription_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read subscription events"
  ON public.paige_subscription_events FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service role writes subscription events"
  ON public.paige_subscription_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE INDEX idx_paige_sub_events_contact ON public.paige_subscription_events(contact_id, created_at DESC);
CREATE INDEX idx_paige_sub_events_type ON public.paige_subscription_events(event_type);
CREATE INDEX idx_paige_sub_events_customer ON public.paige_subscription_events(stripe_customer_id);

-- 4. paige_telegram_config (singleton) ---------------------
CREATE TABLE public.paige_telegram_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bot_token_ref text,
  bot_token_last4 text,
  default_admin_chat_id text,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.paige_telegram_config TO authenticated;
GRANT ALL ON public.paige_telegram_config TO service_role;
ALTER TABLE public.paige_telegram_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage telegram config"
  ON public.paige_telegram_config FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Extend paige_config -----------------------------------
ALTER TABLE public.paige_config
  ADD COLUMN IF NOT EXISTS ghl_pit_ref text,
  ADD COLUMN IF NOT EXISTS ghl_location_id text,
  ADD COLUMN IF NOT EXISTS gmail_default_sender text,
  ADD COLUMN IF NOT EXISTS langsmith_project text DEFAULT 'paige-agent-mma',
  ADD COLUMN IF NOT EXISTS stripe_price_tier_map jsonb DEFAULT '{}'::jsonb;

-- updated_at trigger reuse ---------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column' AND pronamespace = 'public'::regnamespace) THEN
    CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $f$
    BEGIN NEW.updated_at = now(); RETURN NEW; END; $f$;
  END IF;
END $$;

CREATE TRIGGER trg_paige_mcp_connections_updated
  BEFORE UPDATE ON public.paige_mcp_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_paige_n8n_connections_updated
  BEFORE UPDATE ON public.paige_n8n_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_paige_telegram_config_updated
  BEFORE UPDATE ON public.paige_telegram_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
