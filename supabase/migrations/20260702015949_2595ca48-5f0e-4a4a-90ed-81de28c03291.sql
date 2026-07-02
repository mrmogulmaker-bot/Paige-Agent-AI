
-- 1) Tighten consumer_waitlist INSERT policy (no more WITH CHECK true)
DROP POLICY IF EXISTS "anyone joins waitlist" ON public.consumer_waitlist;
CREATE POLICY "anyone joins waitlist"
ON public.consumer_waitlist
FOR INSERT
TO anon, authenticated
WITH CHECK (
  email IS NOT NULL
  AND length(email) BETWEEN 5 AND 254
  AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
);

-- 2) Column-level lockdown for sensitive URL / token columns (§190).
--    Revoke from anon/authenticated/public so RLS-scoped SELECTs cannot return
--    these columns to browser clients. service_role (used by edge functions)
--    retains access. Admin UIs must resolve via server-side RPC.

REVOKE SELECT (webhook_token)      ON public.growth_external_sources   FROM anon, authenticated, PUBLIC;
REVOKE SELECT (url)                ON public.outbound_webhook_configs  FROM anon, authenticated, PUBLIC;
REVOKE SELECT (server_url, auth_token_ref) ON public.paige_mcp_connections FROM anon, authenticated, PUBLIC;
REVOKE SELECT (base_url)           ON public.paige_n8n_connections     FROM anon, authenticated, PUBLIC;
REVOKE SELECT (n8n_webhook_url)    ON public.paige_workflow_registry   FROM anon, authenticated, PUBLIC;

-- Ensure service_role retains full read for edge-function-side resolution.
GRANT SELECT ON public.growth_external_sources   TO service_role;
GRANT SELECT ON public.outbound_webhook_configs  TO service_role;
GRANT SELECT ON public.paige_mcp_connections     TO service_role;
GRANT SELECT ON public.paige_n8n_connections     TO service_role;
GRANT SELECT ON public.paige_workflow_registry   TO service_role;
