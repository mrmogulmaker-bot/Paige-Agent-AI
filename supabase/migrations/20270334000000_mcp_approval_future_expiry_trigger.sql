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
-- THE INVARIANT IS "an approval assertion must carry a future expiry", NOT "never touch a lapsed row".
-- The guard fires on a non-future `expires_at` when EITHER the expiry is being introduced/changed
-- (`NEW.expires_at IS DISTINCT FROM OLD`) OR the approval is being (re-)asserted (`NEW.approved_at IS
-- DISTINCT FROM OLD` — the writer stamps `approved_at = now()` on every INSERT and every ON CONFLICT
-- re-approval). A write that touches NEITHER — a truly unrelated maintenance update (e.g. a future
-- usage/health column) to a row whose FUTURE expiry has since lapsed by elapsed time — is left alone;
-- that lapse is genuine expiry (verify reports `approval_expired`), not a writer stamping a dead value.
-- On INSERT `OLD` is NULL, so a non-NULL past `NEW` is DISTINCT on both counts and refused.
--
-- WHY approved_at, NOT ONLY expires_at (Codex P2, second finding). A RE-APPROVAL upserts the SAME
-- `expires_at` value: it can pass the edge pre-check while that value is future, wait on the connection's
-- FOR UPDATE lock until the value lapses, then `ON CONFLICT DO UPDATE` it unchanged while refreshing
-- `approved_at`. Because `NEW.expires_at = OLD.expires_at`, an expiry-only guard SKIPS — and `approve`
-- returns `approved: true` for an already-expired approval. Keying additionally off the `approved_at`
-- refresh catches every fresh approval claim, changed expiry or not.
--
-- WALL CLOCK, NOT `now()` (Codex P2, first finding). `now()` is `transaction_timestamp()` — frozen at
-- the transaction's START. The writer takes the `SELECT ... FOR UPDATE` lock BEFORE the write, so a value
-- future when the transaction began can LAPSE while the lock is contended yet still satisfy a frozen
-- `now()` compare. So the guard compares against `clock_timestamp()` (the ACTUAL wall clock at the moment
-- the trigger fires, after any lock wait), which advances within the transaction.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._mcp_reject_past_approval_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL
     AND NEW.expires_at <= clock_timestamp()
     AND (NEW.expires_at  IS DISTINCT FROM OLD.expires_at
          OR NEW.approved_at IS DISTINCT FROM OLD.approved_at) THEN
    RAISE EXCEPTION 'MCP_EXPIRY_IN_PAST: approval expiry must be in the future' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public._mcp_reject_past_approval_expiry() IS
  'BEFORE INSERT/UPDATE guard on mcp_connection_approvals: refuses a non-future expires_at (vs the real '
  'wall clock, clock_timestamp(), NOT frozen now()) whenever the expiry is INTRODUCED/CHANGED or the '
  'approval is (RE-)ASSERTED (approved_at refreshed) — atomically with the write, on INSERT and the ON '
  'CONFLICT re-approval path. Closes the approve TOCTOU (a value lapsing during the writer''s FOR UPDATE '
  'lock wait, incl. a same-value re-approval) so approve can never report approved:true for an approval '
  'verify would instantly reject as expired (Codex P2, PR #1375). A truly unrelated update (neither '
  'expires_at nor approved_at changed) to a since-lapsed row is left alone — that is real expiry.';

DROP TRIGGER IF EXISTS trg_mcp_reject_past_approval_expiry ON public.mcp_connection_approvals;
CREATE TRIGGER trg_mcp_reject_past_approval_expiry
  BEFORE INSERT OR UPDATE ON public.mcp_connection_approvals
  FOR EACH ROW EXECUTE FUNCTION public._mcp_reject_past_approval_expiry();
