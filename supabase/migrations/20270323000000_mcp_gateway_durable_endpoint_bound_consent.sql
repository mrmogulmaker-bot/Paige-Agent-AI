-- Connected MCP Gateway — Phase C hard-entry safeguards, DB LAYER (#1262 findings 2, 3, 4, 5).
--
-- SERVER-ONLY, ADDITIVE, NON-DESTRUCTIVE. Wires NO live provider, NO Chat, NO endpoint setter.
-- These are the durable-consent + serialization + receipt-vocabulary pieces of the hard-entry
-- gate that MUST hold before any MCP runner is ever wired live (Phase C, parked pending #1255).
-- The effect/risk server-floor (finding 1) and the runner's isError handling (finding 4, TS side)
-- live in `_shared/mcp-gateway/*`; this migration is the schema half they rely on.
--
-- WHAT THIS ADDS, mapped to the findings:
--   2. DURABLE, ENDPOINT-BOUND CONSENT. Today the runner infers consent from a request-supplied
--      pin matching the live tool pin (runner.ts:99) — a fingerprint match is not proof a human
--      approved THIS tool on THIS server. This binds a stored approval to the connection's
--      DECRYPTED endpoint identity (and, optionally, an approved action shape + an expiry), and
--      adds `verify_mcp_connection_approval` as the real "spend": a stored approval whose pin,
--      endpoint identity, action shape and expiry all still hold. The runner calls THIS, never a
--      pin in the request.
--   3. NO approval-write vs endpoint-change RACE. `set_mcp_connection_approval` now takes a
--      `SELECT ... FOR UPDATE` row lock on the connection before recording the approval. A
--      concurrent endpoint change is an UPDATE of the same row (which fires the 20270322000000
--      revoke trigger), so the two acquire the SAME row lock and can never interleave — whichever
--      commits first, the other observes a consistent state (writer-first → the endpoint change's
--      trigger deletes the just-written approval; endpoint-change-first → the writer binds to the
--      NEW endpoint). The endpoint-hash binding is defense-in-depth: even a stale approval that
--      somehow survived would fail verify (endpoint_changed). This is the repo's established
--      serialization idiom (FOR UPDATE on the target row; cf. the Solo Pipeline slice).
--   4. TOOL-LEVEL ERROR is a first-class outcome. The receipt outcome vocabulary gains
--      'tool_error' (the provider RAN the tool and reported failure — distinct from refused /
--      unreachable / unknown) so an honest receipt can never dress a provider error as a success.
--   5. CANONICAL RAIL is the owner-visible truth. No new owner-visible receipt story is created
--      here; the runner routes its final outcome through the existing `record_capability_run`
--      (TS side). `mcp_connection_receipts` stays a platform-owner operational log.
--
-- SECURITY posture is unchanged from 20270319000000: RLS owner-all via is_platform_owner(); all
-- tenant access through DEFINER RPCs gated by _mcp_resolve_tenant (subject = auth.uid(); trusted
-- path only when auth.uid() is NULL); platform_decrypt is service_role-only; anon reaches NONE of
-- these functions (satisfies lint:definer-fns with no exempt escape). §58: nothing is removed —
-- the shipped 20270322000000 endpoint-revoke trigger is kept and this only adds binding on top.

-- ─────────────────────────────────────────────────────────────────────────────────
-- 1. Durable consent binding — ADDITIVE nullable columns on the connection-keyed approval store.
--    Existing approvals keep working as rows; a NULL endpoint_hash marks a pre-Phase-C approval
--    that carries no endpoint binding — verify refuses it (fail-closed) until it is re-approved
--    through the hardened writer. Nothing consumes these approvals live today, so this breaks no
--    live behavior; it only makes the store capable of the full binding (§58 honest note).
-- ─────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.mcp_connection_approvals
  ADD COLUMN IF NOT EXISTS endpoint_hash   text
    CONSTRAINT mcp_connection_approvals_endpoint_hash_hex
      CHECK (endpoint_hash IS NULL OR endpoint_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS args_shape_hash text
    CONSTRAINT mcp_connection_approvals_args_shape_hash_hex
      CHECK (args_shape_hash IS NULL OR args_shape_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS expires_at      timestamptz;

COMMENT ON COLUMN public.mcp_connection_approvals.endpoint_hash IS
  'SHA-256 (domain-tagged) of the connection''s DECRYPTED server endpoint at approval time. Consent is bound to the endpoint identity, not only the tool fingerprint: a re-point to a different server invalidates it (verify_mcp_connection_approval re-checks; the 20270322000000 trigger also deletes on change). NULL = a legacy / pre-Phase-C approval with no endpoint binding — verify refuses it (fail-closed) until re-approved.';
COMMENT ON COLUMN public.mcp_connection_approvals.args_shape_hash IS
  'Optional SHA-256 of the approved ACTION SHAPE (a normalized argument-key shape the caller computes; the DB only stores and compares the hex). When present, verify refuses a call whose action shape differs. NULL = tool-level approval not bound to a specific action shape (the pin already binds the input schema).';
COMMENT ON COLUMN public.mcp_connection_approvals.expires_at IS
  'Optional consent expiry (§68 consent decay). NULL = no expiry. verify refuses an approval at or past this instant.';

-- ─────────────────────────────────────────────────────────────────────────────────
-- 2. Endpoint domain-hash helper — pure, IMMUTABLE, provider-agnostic. Hashes the DECRYPTED
--    endpoint string (the same basis the 20270322000000 trigger compares on, since
--    platform_encrypt is non-deterministic). Domain-tagged so a hash produced here can never be
--    confused with any other SHA-256 in the schema. Not SECURITY DEFINER (no table access, no RLS
--    bypass); the DEFINER functions below call it as owner. Uses the CORE `sha256(bytea)`
--    (pg_catalog) — not pgcrypto's `digest`, which lives in the `extensions` schema and is not on a
--    `search_path TO 'public'` — matching the repo's established SQL-hash idiom (e.g. 20260904052832).
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._mcp_endpoint_hash(_server_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT encode(sha256(convert_to('mcp-endpoint/v1|' || COALESCE(_server_url, ''), 'UTF8')), 'hex')
$$;

-- ─────────────────────────────────────────────────────────────────────────────────
-- 3. Harden the approval WRITER — serialize against endpoint change + record the endpoint binding.
--    §37 PRODUCER INVENTORY (verified 2026-09-14): the only PRE-EXISTING reference to
--    set_mcp_connection_approval anywhere in the repo is its own definition in 20270319000000 —
--    no frontend, sibling edge function, trigger, pg_cron, GitHub Action, external webhook, or
--    n8n/Zapier/MCP caller. (The only NEW callers are this PR's own proofs — the durable-consent
--    psql proof and the endpoint-consent race proof — which exercise the new signature on purpose.)
--    Adding the three trailing OPTIONAL params (defaulted) therefore breaks no caller: a 3- or
--    4-positional call still resolves to this function with the new params defaulted. The
--    signature change requires DROP + re-CREATE and a re-issue of the REVOKE/GRANT (§7 below).
--
--    REVIEWED-ENDPOINT GUARD (Codex P1, 2026-09-14): `_expected_endpoint_hash` is the endpoint the
--    OWNER actually reviewed when they approved. Because the FOR UPDATE below reads the connection's
--    endpoint AS IT IS NOW, a concurrent re-point that wins the lock would otherwise silently rebind
--    the owner's consent to the NEW endpoint. When the caller passes the reviewed hash, this refuses
--    the write if it no longer matches — consent is never rebound to an endpoint the owner did not
--    see. It is OPTIONAL only so the pre-existing signature stays call-compatible; the Phase C
--    approval UI MUST pass it (recorded as a Phase C entry-gate obligation in #1262).
-- ─────────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.set_mcp_connection_approval(uuid, text, text, uuid);
CREATE OR REPLACE FUNCTION public.set_mcp_connection_approval(
  _connection_id        uuid,
  _tool_name            text,
  _pin                  text,
  _tenant_id            uuid DEFAULT NULL,
  _args_shape_hash      text DEFAULT NULL,
  _expires_at           timestamptz DEFAULT NULL,
  _expected_endpoint_hash text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tenant uuid;
  _owner  uuid := auth.uid();
  _conn   public.mcp_connections;
  _endpoint_hash text;
BEGIN
  _tenant := public._mcp_resolve_tenant(_tenant_id, true);

  -- SERIALIZE against a concurrent endpoint change (#1262 finding 3). Locking the connection row
  -- makes this writer and any UPDATE of server_url_ct (which fires the revoke trigger) contend on
  -- the SAME row lock, so they can never interleave. This SELECT also resolves the connection and
  -- proves it belongs to the resolved tenant.
  SELECT * INTO _conn FROM public.mcp_connections WHERE connection_id = _connection_id FOR UPDATE;
  IF _conn.connection_id IS NULL OR _conn.tenant_id <> _tenant THEN
    RAISE EXCEPTION 'MCP_FORBIDDEN: connection not in tenant' USING ERRCODE = '42501';
  END IF;
  IF _tool_name !~ '^[A-Za-z0-9_.:-]{1,64}$' THEN
    RAISE EXCEPTION 'MCP_BAD_TOOL_NAME' USING ERRCODE = '22023';
  END IF;
  IF _pin !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'MCP_BAD_PIN' USING ERRCODE = '22023';
  END IF;
  IF _args_shape_hash IS NOT NULL AND _args_shape_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'MCP_BAD_ARGS_SHAPE' USING ERRCODE = '22023';
  END IF;
  IF _expected_endpoint_hash IS NOT NULL AND _expected_endpoint_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'MCP_BAD_EXPECTED_ENDPOINT' USING ERRCODE = '22023';
  END IF;
  -- A connection with no endpoint has nothing to bind consent to, and nothing to run on. Refuse
  -- rather than record an unbindable approval.
  IF _conn.server_url_ct IS NULL THEN
    RAISE EXCEPTION 'MCP_NO_ENDPOINT: cannot approve a tool on a connection with no endpoint' USING ERRCODE = '22023';
  END IF;

  _endpoint_hash := public._mcp_endpoint_hash(public.platform_decrypt(_conn.server_url_ct));

  -- REVIEWED-ENDPOINT GUARD: never rebind consent to an endpoint the owner did not review. If the
  -- caller asserts the endpoint it showed the owner and the connection has since changed (a re-point
  -- that won the row lock, or any drift between review and submit), refuse rather than bind to the
  -- winner (Codex P1).
  IF _expected_endpoint_hash IS NOT NULL AND _expected_endpoint_hash IS DISTINCT FROM _endpoint_hash THEN
    RAISE EXCEPTION 'MCP_ENDPOINT_CHANGED: connection endpoint changed since the approval was reviewed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.mcp_connection_approvals
    (connection_id, tool_name, pin, approved_by, endpoint_hash, args_shape_hash, expires_at)
  VALUES
    (_connection_id, _tool_name, _pin, _owner, _endpoint_hash, _args_shape_hash, _expires_at)
  ON CONFLICT (connection_id, tool_name) DO UPDATE SET
    pin             = EXCLUDED.pin,
    approved_by     = EXCLUDED.approved_by,
    approved_at     = now(),
    endpoint_hash   = EXCLUDED.endpoint_hash,
    args_shape_hash = EXCLUDED.args_shape_hash,
    expires_at      = EXCLUDED.expires_at;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────
-- 4. The durable consent SPEND / VERIFY (NEW, service-role). The runner calls THIS at execute
--    time (#1262 finding 2) instead of trusting a request-supplied pin. Real consent = a stored
--    approval whose fingerprint (pin), endpoint identity, (optional) action shape, and expiry all
--    still hold against the connection AS IT IS NOW. Returns a closed-vocabulary reason so the
--    runner can map it to an honest refusal code; never leaks provider text.
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verify_mcp_connection_approval(
  _connection_id   uuid,
  _tool_name       text,
  _live_pin        text,
  _args_shape_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _conn public.mcp_connections;
  _appr public.mcp_connection_approvals;
  _current_endpoint_hash text;
BEGIN
  SELECT * INTO _conn FROM public.mcp_connections WHERE connection_id = _connection_id;
  IF _conn.connection_id IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'no_connection');
  END IF;
  IF _conn.server_url_ct IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'endpoint_missing');
  END IF;

  SELECT * INTO _appr FROM public.mcp_connection_approvals
   WHERE connection_id = _connection_id AND tool_name = _tool_name;
  IF _appr.connection_id IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'approval_required');
  END IF;
  -- The fingerprint the approval was recorded at must equal the tool's LIVE fingerprint.
  IF _appr.pin IS DISTINCT FROM _live_pin THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'contract_changed');
  END IF;
  -- A pre-Phase-C approval with no endpoint binding cannot authorize live execution (fail-closed).
  IF _appr.endpoint_hash IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'approval_not_endpoint_bound');
  END IF;
  _current_endpoint_hash := public._mcp_endpoint_hash(public.platform_decrypt(_conn.server_url_ct));
  IF _appr.endpoint_hash IS DISTINCT FROM _current_endpoint_hash THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'endpoint_changed');
  END IF;
  IF _appr.expires_at IS NOT NULL AND _appr.expires_at <= now() THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'approval_expired');
  END IF;
  -- Action-shape binding is enforced ONLY when the approval carries one (optional, "as appropriate").
  IF _appr.args_shape_hash IS NOT NULL AND _appr.args_shape_hash IS DISTINCT FROM _args_shape_hash THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'action_shape_changed');
  END IF;

  RETURN jsonb_build_object('authorized', true, 'reason', 'authorized');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────
-- 5. Tool-level error is a first-class receipt outcome (#1262 finding 4, schema half). Widening a
--    CHECK admits a new value and breaks no existing row (§58). The record_mcp_connection_receipt
--    validator is re-created (same signature) to match; the connection-scoped receipt store stays
--    a platform-owner operational log — the owner-visible truth is the canonical Rail (TS side).
-- ─────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.mcp_connection_receipts
  DROP CONSTRAINT IF EXISTS mcp_connection_receipts_outcome_check;
ALTER TABLE public.mcp_connection_receipts
  ADD CONSTRAINT mcp_connection_receipts_outcome_check
  CHECK (outcome IN ('read_observed','prepared','executed','tool_error','refused','provider_unavailable','outcome_unknown'));

CREATE OR REPLACE FUNCTION public.record_mcp_connection_receipt(
  _connection_id uuid,
  _tool_name     text,
  _outcome       text,
  _run_id        uuid,
  _actor_id      uuid DEFAULT NULL,
  _detail        jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _tenant uuid;
BEGIN
  IF _outcome NOT IN ('read_observed','prepared','executed','tool_error','refused','provider_unavailable','outcome_unknown') THEN
    RAISE EXCEPTION 'MCP_BAD_OUTCOME' USING ERRCODE = '22023';
  END IF;
  SELECT tenant_id INTO _tenant FROM public.mcp_connections WHERE connection_id = _connection_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'MCP_NO_CONNECTION' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.mcp_connection_receipts
    (connection_id, tenant_id, tool_name, outcome, run_id, actor_id, detail)
  VALUES (_connection_id, _tenant, left(_tool_name, 200), _outcome, _run_id, _actor_id, COALESCE(_detail, '{}'::jsonb));
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────
-- 6. Comments.
-- ─────────────────────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.verify_mcp_connection_approval(uuid, text, text, text) IS
  'Phase C durable consent SPEND for the Connected MCP Gateway. Authorizes a tool run ONLY when a stored mcp_connection_approvals row still matches the tool''s live fingerprint (pin), the connection''s current DECRYPTED endpoint identity, the optional approved action shape, and is unexpired. The runner calls this instead of trusting a request-supplied pin (#1262 finding 2). service_role-only; returns a closed-vocabulary reason, never provider text.';
COMMENT ON FUNCTION public.set_mcp_connection_approval(uuid, text, text, uuid, text, timestamptz, text) IS
  'Admin-gated approval writer, hardened for Phase C: takes a FOR UPDATE row lock on the connection so it serializes against any concurrent endpoint change (#1262 finding 3), records the endpoint identity (+ optional action shape / expiry) the consent is bound to, and — when the caller passes the reviewed endpoint hash — refuses to rebind consent to an endpoint the owner did not review (Codex P1). §37: no producer other than this definition existed when the trailing optional params were added.';

-- ─────────────────────────────────────────────────────────────────────────────────
-- 7. Grants — re-issued for the changed set_mcp_connection_approval signature + the new functions.
--    anon reaches NONE (satisfies lint:definer-fns without an exempt escape). platform_decrypt +
--    the endpoint hash stay off the tenant surface.
-- ─────────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.set_mcp_connection_approval(uuid, text, text, uuid, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_mcp_connection_approval(uuid, text, text, uuid, text, timestamptz, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.verify_mcp_connection_approval(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_mcp_connection_approval(uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public._mcp_endpoint_hash(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._mcp_endpoint_hash(text) TO service_role;
