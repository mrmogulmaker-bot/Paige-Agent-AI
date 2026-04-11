
-- Table for platform API keys (inbound webhook auth)
CREATE TABLE public.platform_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Inbound Webhook Key',
  created_by UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

ALTER TABLE public.platform_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage API keys"
ON public.platform_api_keys
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Table for outbound webhook configurations
CREATE TABLE public.outbound_webhook_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  subscribed_events TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.outbound_webhook_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage outbound webhooks"
ON public.outbound_webhook_configs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_outbound_webhook_configs_updated_at
BEFORE UPDATE ON public.outbound_webhook_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table for webhook event log (both inbound and outbound)
CREATE TABLE public.webhook_event_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  event_type TEXT NOT NULL,
  target_url TEXT,
  payload_summary JSONB,
  request_payload JSONB,
  response_body TEXT,
  http_status INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('success', 'failed', 'pending')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view webhook logs"
ON public.webhook_event_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service can insert webhook logs"
ON public.webhook_event_log
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow edge functions to insert logs via service role (no RLS bypass needed since service role bypasses RLS)

CREATE INDEX idx_webhook_event_log_created_at ON public.webhook_event_log (created_at DESC);
CREATE INDEX idx_webhook_event_log_direction ON public.webhook_event_log (direction);
