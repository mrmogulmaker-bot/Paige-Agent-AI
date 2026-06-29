
CREATE TABLE public.paige_mcp_oauth_clients (
  client_id text PRIMARY KEY,
  client_name text NOT NULL,
  client_uri text,
  redirect_uris text[] NOT NULL,
  grant_types text[] NOT NULL DEFAULT ARRAY['authorization_code','refresh_token'],
  response_types text[] NOT NULL DEFAULT ARRAY['code'],
  token_endpoint_auth_method text NOT NULL DEFAULT 'none',
  scope text NOT NULL DEFAULT 'crm.read',
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.paige_mcp_oauth_clients TO authenticated;
GRANT ALL ON public.paige_mcp_oauth_clients TO service_role;
ALTER TABLE public.paige_mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view mcp clients" ON public.paige_mcp_oauth_clients
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin') OR created_by_user_id = auth.uid());

CREATE TABLE public.paige_mcp_oauth_codes (
  code_hash text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.paige_mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  scopes text[] NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL DEFAULT 'S256',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.paige_mcp_oauth_codes TO service_role;
ALTER TABLE public.paige_mcp_oauth_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.paige_mcp_oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token_hash text NOT NULL UNIQUE,
  refresh_token_hash text UNIQUE,
  client_id text NOT NULL REFERENCES public.paige_mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scopes text[] NOT NULL,
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  client_name_cache text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.paige_mcp_oauth_tokens TO authenticated;
GRANT ALL ON public.paige_mcp_oauth_tokens TO service_role;
ALTER TABLE public.paige_mcp_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view tokens" ON public.paige_mcp_oauth_tokens
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin') OR user_id = auth.uid());
CREATE POLICY "revoke tokens" ON public.paige_mcp_oauth_tokens
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin') OR user_id = auth.uid());

CREATE INDEX idx_paige_mcp_oauth_tokens_user ON public.paige_mcp_oauth_tokens(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_paige_mcp_oauth_codes_expires ON public.paige_mcp_oauth_codes(expires_at);
