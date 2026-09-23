-- ============================================================================
-- Connected MCP Gateway — reject an approval whose expiry is NOT in the future (Codex P2, PR #1375).
--
-- WHY A TRIGGER, NOT AN EDGE CHECK. The `approve` edge already fast-rejects an obviously-past
-- `expires_at`, but an edge-clock check has a TOCTOU window: a value that is in the future when the
-- edge checks it can LAPSE during the intervening tenant/admin/catalog/secret RPCs before
-- `set_mcp_connection_approval` stores it. The row then lands with `expires_at <= now()`, which
-- `verify_mcp_connection_approval` immediately rejects as `approval_expired` — while `approve` already
-- answered `approved: true`. That is the exact §13 honesty defect the edge guard was meant to close,
-- and only a check ATOMIC with the write can close it.
--
-- A BEFORE INSERT OR UPDATE trigger on `mcp_connection_approvals` fires inside the writer's own
-- transaction, on BOTH the INSERT and the `ON CONFLICT DO UPDATE` path, so a lapsed or past expiry can
-- never be stored — regardless of which producer writes it (the writer RPC, or any future one). It
-- raises SQLSTATE 22023 with the closed `MCP_EXPIRY_IN_PAST` token, which the edge's shared
-- `mapWriterError` maps to a closed `400`. A NULL `expires_at` (the common "no expiry" case) and the
-- legacy writers that insert approvals without an expiry are untouched.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._mcp_reject_past_approval_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'MCP_EXPIRY_IN_PAST: approval expiry must be in the future' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public._mcp_reject_past_approval_expiry() IS
  'BEFORE INSERT/UPDATE guard on mcp_connection_approvals: refuses a non-future expires_at atomically '
  'with the write, closing the approve-edge TOCTOU so an approval verify would instantly reject as '
  'expired can never be stored while approve reports approved:true (Codex P2, PR #1375).';

DROP TRIGGER IF EXISTS trg_mcp_reject_past_approval_expiry ON public.mcp_connection_approvals;
CREATE TRIGGER trg_mcp_reject_past_approval_expiry
  BEFORE INSERT OR UPDATE ON public.mcp_connection_approvals
  FOR EACH ROW EXECUTE FUNCTION public._mcp_reject_past_approval_expiry();
