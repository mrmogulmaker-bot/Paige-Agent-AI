CREATE TABLE IF NOT EXISTS public.platform_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

ALTER TABLE public.platform_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.platform_api_keys
  USING (false);
