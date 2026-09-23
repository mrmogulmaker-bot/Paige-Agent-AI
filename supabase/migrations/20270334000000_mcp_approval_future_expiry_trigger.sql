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
-- maps to a closed `400`. A NULL `expires_at` (the common "no expiry" case) is untouched.
--
-- THE INVARIANT IS UNCONDITIONAL: no write may leave a row whose `expires_at` is in the past. It is NOT
-- inferred from which columns changed (Codex P2, third finding). An earlier form keyed the guard off a
-- change to `expires_at` OR `approved_at` — but the writer stamps `approved_at = now()`, and `now()` is
-- frozen for the transaction, so TWO `set_mcp_connection_approval` calls in ONE transaction write the
-- IDENTICAL `approved_at`; a same-value re-approval after the expiry lapsed then changed NEITHER column
-- and slipped through. Inference from value-changes is fundamentally fragile here, so the guard drops it
-- entirely: any INSERT/UPDATE whose resulting `expires_at` is `<= clock_timestamp()` is refused, full
-- stop. A lapsed approval row is reached ONLY by elapsed time (a stored FUTURE value passing) and is
-- never legitimately re-written thereafter — verify is read-only, and a re-approval MUST carry a fresh
-- FUTURE expiry (which transitions the row forward and passes). There is no maintenance path that touches
-- a lapsed row; a test that must fabricate one disables this trigger for that one deliberate write.
--
-- WALL CLOCK, NOT `now()` (Codex P2, first finding). `now()` is `transaction_timestamp()` — frozen at the
-- transaction's START. The writer takes the `SELECT ... FOR UPDATE` lock BEFORE the write, so a value
-- future when the transaction began can LAPSE while the lock is contended (or between two same-transaction
-- writer calls) yet still satisfy a frozen `now()` compare. So the guard compares against
-- `clock_timestamp()` (the ACTUAL wall clock at the moment the trigger fires), which advances within the
-- transaction — the repo's established write-time expiry pattern (cf. `_mcp_assert_credential_bundle`).
-- ============================================================================

CREATE OR REPLACE FUNCTION public._mcp_reject_past_approval_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Unconditional: any write leaving a non-NULL past expiry is refused, no value-change inference.
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'MCP_EXPIRY_IN_PAST: approval expiry must be in the future' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public._mcp_reject_past_approval_expiry() IS
  'BEFORE INSERT/UPDATE guard on mcp_connection_approvals: UNCONDITIONALLY refuses any write that leaves a '
  'non-NULL expires_at at or before the real wall clock (clock_timestamp(), NOT frozen now()), atomically '
  'with the write on INSERT and the ON CONFLICT re-approval path — no inference from which columns changed. '
  'Closes the approve TOCTOU (a value lapsing during the writer''s FOR UPDATE lock wait, incl. a same-value '
  'or same-transaction re-approval) so approve can never report approved:true for an approval verify would '
  'instantly reject as expired (Codex P2, PR #1375). A lapsed row is reached only by elapsed time and is '
  'never legitimately re-written except a re-approval carrying a fresh future expiry (which passes).';

DROP TRIGGER IF EXISTS trg_mcp_reject_past_approval_expiry ON public.mcp_connection_approvals;
CREATE TRIGGER trg_mcp_reject_past_approval_expiry
  BEFORE INSERT OR UPDATE ON public.mcp_connection_approvals
  FOR EACH ROW EXECUTE FUNCTION public._mcp_reject_past_approval_expiry();
