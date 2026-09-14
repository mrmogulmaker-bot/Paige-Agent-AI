-- Connection-keyed twin of "an approval belongs to an endpoint, not to a name."
--
-- THE GAP (Codex review of #1258 / gateway issue #1262, finding 5)
--
-- The legacy MCP registry (`tenant_mcp_connections`) already revokes approvals when a
-- connection's stored endpoint changes — `_mcp_revoke_approvals_on_endpoint_change`
-- (migration 20261012000000). Its reason is exact: schema pinning stops a tool changing
-- under an approval, but it cannot stop the SERVER changing under one, because a hash of a
-- tool's inputs is identical across two servers that expose the same tool. So approve
-- `send_email` against server A, re-point the connection at server B, and any tool on B
-- with the same name + fingerprint would inherit consent granted for A.
--
-- Phase S (20270319000000) introduced a SECOND, connection-keyed approval store —
-- `mcp_connection_approvals`, keyed by an immutable `connection_id` — and did NOT carry the
-- endpoint-change revocation across. This migration adds it, narrowly. Nothing else about
-- the gateway is touched: no runner, no chat, no Spine/Orchestration wiring, no provider
-- call, no Phase C scope.
--
-- THE RULE (reused from the legacy behavior, adapted to the child-table model)
--
-- The legacy trigger reset the approval COLUMNS (`approved_capabilities`, `capability_pins`)
-- on the connection row itself. Phase S stores approvals as CHILD ROWS in
-- `mcp_connection_approvals`, so the faithful equivalent of "clear the approvals" is to
-- DELETE every child row for that `connection_id` when the endpoint changes.
--
-- WHY THE COMPARISON IS ON THE DECRYPTED ENDPOINT (the legacy's hard-won lesson, preserved)
--
-- `platform_encrypt` is `pgp_sym_encrypt`, which carries a random session key, so the same
-- address encrypts to different bytes on every call. A CIPHERTEXT comparison would read
-- "changed" on every re-encryption — an admin who merely rotated a key, with the endpoint
-- unchanged, would silently lose every approval. The legacy trigger's own history records a
-- version that compared ciphertext, "proved" by a stub whose encryption was deterministic,
-- so the proof agreed with the comment and both were wrong about production. We therefore
-- compare the DECRYPTED endpoints and revoke ONLY when the address actually differs.
--
-- WHY SECURITY DEFINER (a deliberate divergence from the legacy trigger, which is not DEFINER)
--
-- The legacy reset columns on the very row being updated — no cross-table write, so the
-- firing UPDATE's own privileges sufficed. Here the revocation is a DELETE on a SEPARATE
-- table, `mcp_connection_approvals`, which has RLS ENABLED (owner-all). A non-DEFINER
-- trigger's DELETE would be RLS-filtered and could silently affect ZERO rows — a revocation
-- that silently does nothing is the exact failure this safeguard exists to prevent. Running
-- the function as its owner makes the revocation reliable. It is §59-safe: it is a TRIGGER,
-- not a callable API (EXECUTE is revoked from PUBLIC/anon/authenticated); it fires ONLY as a
-- side effect of an UPDATE to `mcp_connections`, whose own RLS (owner-only) already gates who
-- may update a connection; and it deletes ONLY rows for the SAME `connection_id` being
-- updated (`NEW.connection_id`) — it never reaches another connection or another tenant.

CREATE OR REPLACE FUNCTION public._mcp_gw_revoke_approvals_on_endpoint_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Fast path: an UPDATE that did not assign `server_url_ct` carries the column forward
  -- byte-identically, so the endpoint is unchanged and there is nothing to revoke. This
  -- also skips a decrypt on the common label / status / health / provider_state edits — the
  -- non-endpoint edits that must NOT revoke.
  IF NEW.server_url_ct IS NOT DISTINCT FROM OLD.server_url_ct THEN
    RETURN NULL;
  END IF;

  -- The stored bytes differ: either a genuine re-point OR a re-encryption of the same
  -- address (e.g. a key rotation). Compare the DECRYPTED endpoints — never the ciphertext —
  -- so a re-encryption of the same value does NOT revoke, while a real re-point does.
  IF public.platform_decrypt(NEW.server_url_ct) IS DISTINCT FROM public.platform_decrypt(OLD.server_url_ct) THEN
    DELETE FROM public.mcp_connection_approvals WHERE connection_id = NEW.connection_id;
  END IF;

  RETURN NULL;  -- AFTER ROW trigger: the return value is ignored.
END;
$$;

DROP TRIGGER IF EXISTS trg_mcp_gw_revoke_approvals_on_endpoint_change ON public.mcp_connections;
CREATE TRIGGER trg_mcp_gw_revoke_approvals_on_endpoint_change
  AFTER UPDATE ON public.mcp_connections
  FOR EACH ROW
  EXECUTE FUNCTION public._mcp_gw_revoke_approvals_on_endpoint_change();

COMMENT ON FUNCTION public._mcp_gw_revoke_approvals_on_endpoint_change() IS
  'Connection-keyed twin of _mcp_revoke_approvals_on_endpoint_change (20261012000000): an '
  'approval in mcp_connection_approvals is granted against a specific server, so changing a '
  'connection''s stored endpoint DELETEs every approval for that connection_id. Compared on '
  'the DECRYPTED endpoint because platform_encrypt is non-deterministic; SECURITY DEFINER '
  'because the revocation is a DELETE on the RLS-gated child table and must never silently '
  'no-op. Fires only as a side effect of an authorized mcp_connections UPDATE and touches '
  'only the same connection_id.';

-- Defense-in-depth: a trigger function is invoked by the trigger mechanism, never by a
-- caller, so no role needs EXECUTE. Revoke it so it can never be called directly.
REVOKE ALL ON FUNCTION public._mcp_gw_revoke_approvals_on_endpoint_change() FROM PUBLIC, anon, authenticated;
