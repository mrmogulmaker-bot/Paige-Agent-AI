-- ============================================================================
-- Connected MCP Gateway — the approval future-expiry trigger (migration 20270334000000).
--
-- Proves `trg_mcp_reject_past_approval_expiry` on `mcp_connection_approvals`:
--   (1)  a PAST expires_at is refused atomically at write time (SQLSTATE 22023, MCP_EXPIRY_IN_PAST) —
--        on a DIRECT insert (the trigger, independent of the writer RPC),
--   (2)  and end-to-end through `set_mcp_connection_approval` (closing the approve TOCTOU),
--   (3)  a FUTURE expires_at is stored,
--   (4)  a NULL expires_at (the common no-expiry case) is stored,
--   (5)  and the ON CONFLICT UPDATE path is also guarded (re-approving with a past expiry is refused).
--
-- Synthetic fixtures only; self-contained; ROLLS BACK. Runs as the superuser test role (auth.uid() is
-- NULL → _mcp_resolve_tenant's trusted path). Any unexpected RAISE = fail (ON_ERROR_STOP); reaching the
-- terminal notice = pass.
-- ============================================================================

BEGIN;

INSERT INTO public.tenants (id, slug, name, status, account_type, account_number_prefix, features) VALUES
  ('eafe0000-0000-0000-0000-0000000000a1','mcpgw-expiry-a','MCPGW Expiry A','active','standalone','MEA','{}'::jsonb);

INSERT INTO public.mcp_connections (connection_id, tenant_id, provider_key, label, server_url_ct) VALUES
  ('eafe0000-0000-0000-0000-0000000000a2','eafe0000-0000-0000-0000-0000000000a1','generic-remote','expiry-target',
     public.platform_encrypt('https://mcp-exp.example/rpc'));

-- ── (1) A DIRECT insert with a PAST expiry is refused by the trigger (SQLSTATE 22023) ──────────────
DO $$
DECLARE _sqlstate text; _raised boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.mcp_connection_approvals (connection_id, tool_name, pin, approved_by, endpoint_hash, expires_at)
    VALUES ('eafe0000-0000-0000-0000-0000000000a2','send_message', repeat('a',64), NULL,
            public._mcp_endpoint_hash('https://mcp-exp.example/rpc'), now() - interval '1 hour');
  EXCEPTION WHEN others THEN
    _raised := true; _sqlstate := SQLSTATE;
  END;
  IF NOT _raised THEN RAISE EXCEPTION '(1) a past expires_at should have been refused by the trigger'; END IF;
  IF _sqlstate <> '22023' THEN RAISE EXCEPTION '(1) expected SQLSTATE 22023, got %', _sqlstate; END IF;
END $$;

-- ── (2) End-to-end through the writer RPC: a past expiry is refused (the approve TOCTOU is closed) ──
DO $$
DECLARE _sqlstate text; _raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.set_mcp_connection_approval(
      'eafe0000-0000-0000-0000-0000000000a2', 'send_message', repeat('a',64),
      'eafe0000-0000-0000-0000-0000000000a1', NULL, now() - interval '5 minutes',
      public._mcp_endpoint_hash('https://mcp-exp.example/rpc'));
  EXCEPTION WHEN others THEN
    _raised := true; _sqlstate := SQLSTATE;
  END;
  IF NOT _raised THEN RAISE EXCEPTION '(2) set_mcp_connection_approval should refuse a past expiry'; END IF;
  IF _sqlstate <> '22023' THEN RAISE EXCEPTION '(2) expected SQLSTATE 22023 from the writer, got %', _sqlstate; END IF;
END $$;

-- ── (3) A FUTURE expiry is stored ─────────────────────────────────────────────────────────────────
SELECT public.set_mcp_connection_approval(
  'eafe0000-0000-0000-0000-0000000000a2', 'send_message', repeat('a',64),
  'eafe0000-0000-0000-0000-0000000000a1', NULL, now() + interval '1 day',
  public._mcp_endpoint_hash('https://mcp-exp.example/rpc'));
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.mcp_connection_approvals
   WHERE connection_id = 'eafe0000-0000-0000-0000-0000000000a2' AND tool_name = 'send_message'
     AND expires_at IS NOT NULL AND expires_at > now();
  IF n <> 1 THEN RAISE EXCEPTION '(3) a future expiry should have been stored: %', n; END IF;
END $$;

-- ── (4) A NULL expiry (no-expiry) is stored ───────────────────────────────────────────────────────
SELECT public.set_mcp_connection_approval(
  'eafe0000-0000-0000-0000-0000000000a2', 'list_records', repeat('b',64),
  'eafe0000-0000-0000-0000-0000000000a1', NULL, NULL,
  public._mcp_endpoint_hash('https://mcp-exp.example/rpc'));
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.mcp_connection_approvals
   WHERE connection_id = 'eafe0000-0000-0000-0000-0000000000a2' AND tool_name = 'list_records' AND expires_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION '(4) a NULL expiry should have been stored: %', n; END IF;
END $$;

-- ── (5) The ON CONFLICT UPDATE path is guarded too: re-approving with a past expiry is refused ─────
DO $$
DECLARE _sqlstate text; _raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.set_mcp_connection_approval(
      'eafe0000-0000-0000-0000-0000000000a2', 'send_message', repeat('a',64),
      'eafe0000-0000-0000-0000-0000000000a1', NULL, now() - interval '1 second',
      public._mcp_endpoint_hash('https://mcp-exp.example/rpc'));
  EXCEPTION WHEN others THEN
    _raised := true; _sqlstate := SQLSTATE;
  END;
  IF NOT _raised THEN RAISE EXCEPTION '(5) re-approving (ON CONFLICT UPDATE) with a past expiry should be refused'; END IF;
  IF _sqlstate <> '22023' THEN RAISE EXCEPTION '(5) expected SQLSTATE 22023 on the update path, got %', _sqlstate; END IF;
END $$;

-- ── (6) An UNRELATED update to an ALREADY-LAPSED row is ALLOWED (the invariant is "never INTRODUCE a
--        past expiry", not "never touch a lapsed row") ─────────────────────────────────────────────
-- Fabricate a lapsed row the way elapsed time would (a stored FUTURE value that later passed), which
-- the guard cannot reproduce at write time — so disable it for that one fixture write only. Then an
-- update that leaves expires_at unchanged (here a pin rotation) must NOT be refused, even though the
-- row's expiry is now in the past.
ALTER TABLE public.mcp_connection_approvals DISABLE TRIGGER trg_mcp_reject_past_approval_expiry;
UPDATE public.mcp_connection_approvals
   SET expires_at = now() - interval '2 hours'
 WHERE connection_id = 'eafe0000-0000-0000-0000-0000000000a2' AND tool_name = 'list_records';
ALTER TABLE public.mcp_connection_approvals ENABLE TRIGGER trg_mcp_reject_past_approval_expiry;
DO $$
DECLARE _raised boolean := false; n int;
BEGIN
  BEGIN
    UPDATE public.mcp_connection_approvals
       SET pin = repeat('c',64)   -- unrelated column; expires_at left unchanged (still past)
     WHERE connection_id = 'eafe0000-0000-0000-0000-0000000000a2' AND tool_name = 'list_records';
  EXCEPTION WHEN others THEN
    _raised := true;
  END;
  IF _raised THEN RAISE EXCEPTION '(6) an unrelated update to a since-lapsed row must NOT be refused'; END IF;
  SELECT count(*) INTO n FROM public.mcp_connection_approvals
   WHERE connection_id = 'eafe0000-0000-0000-0000-0000000000a2' AND tool_name = 'list_records'
     AND pin = repeat('c',64) AND expires_at IS NOT NULL AND expires_at <= now();
  IF n <> 1 THEN RAISE EXCEPTION '(6) the unrelated update should have persisted on the lapsed row: %', n; END IF;
END $$;

-- ── (7) WALL-CLOCK closure (Codex P2) — an expiry future vs FROZEN now() but PAST vs the real wall clock
--        (as it would be after the writer's FOR UPDATE lock wait) is REFUSED, because the guard compares
--        against clock_timestamp(), not now(). The whole test runs in one transaction, so now() is frozen
--        at its start; pin _exp 1s ahead of the REAL clock, then pg_sleep(2) so the wall clock passes it
--        while now() stays behind — a frozen-now() guard would wrongly ACCEPT, clock_timestamp() rejects.
DO $$
DECLARE _exp timestamptz := clock_timestamp() + interval '1 second'; _sqlstate text; _raised boolean := false;
BEGIN
  PERFORM pg_sleep(2);                    -- real time advances past _exp; now() (txn start) stays behind it
  IF _exp <= now() THEN                   -- sanity: prove a frozen-now() compare would NOT have caught this
    RAISE EXCEPTION '(7) precondition failed: _exp must still be FUTURE vs frozen now()';
  END IF;
  BEGIN
    INSERT INTO public.mcp_connection_approvals (connection_id, tool_name, pin, approved_by, endpoint_hash, expires_at)
    VALUES ('eafe0000-0000-0000-0000-0000000000a2','wall_clock_probe', repeat('d',64), NULL,
            public._mcp_endpoint_hash('https://mcp-exp.example/rpc'), _exp);
  EXCEPTION WHEN others THEN _raised := true; _sqlstate := SQLSTATE; END;
  IF NOT _raised THEN RAISE EXCEPTION '(7) an expiry past the WALL CLOCK (future vs frozen now()) must be refused'; END IF;
  IF _sqlstate <> '22023' THEN RAISE EXCEPTION '(7) expected SQLSTATE 22023 from the clock_timestamp guard, got %', _sqlstate; END IF;
END $$;

-- ── (8) A RE-APPROVAL carrying an UNCHANGED but already-lapsed expiry is REFUSED (Codex P2 #2) ───────
-- set_mcp_connection_approval upserts the same expires_at while refreshing approved_at; keying the guard
-- off the approved_at renewal catches it even though expires_at is unchanged (an expiry-only guard would
-- skip and let approve lie). Fabricate the pre-existing lapsed approval (elapsed-time sim) with the guard
-- disabled, then re-approve it through the writer with the SAME (lapsed) expiry.
ALTER TABLE public.mcp_connection_approvals DISABLE TRIGGER trg_mcp_reject_past_approval_expiry;
INSERT INTO public.mcp_connection_approvals (connection_id, tool_name, pin, approved_by, endpoint_hash, expires_at, approved_at)
VALUES ('eafe0000-0000-0000-0000-0000000000a2','renew_probe', repeat('a',64), NULL,
        public._mcp_endpoint_hash('https://mcp-exp.example/rpc'),
        timestamptz '2020-01-01 00:00:00+00', timestamptz '2019-01-01 00:00:00+00');
ALTER TABLE public.mcp_connection_approvals ENABLE TRIGGER trg_mcp_reject_past_approval_expiry;
DO $$
DECLARE _raised boolean := false; _sqlstate text;
BEGIN
  BEGIN
    PERFORM public.set_mcp_connection_approval(
      'eafe0000-0000-0000-0000-0000000000a2','renew_probe', repeat('a',64),
      'eafe0000-0000-0000-0000-0000000000a1', NULL, timestamptz '2020-01-01 00:00:00+00',
      public._mcp_endpoint_hash('https://mcp-exp.example/rpc'));  -- same lapsed expiry; refreshes approved_at
  EXCEPTION WHEN others THEN _raised := true; _sqlstate := SQLSTATE; END;
  IF NOT _raised THEN RAISE EXCEPTION '(8) a re-approval with an unchanged-but-lapsed expiry must be refused'; END IF;
  IF _sqlstate <> '22023' THEN RAISE EXCEPTION '(8) expected SQLSTATE 22023 on the re-approval, got %', _sqlstate; END IF;
END $$;

-- ── (8b) POSITIVE CONTROL: a re-approval that refreshes approved_at but keeps a FUTURE expiry succeeds ─
-- (proves the approved_at clause does not over-reject a legitimate renewal).
SELECT public.set_mcp_connection_approval(
  'eafe0000-0000-0000-0000-0000000000a2','renew_ok', repeat('a',64),
  'eafe0000-0000-0000-0000-0000000000a1', NULL, now() + interval '1 day',
  public._mcp_endpoint_hash('https://mcp-exp.example/rpc'));
SELECT public.set_mcp_connection_approval(   -- re-approve: approved_at refreshed, same future expiry
  'eafe0000-0000-0000-0000-0000000000a2','renew_ok', repeat('a',64),
  'eafe0000-0000-0000-0000-0000000000a1', NULL, now() + interval '1 day',
  public._mcp_endpoint_hash('https://mcp-exp.example/rpc'));
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.mcp_connection_approvals
   WHERE connection_id = 'eafe0000-0000-0000-0000-0000000000a2' AND tool_name = 'renew_ok'
     AND expires_at IS NOT NULL AND expires_at > now();
  IF n <> 1 THEN RAISE EXCEPTION '(8b) a re-approval keeping a FUTURE expiry should have succeeded: %', n; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'MCP_GW_APPROVAL_FUTURE_EXPIRY_PROVEN'; END $$;

ROLLBACK;
