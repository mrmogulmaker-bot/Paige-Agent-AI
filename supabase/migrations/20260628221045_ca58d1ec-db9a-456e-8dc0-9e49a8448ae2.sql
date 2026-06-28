
CREATE TABLE IF NOT EXISTS public.btf_workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  btf_deal_id text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by_user_id uuid,
  created_via text NOT NULL DEFAULT 'mma_os',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_btf_invites_client ON public.btf_workspace_invites(client_id);
CREATE INDEX IF NOT EXISTS idx_btf_invites_email ON public.btf_workspace_invites(lower(email));

GRANT SELECT ON public.btf_workspace_invites TO authenticated;
GRANT ALL ON public.btf_workspace_invites TO service_role;

ALTER TABLE public.btf_workspace_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and coaches read btf invites"
  ON public.btf_workspace_invites FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'coach'::app_role)
  );

CREATE POLICY "Service role manages btf invites"
  ON public.btf_workspace_invites FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
