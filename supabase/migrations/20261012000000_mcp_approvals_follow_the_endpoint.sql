-- An approval belongs to an endpoint, not to a name.
--
-- THE DEFECT
--
-- `approved_capabilities` and `capability_pins` survived both `clear_tenant_mcp_connection`
-- and a reconnect to a DIFFERENT address. An approval was therefore bound to a tool NAME
-- and a SCHEMA HASH and nothing else. So: approve `send_email` on instance A, disconnect,
-- connect instance B — and any tool on B with the same name and the same input schema was
-- immediately runnable by Paige, with no human having approved anything about B.
--
-- Schema pinning was built to stop a tool changing under an approval. It cannot stop the
-- SERVER changing under one, because a hash of the inputs is identical across two servers
-- that expose the same tool. The missing half is that the approval must also be bound to
-- the endpoint it was granted against.
--
-- "Disconnect" also has to mean revocation. It read as revocation and was not one, which
-- is the more dangerous half: an admin who disconnects believes they have withdrawn
-- Paige's access, and the next connection silently restored it.
--
-- THE RULE
--
-- Approvals are cleared when the connection is cleared, and whenever the stored address
-- changes. Re-approving is a human act against the server actually in front of them.

-- ── 1. Disconnect revokes ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.clear_tenant_mcp_connection(
  _provider  text,
  _tenant_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _p text := public._mcp_check_provider(_provider); _tenant uuid;
BEGIN
  _tenant := public._mcp_resolve_tenant(_tenant_id, true);
  UPDATE public.tenant_mcp_connections SET
    server_url_ct           = NULL,
    auth_token_ct           = NULL,
    auth_token_last4        = NULL,
    refresh_token_ct        = NULL,
    access_token_expires_at = NULL,
    oauth_issuer            = NULL,
    oauth_client_id         = NULL,
    oauth_client_secret_ct  = NULL,
    oauth_scopes            = ARRAY[]::text[],
    auth_header_name        = NULL,
    tools_cache             = NULL,
    -- What Paige was allowed to run goes with it. Leaving these is how a disconnect
    -- becomes a pause rather than a revocation.
    approved_capabilities   = '[]'::jsonb,
    capability_pins         = '{}'::jsonb,
    enabled                 = false,
    status                  = 'unconfigured',
    last_error              = NULL,
    updated_by              = auth.uid(),
    updated_at              = now()
  WHERE tenant_id = _tenant AND provider = _p;
END;
$$;

-- ── 2. Pointing at a different server revokes too ─────────────────────────────
-- Enforced by a trigger rather than in each setter, because there are two setters now
-- (n8n's paste, Zapier's grant) and any third would have to remember. A rule that lives
-- in the writers is a rule that holds until someone adds a writer.
CREATE OR REPLACE FUNCTION public._mcp_revoke_approvals_on_endpoint_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Compared on the ciphertext: `platform_encrypt` is deterministic for a given input in
  -- this schema, so an unchanged address encrypts identically and an unchanged connection
  -- keeps its approvals. If that ever stops being true the comparison fails SAFE — it
  -- reads as a change and revokes, which costs a re-approval rather than granting one.
  IF NEW.server_url_ct IS DISTINCT FROM OLD.server_url_ct THEN
    NEW.approved_capabilities := '[]'::jsonb;
    NEW.capability_pins       := '{}'::jsonb;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mcp_revoke_approvals_on_endpoint_change ON public.tenant_mcp_connections;
CREATE TRIGGER trg_mcp_revoke_approvals_on_endpoint_change
  BEFORE UPDATE ON public.tenant_mcp_connections
  FOR EACH ROW
  EXECUTE FUNCTION public._mcp_revoke_approvals_on_endpoint_change();

COMMENT ON FUNCTION public._mcp_revoke_approvals_on_endpoint_change() IS
  'Approvals are granted against a specific server. Changing the stored address withdraws '
  'them, so a reconnect to a different endpoint cannot inherit consent given for another.';

REVOKE ALL ON FUNCTION public._mcp_revoke_approvals_on_endpoint_change() FROM PUBLIC, anon, authenticated;
