CREATE TABLE IF NOT EXISTS public.security_canary_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  probe_name text NOT NULL,
  target text NOT NULL,
  status text NOT NULL CHECK (status IN ('pass','regression','error')),
  leaked_columns text[] NOT NULL DEFAULT '{}',
  sample_payload jsonb,
  http_status int,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.security_canary_runs TO authenticated;
GRANT ALL ON public.security_canary_runs TO service_role;

ALTER TABLE public.security_canary_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "security_canary_runs_admin_read"
  ON public.security_canary_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "security_canary_runs_service_write"
  ON public.security_canary_runs
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS security_canary_runs_created_idx
  ON public.security_canary_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS security_canary_runs_status_idx
  ON public.security_canary_runs (status, created_at DESC);