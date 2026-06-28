
CREATE TABLE public.paige_bridge_auth_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  function_name text NOT NULL,
  status int NOT NULL,
  verb text,
  reason text,
  ip text,
  user_agent text,
  alerted_at timestamptz
);

CREATE INDEX idx_bridge_auth_failures_pending
  ON public.paige_bridge_auth_failures (occurred_at DESC)
  WHERE alerted_at IS NULL;

GRANT SELECT ON public.paige_bridge_auth_failures TO authenticated;
GRANT ALL ON public.paige_bridge_auth_failures TO service_role;

ALTER TABLE public.paige_bridge_auth_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read bridge auth failures"
ON public.paige_bridge_auth_failures
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages bridge auth failures"
ON public.paige_bridge_auth_failures
FOR ALL TO service_role
USING (true) WITH CHECK (true);
