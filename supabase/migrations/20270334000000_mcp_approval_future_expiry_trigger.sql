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
-- transaction, on BOTH the INSERT and the `ON CONFLICT DO UPDATE` path, so a past expiry can never be
-- STORED — regardless of which producer writes it (the writer RPC, or any future one). It raises
-- SQLSTATE 22023 with the closed `MCP_EXPIRY_IN_PAST` token, which the edge's shared `mapWriterError`
-- maps to a closed `400`. A NULL `expires_at` (the common "no expiry" case) and the legacy writers that
-- insert approvals without an expiry are untouched.
--
-- THE INVARIANT IS "never INTRODUCE a past expiry", NOT "never touch a lapsed row". The guard fires only
-- when a write SETS or CHANGES `expires_at` to a past instant (`NEW.expires_at IS DISTINCT FROM OLD`).
-- An UPDATE that leaves `expires_at` unchanged is allowed even when a stored FUTURE value has since
-- lapsed by elapsed time — that lapse is genuine expiry (verify_mcp_connection_approval reports
-- `approval_expired`), not a writer stamping a dead value, and blocking it would wrongly break any
-- unrelated update (e.g. a future usage/health touch) to an already-expired approval row. On INSERT
-- `OLD` is NULL, so a non-NULL past `NEW` is always DISTINCT and refused — the TOCTOU stays closed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._mcp_reject_past_approval_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL
     AND NEW.expires_at IS DISTINCT FROM OLD.expires_at
     AND NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'MCP_EXPIRY_IN_PAST: approval expiry must be in the future' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public._mcp_reject_past_approval_expiry() IS
  'BEFORE INSERT/UPDATE guard on mcp_connection_approvals: refuses a write that INTRODUCES or CHANGES '
  'expires_at to a non-future instant (NEW.expires_at IS DISTINCT FROM OLD), atomically with the write, '
  'closing the approve-edge TOCTOU so an approval verify would instantly reject as expired can never be '
  'stored while approve reports approved:true (Codex P2, PR #1375). An unrelated update to a row whose '
  'FUTURE expiry has since lapsed by elapsed time is left alone — that is real expiry, not a bad write.';

DROP TRIGGER IF EXISTS trg_mcp_reject_past_approval_expiry ON public.mcp_connection_approvals;
CREATE TRIGGER trg_mcp_reject_past_approval_expiry
  BEFORE INSERT OR UPDATE ON public.mcp_connection_approvals
  FOR EACH ROW EXECUTE FUNCTION public._mcp_reject_past_approval_expiry();
