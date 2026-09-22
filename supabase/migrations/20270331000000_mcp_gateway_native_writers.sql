-- ============================================================================
-- Connected MCP Gateway — NATIVE-connection WRITERS (G1a-1, MCP PR-G1a).
--
-- WHAT THIS PR IS. It makes public.mcp_connections the sole WRITE authority for NATIVE
-- connections (legacy_source IS NULL) across every facet the registry supports:
--   (a) generic remote MCP     — auth_kind ∈ {oauth,bearer,header,url,none}  (create_mcp_connection)
--   (b) Zapier MCP OAuth       — provider_key='zapier', auth_kind ∈ {oauth,url} (create_mcp_connection)
--   (c) n8n MCP OAuth          — provider_key='n8n',    auth_kind='oauth'       (create_mcp_connection)
--   (d) n8n REST api-key        — provider_key='n8n',    auth_kind='api_key'
--                                 (create_mcp_rest_connection + set_mcp_rest_connection_endpoint)
-- It ships connect / re-key / disconnect writers. It seeds NO provider rows (the 20270319000000
-- seeds — generic-remote, n8n, zapier — already cover all four facets). It touches NO legacy
-- code or table (tenant_mcp_connections / tenant_n8n_connections remain the sole LIVE path until a
-- later cutover), NO _shared/* TypeScript, and adds NO runtime flag, NO execution wiring, NO probe,
-- and NO outbound call. The RPCs ARE directly JWT-invokable, so their authority gate + URL
-- validation + tenant scope must be correct on merge, not deferred to activation.
--
-- SINGLE HOME FOR CREDENTIAL-BUNDLE VALIDATION (coordinator ruling, G1a-1 Correction 1). The
-- per-kind credential-bundle validation that lived inline in set_mcp_connection_endpoint
-- (20270330000000:626-692) is EXTRACTED verbatim into public._mcp_assert_credential_bundle. This
-- migration then CREATE-OR-REPLACEs set_mcp_connection_endpoint with a body IDENTICAL to
-- 20270330000000 EXCEPT that the inline IF/ELSIF bundle block (:626-692) is replaced by a single
-- PERFORM of the helper — nothing else in the setter changes (order, api_key gate, endpoint-safe
-- gate, atomic UPDATE, provider_state/status/health reset, in-txn audit, write-only return, grants,
-- COMMENT are all identical). create_mcp_connection calls the SAME helper in the SAME order. So the
-- bundle logic exists in exactly ONE place; there is no helper-plus-pinned-duplicate to drift. The
-- EXISTING setter pgTAP (supabase/tests/mcp_gateway_endpoint_setter.sql) and the two-halves
-- loader-parity smoke (scripts/mcp-gateway-smoke.mjs) prove the swap changed no behavior — they pass
-- UNCHANGED. The api_key→MCP_AUTH_KIND_NOT_EXECUTABLE gate stays INLINE in every caller (it is an
-- auth_kind decision, not a bundle-shape one); the helper is per-kind bundle validation ONLY.
--
-- AUTHORITY (§9, mirrors set_mcp_connection_endpoint :583-593). Every writer resolves the caller's
-- tenant SERVER-SIDE via public._mcp_resolve_tenant(_tenant, false) BEFORE any row is read, then
-- requires a CAPABILITY (never a role literal) from public._mcp_caller_capabilities for THAT tenant:
--   • create / re-key / disable → 'mcp.connections.manage' (owner / tenant-admin of THIS tenant only;
--     a platform owner is EXCLUDED — platform authority is not tenant-management authority, A2).
--   • HARD delete               → 'mcp.connections.delete' (this PR adds this capability, owner /
--     tenant-admin of THIS tenant only; platform owner EXCLUDED — a destructive action carries the
--     stricter, separate key so it can be delegated independently, D2).
-- A NULL actor (service-role / headless) holds {} and is refused — NO silent service-role bypass
-- (INT-089). A missing or foreign-tenant connection is a UNIFORM MCP_FORBIDDEN (no existence oracle
-- across tenants, §9); only an authorized manage/delete-capable admin of the connection's own tenant
-- reaches the existence / D1-legacy distinctions. This is the exact resolve-tenant-first shape the
-- setter and set_mcp_connection_approval use.
--
-- D1 — every writer REFUSES a legacy-projected row (legacy_source IS NOT NULL) with
--      MCP_LEGACY_CONNECTION_READONLY: the legacy live path owns those rows (§57); a native writer
--      never diverges a projection from its source of truth.
--
-- SSRF / endpoint safety (A4). EVERY endpoint (generic MCP server_url AND the REST base_url) is
-- validated by the SAME guard as the MCP setter — public._mcp_endpoint_write_safe (20270330000000):
-- https/TLS-only, userinfo refused, every non-public IP LITERAL refused (parsed to inet and
-- range-checked by VALUE, notation-agnostic, at full parity with ssrfGuard.ts's ipUnsafe), encoded /
-- shorthand IPv4 refused, DNS-name syntax enforced, ports range-checked, bounded, no DNS lookup. This
-- is a WRITE-TIME STATIC layer only — hostname→private-IP resolution and redirect following at
-- egress remain the runtime guard's job (_shared/mcp-client.ts, wired in G2), never this migration's.
--
-- Credential-at-rest (A1/A3). server_url / auth_token / refresh_token / oauth_client_secret are
-- platform_encrypt'd into their *_ct columns; auth_token_last4 is a NON-secret trailing-4 hint
-- emitted ONLY for a token of length >= 12 (NULL below that — right(token,4) on a short token would
-- leak the whole credential); this mirrors set_mcp_connection_endpoint :704. NO writer ever RETURNS a
-- secret or a decrypted URL, and NO audit payload ever carries a URL / token / ciphertext — hashes
-- (endpoint_hash, derived via public._mcp_endpoint_hash of the decrypted endpoint), enums, the
-- provider_key/label/visibility, last4, and counts ONLY. Every change is recorded in the SAME
-- transaction into public.paige_audit_log (a failing audit aborts the write); actor_user_id =
-- auth.uid() (a real tenant-admin — the capability gate refused a NULL actor).
--
-- HARD-DELETE PRESERVES HISTORY (coordinator ruling, G1a-1 Correction 2). A hard delete removes the
-- connection row and its LIVE child state, but must NOT destroy the operational HISTORY. Every FK to
-- public.mcp_connections and its ON DELETE behavior after this migration:
--   • mcp_connection_approvals.connection_id   → ON DELETE CASCADE   (20270319000000:166) — LIVE
--       consent state; correctly removed with the connection (an approval for a deleted connection is
--       meaningless).
--   • mcp_connection_tools.connection_id       → ON DELETE CASCADE   (20270319000000:149) — LIVE
--       discovered-tool catalog; correctly removed with the connection.
--   • mcp_connection_receipts.connection_id    → ON DELETE SET NULL  (THIS migration changes it from
--       the 20270319000000:183 ON DELETE CASCADE) — HISTORY; a receipt is an audit of what ran and
--       MUST survive the connection's deletion, unlinked (connection_id→NULL, tenant_id retained). The
--       column is made NULLABLE here for the same reason.
--   • paige_workspace_events.connection_id     → ON DELETE SET NULL  (20270319000000:207, unchanged) —
--       shared receipt store; already history-preserving, left as-is.
--   • paige_audit_log — NO FK to mcp_connections (target_id is a bare uuid) — audit rows survive a
--       delete unconditionally.
-- disconnect_mcp_connection(_hard=true) writes the 'mcp_connection.deleted' audit row FIRST, then
-- deletes the connection: approvals + tools cascade away, receipts survive with connection_id NULL,
-- and the audit row is durable. A SECOND hard delete finds no row → uniform MCP_FORBIDDEN (§9 no
-- existence oracle).
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.disconnect_mcp_connection(uuid, boolean, uuid);
--   -- P2 (Codex): disconnect_mcp_connection's SOFT-DISABLE branch now ALSO scrubs the url-embedded
--   --   credential (server_url_ct = CASE WHEN auth_kind='url' THEN NULL ELSE server_url_ct END). A rollback
--   --   to the prior body drops that url scrub; nothing else in the function changes.
--   DROP FUNCTION IF EXISTS public.set_mcp_rest_connection_endpoint(uuid, text, text, uuid);
--   DROP FUNCTION IF EXISTS public.create_mcp_rest_connection(text, text, text, text, text, uuid);
--   DROP FUNCTION IF EXISTS public.create_mcp_connection(text, text, text, text, text, text, text, text, text, text, text[], timestamptz, text, uuid);
--   -- restore public._mcp_caller_capabilities(uuid,uuid) to its 20270330000000 body (drop the
--   --   `mcp.connections.delete` append), and set_mcp_connection_endpoint(...) to its 20270330000000
--   --   body (re-inline the bundle block, drop the P1(a) `enabled = true` from the UPDATE), then:
--   DROP FUNCTION IF EXISTS public._mcp_assert_credential_bundle(text, text, text, text, text, text, text, text[], timestamptz);
--   -- and restore mcp_connection_receipts.connection_id to NOT NULL + ON DELETE CASCADE.
--   -- P2: restore public.get_mcp_connections_v2(uuid) to its 20270319000000 `configured` expression
--   --   (auth_token_ct IS NOT NULL OR refresh_token_ct IS NOT NULL) — dropping the url/none widening.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────────
-- 0. HISTORY-PRESERVING FK on mcp_connection_receipts (G1a-1 Correction 2). Receipts are an
--    operational HISTORY of what ran; a hard delete of a connection must not erase them. Make
--    connection_id NULLABLE and swap its FK from ON DELETE CASCADE (20270319000000:183) to ON DELETE
--    SET NULL, so a deleted connection's receipts survive unlinked (tenant_id retained). Done BEFORE
--    the writers so disconnect_mcp_connection can rely on it.
-- ─────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.mcp_connection_receipts ALTER COLUMN connection_id DROP NOT NULL;
ALTER TABLE public.mcp_connection_receipts
  DROP CONSTRAINT IF EXISTS mcp_connection_receipts_connection_id_fkey;
ALTER TABLE public.mcp_connection_receipts
  ADD CONSTRAINT mcp_connection_receipts_connection_id_fkey
  FOREIGN KEY (connection_id) REFERENCES public.mcp_connections(connection_id) ON DELETE SET NULL;

COMMENT ON COLUMN public.mcp_connection_receipts.connection_id IS
  'G1a-1: nullable + ON DELETE SET NULL (was NOT NULL + CASCADE, 20270319000000). A receipt is HISTORY and survives a hard delete of its connection, unlinked (connection_id→NULL, tenant_id retained). Contrast the LIVE child tables (approvals, tools) which stay ON DELETE CASCADE.';

-- ─────────────────────────────────────────────────────────────────────────────────
-- 1. THE ONE HOME for per-kind credential-bundle validation (G1a-1 Correction 1). Extracted
--    VERBATIM from set_mcp_connection_endpoint (20270330000000:626-692) — the header / bearer / oauth
--    / url / none per-kind rules, closed codes MCP_BAD_CREDENTIAL_BUNDLE / MCP_OAUTH_TOKEN_EXPIRED
--    (never echoing a value), btrim(COALESCE(...)) presence. It ASSUMES the caller already validated
--    that _auth_kind is a known schema kind AND already rejected api_key inline (the api_key gate is
--    an auth_kind decision, not a bundle-shape one, so it stays inline in every caller — the ELSE
--    branch here only ever sees url/none). Two rules per kind: (a) the fields the runtime REQUIRES;
--    (b) NO STRAY fields from another scheme. The oauth already-expired check mirrors the loader's
--    oauthExpired (_shared/mcp-gateway/connection.ts:118) EXACTLY, using clock_timestamp() (the live
--    wall clock, the faithful mirror of Date.now() — NOT now()/transaction_timestamp() which is frozen
--    at txn start). No table access, no RLS bypass — a plain function the DEFINER callers invoke as
--    owner. It is VOLATILE because it reads the LIVE WALL CLOCK via clock_timestamp() to judge
--    oauth-token expiry (mirroring the loader oauthExpired, _shared/mcp-gateway/connection.ts:118);
--    VOLATILE is the correct label and has no downside, since every caller only PERFORMs it for its
--    RAISE side-effect.
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._mcp_assert_credential_bundle(
  _auth_kind               text,
  _auth_token              text,
  _auth_header_name        text,
  _refresh_token           text,
  _oauth_issuer            text,
  _oauth_client_id         text,
  _oauth_client_secret     text,
  _oauth_scopes            text[],
  _access_token_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
  IF _auth_kind = 'header' THEN
    -- runtime: authFromSecret needs auth_token + auth_header_name; authUsable needs a presentable name
    -- (F1). Reject a missing token, a missing name, or a name the transport cannot present.
    IF btrim(COALESCE(_auth_token, '')) = ''
       OR btrim(COALESCE(_auth_header_name, '')) = ''
       OR NOT public._mcp_header_name_usable(_auth_header_name) THEN
      RAISE EXCEPTION 'MCP_BAD_CREDENTIAL_BUNDLE' USING ERRCODE = '22023';
    END IF;
    -- F2: header's scheme is {token, header_name}; refresh/oauth-* belong to another scheme.
    IF btrim(COALESCE(_refresh_token, '')) <> '' OR btrim(COALESCE(_oauth_issuer, '')) <> ''
       OR btrim(COALESCE(_oauth_client_id, '')) <> '' OR btrim(COALESCE(_oauth_client_secret, '')) <> ''
       OR _oauth_scopes IS NOT NULL OR _access_token_expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'MCP_BAD_CREDENTIAL_BUNDLE' USING ERRCODE = '22023';
    END IF;
  ELSIF _auth_kind = 'bearer' THEN
    -- runtime: authFromSecret needs auth_token (maps to bearer). Its scheme is {token} only.
    -- (api_key was already rejected inline by the caller, so it never reaches here.)
    IF btrim(COALESCE(_auth_token, '')) = '' THEN
      RAISE EXCEPTION 'MCP_BAD_CREDENTIAL_BUNDLE' USING ERRCODE = '22023';
    END IF;
    -- F2: a header name, a refresh token, or any oauth-* field is not this scheme's.
    IF btrim(COALESCE(_auth_header_name, '')) <> '' OR btrim(COALESCE(_refresh_token, '')) <> ''
       OR btrim(COALESCE(_oauth_issuer, '')) <> '' OR btrim(COALESCE(_oauth_client_id, '')) <> ''
       OR btrim(COALESCE(_oauth_client_secret, '')) <> '' OR _oauth_scopes IS NOT NULL
       OR _access_token_expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'MCP_BAD_CREDENTIAL_BUNDLE' USING ERRCODE = '22023';
    END IF;
  ELSIF _auth_kind = 'oauth' THEN
    -- F3: the runtime's authFromSecret has NO refresh step — a refresh-only bundle loads unusable.
    -- REQUIRE _auth_token + issuer + client_id; refresh/secret/scopes/expiry are optional-additional.
    IF btrim(COALESCE(_auth_token, '')) = '' OR btrim(COALESCE(_oauth_issuer, '')) = ''
       OR btrim(COALESCE(_oauth_client_id, '')) = '' THEN
      RAISE EXCEPTION 'MCP_BAD_CREDENTIAL_BUNDLE' USING ERRCODE = '22023';
    END IF;
    -- F2: a custom header name belongs to the 'header' scheme, not oauth.
    IF btrim(COALESCE(_auth_header_name, '')) <> '' THEN
      RAISE EXCEPTION 'MCP_BAD_CREDENTIAL_BUNDLE' USING ERRCODE = '22023';
    END IF;
    -- round-4 / round-5 F2: reject an already-EXPIRED access token, mirroring the loader's oauthExpired
    -- (connection.ts:118) EXACTLY — clock_timestamp() (live wall clock) is the faithful mirror of
    -- Date.now(); exact <=, no skew/grace; a NULL/absent expiry is live.
    IF _access_token_expires_at IS NOT NULL AND _access_token_expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'MCP_OAUTH_TOKEN_EXPIRED' USING ERRCODE = '22023';   -- closed code; never echoes a value
    END IF;
  ELSE
    -- url / none: no credential material at all may accompany a credential-less kind (F2).
    IF btrim(COALESCE(_auth_token, '')) <> ''
       OR btrim(COALESCE(_auth_header_name, '')) <> ''
       OR btrim(COALESCE(_refresh_token, '')) <> ''
       OR btrim(COALESCE(_oauth_issuer, '')) <> ''
       OR btrim(COALESCE(_oauth_client_id, '')) <> ''
       OR btrim(COALESCE(_oauth_client_secret, '')) <> ''
       OR _oauth_scopes IS NOT NULL
       OR _access_token_expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'MCP_BAD_CREDENTIAL_BUNDLE' USING ERRCODE = '22023';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._mcp_assert_credential_bundle(text, text, text, text, text, text, text, text[], timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._mcp_assert_credential_bundle(text, text, text, text, text, text, text, text[], timestamptz) TO authenticated, service_role;

COMMENT ON FUNCTION public._mcp_assert_credential_bundle(text, text, text, text, text, text, text, text[], timestamptz) IS
  'G1a-1 (MCP PR-G1a): the ONE home for per-kind MCP credential-bundle validation, extracted verbatim from set_mcp_connection_endpoint (20270330000000:626-692). RAISEs MCP_BAD_CREDENTIAL_BUNDLE / MCP_OAUTH_TOKEN_EXPIRED (closed codes, never echoing a value). Assumes the caller already validated auth_kind is a known schema kind AND rejected api_key inline (the ELSE branch is url/none). header→token + a runtime-usable header_name (_mcp_header_name_usable), reject stray; bearer→token, reject stray; oauth→token+issuer+client_id (F3: token REQUIRED), reject a stray header, reject an already-expired access token (access_token_expires_at<=clock_timestamp(), mirroring the loader oauthExpired connection.ts:118); url/none→no credential material. VOLATILE (reads clock_timestamp() to judge oauth-token expiry against the live wall clock). set_mcp_connection_endpoint and create_mcp_connection are its callers, so the bundle logic lives in exactly one place.';

-- ─────────────────────────────────────────────────────────────────────────────────
-- 2. set_mcp_connection_endpoint — CREATE OR REPLACE with a body IDENTICAL to 20270330000000 EXCEPT
--    the inline per-kind bundle block (:626-692) is replaced by ONE PERFORM of the extracted helper
--    (G1a-1 Correction 1). Order is unchanged: schema-kind check → api_key→NOT_EXECUTABLE (inline) →
--    endpoint-safe → bundle-helper. Everything else (authority, D1, INVARIANT UPDATE, provider_state/
--    status/health reset, approval revoke + tool clear, in-txn audit, write-only return) is byte-for-
--    byte the 20270330000000 body EXCEPT the ONE P1(a) line `enabled = true` added to the atomic UPDATE's
--    SET list — a successful re-key RECONNECTS (a no-op for an already-enabled row, a reconnect for a
--    disabled / soft-disconnected one; same manage authority, no escalation). The existing setter pgTAP +
--    the loader-parity smoke prove the rest of the swap is behavior-preserving. Grants re-emitted
--    identical (authenticated only); the COMMENT is RE-ISSUED here (was inherited from 20270330000000) to
--    record the reconnect semantics.
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_mcp_connection_endpoint(
  _connection_id           uuid,
  _server_url              text,
  _auth_kind               text,
  _auth_token              text        DEFAULT NULL,
  _auth_header_name        text        DEFAULT NULL,
  _refresh_token           text        DEFAULT NULL,
  _oauth_issuer            text        DEFAULT NULL,
  _oauth_client_id         text        DEFAULT NULL,
  _oauth_client_secret     text        DEFAULT NULL,
  _oauth_scopes            text[]      DEFAULT NULL,
  _access_token_expires_at timestamptz DEFAULT NULL,
  _tenant_id               uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _conn               public.mcp_connections%ROWTYPE;
  _tenant             uuid;
  _old_hash           text;
  _new_hash           text;
  _new_last4          text;
  _old_last4          text;      -- round-6 cont.: redacted before-hint (>=12-char last4 only), from _old_token
  _old_token          text;      -- decrypted in-definer to derive _credential_changed AND _old_last4; PLAINTEXT never logged
  _old_refresh        text;      -- ditto
  _old_client_secret  text;      -- ditto
  _endpoint_changed   boolean;
  _credential_changed boolean;
  _approvals_revoked  integer := 0;
  _tools_cleared      integer := 0;
BEGIN
  IF _connection_id IS NULL THEN
    RAISE EXCEPTION 'MCP_NO_CONNECTION' USING ERRCODE = '22023';
  END IF;

  -- Authority FIRST (§9): resolve the caller's tenant server-side, then require the manage capability
  -- for it — BEFORE any connection is read, so an unauthorized/cross-tenant caller cannot learn a
  -- connection's existence or legacy status by a distinct error code. A NULL actor (service-role)
  -- holds {} ⇒ refused (no service-role bypass); a platform owner who is not a tenant admin holds no
  -- `manage` ⇒ refused (A2 — _mcp_resolve_tenant scopes but is not the authority).
  _tenant := public._mcp_resolve_tenant(_tenant_id, false);
  IF NOT ('mcp.connections.manage' = ANY(public._mcp_caller_capabilities(_tenant, auth.uid()))) THEN
    RAISE EXCEPTION 'MCP_FORBIDDEN: mcp.connections.manage capability required' USING ERRCODE = '42501';
  END IF;

  -- Serialize on the connection. A missing connection AND a connection in another tenant are the SAME
  -- uniform refusal (§9 — no existence oracle across tenants). IS DISTINCT FROM is NULL-safe.
  SELECT * INTO _conn FROM public.mcp_connections WHERE connection_id = _connection_id FOR UPDATE;
  IF _conn.connection_id IS NULL OR _conn.tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'MCP_FORBIDDEN: connection not in tenant' USING ERRCODE = '42501';
  END IF;

  -- D1: a legacy-projected row is owned by the legacy live path; never write its endpoint here (§57).
  -- Reached only by an authorized admin of the connection's own tenant, so the distinct code is not a
  -- cross-tenant oracle.
  IF _conn.legacy_source IS NOT NULL THEN
    RAISE EXCEPTION 'MCP_LEGACY_CONNECTION_READONLY: managed by the legacy connection path' USING ERRCODE = '42501';
  END IF;

  -- Shape validation. A recognized schema kind first (a garbage value is MCP_BAD_AUTH_KIND)...
  IF _auth_kind IS NULL OR _auth_kind NOT IN ('oauth','bearer','header','api_key','url','none') THEN
    RAISE EXCEPTION 'MCP_BAD_AUTH_KIND' USING ERRCODE = '22023';
  END IF;
  -- ...then reject a recognized-but-NOT-MCP-EXECUTABLE kind (round-4). The setter's accepted set must
  -- EQUAL makeRpcConnectionLoader's MCP_EXECUTABLE_AUTH_KINDS = {oauth,bearer,header,url,none}
  -- (_shared/mcp-gateway/connection.ts:58); `api_key` is the n8n REST facet, which the loader returns
  -- as connection_unusable (connection.ts:102) — accepting it would strand the connection. The
  -- scripts/mcp-gateway-smoke.mjs parity assertion FAILS CI if this accept-set and that constant diverge.
  IF _auth_kind = 'api_key' THEN
    RAISE EXCEPTION 'MCP_AUTH_KIND_NOT_EXECUTABLE' USING ERRCODE = '22023';   -- closed code; never echoes a value
  END IF;
  IF NOT public._mcp_endpoint_write_safe(_server_url) THEN
    RAISE EXCEPTION 'MCP_BAD_ENDPOINT' USING ERRCODE = '22023';   -- closed code; never echoes the URL
  END IF;

  -- Credential-bundle validation — the ONE home (G1a-1 Correction 1). Formerly the inline IF/ELSIF
  -- block at 20270330000000:626-692; now the extracted public._mcp_assert_credential_bundle, called
  -- BEFORE any destructive write so a bundle the runtime loader could never accept never clears state
  -- or lands a half-written credential. Identical closed codes; identical order (after the api_key
  -- gate above). PRINCIPLE unchanged: a bundle this setter ACCEPTS is one makeRpcConnectionLoader
  -- (_shared/mcp-gateway/connection.ts) loads as USABLE.
  PERFORM public._mcp_assert_credential_bundle(
            _auth_kind, _auth_token, _auth_header_name, _refresh_token,
            _oauth_issuer, _oauth_client_id, _oauth_client_secret, _oauth_scopes, _access_token_expires_at);

  -- Hashes (derived) for the audit + return. Old may be NULL for a never-configured native row.
  _old_hash  := CASE WHEN _conn.server_url_ct IS NULL THEN NULL
                     ELSE public._mcp_endpoint_hash(public.platform_decrypt(_conn.server_url_ct)) END;
  _new_hash  := public._mcp_endpoint_hash(_server_url);
  -- round-6 (secret-exposure fix): right(token,4) returns the WHOLE token when it is <= 4 chars, and a
  -- 5-char token still leaks 4 of 5. A trailing-4 hint is only genuinely non-secret when the token is long
  -- enough that those 4 chars are a negligible suffix; below 12 chars there is no such hint, so emit NULL.
  -- This ONE value feeds the row column, the audit after-hint, and the return (there is no second last4
  -- code path), so redacting it here redacts it everywhere. (INT-111 tracks the repo-wide last4 convention
  -- at OTHER call sites — out of this PR's scope.)
  _new_last4 := CASE WHEN _auth_token IS NULL OR length(_auth_token) < 12 THEN NULL ELSE right(_auth_token, 4) END;

  -- Change-detection for the audit (round-3, F4). credential_changed is derived from EVERY
  -- credential-bearing field, not just the access token — a same-URL rotation of a header name, refresh
  -- token, client secret, issuer, client id, scopes, or expiry is a real credential change and must
  -- read true. The three encrypted fields are decrypted in-definer ONLY to compare; the plaintext is
  -- NEVER logged or returned. All comparisons are IS DISTINCT FROM (NULL-safe). _endpoint_changed
  -- compares the derived hashes. Both are recorded as booleans, never values.
  _old_token          := CASE WHEN _conn.auth_token_ct IS NULL THEN NULL
                              ELSE public.platform_decrypt(_conn.auth_token_ct) END;
  _old_refresh        := CASE WHEN _conn.refresh_token_ct IS NULL THEN NULL
                              ELSE public.platform_decrypt(_conn.refresh_token_ct) END;
  _old_client_secret  := CASE WHEN _conn.oauth_client_secret_ct IS NULL THEN NULL
                              ELSE public.platform_decrypt(_conn.oauth_client_secret_ct) END;
  -- round-6 continuation (before-hint redaction): the AUDIT before-hint is DERIVED here from the
  -- decrypted _old_token under the SAME length floor as _new_last4 — it is NEVER copied from the
  -- stored _conn.auth_token_last4, which a prior writer may have populated with the WHOLE short token
  -- under the historical right(token,4) convention (copying that would re-persist the credential into
  -- the durable audit). An unavailable old token (never-configured row, NULL ciphertext) => NULL, never
  -- a stored pass-through. The plaintext _old_token itself is still never logged.
  _old_last4          := CASE WHEN _old_token IS NULL OR length(_old_token) < 12 THEN NULL ELSE right(_old_token, 4) END;
  _endpoint_changed   := _old_hash IS DISTINCT FROM _new_hash;
  _credential_changed :=
       _conn.auth_kind               IS DISTINCT FROM _auth_kind
    OR _conn.auth_header_name        IS DISTINCT FROM _auth_header_name
    OR _old_token                    IS DISTINCT FROM _auth_token
    OR _old_refresh                  IS DISTINCT FROM _refresh_token
    OR _conn.oauth_issuer            IS DISTINCT FROM _oauth_issuer
    OR _conn.oauth_client_id         IS DISTINCT FROM _oauth_client_id
    OR _old_client_secret            IS DISTINCT FROM _oauth_client_secret
    OR _conn.oauth_scopes            IS DISTINCT FROM _oauth_scopes
    OR _conn.access_token_expires_at IS DISTINCT FROM _access_token_expires_at;

  -- Unconditional approval revocation (round-2 item 1), done EXPLICITLY here — BEFORE the UPDATE — so
  -- it also covers a same-URL CREDENTIAL rotation (new token, same endpoint), which the shipped
  -- AFTER-UPDATE trigger (20270322000000) does NOT catch because it only fires on a decrypted-URL
  -- change. Doing it before the UPDATE means the trigger then finds nothing to delete (a harmless
  -- no-op on a real re-point) and the reported count is exact. A call that failed the authority /
  -- shape / endpoint / credential checks above never reaches this line, so a rejected rebind deletes
  -- NOTHING. The old grant is void on every rebind: an approval is consent for a specific
  -- (endpoint, credential) pair, and either changing invalidates it.
  DELETE FROM public.mcp_connection_approvals WHERE connection_id = _connection_id;
  GET DIAGNOSTICS _approvals_revoked = ROW_COUNT;

  -- The old endpoint's discovered tools are stale; a re-probe rediscovers the new endpoint's set.
  DELETE FROM public.mcp_connection_tools WHERE connection_id = _connection_id;
  GET DIAGNOSTICS _tools_cleared = ROW_COUNT;

  -- THE INVARIANT: one atomic UPDATE; every credential-bearing column is set from the arguments (new
  -- value or NULL), NONE carried forward. A changed endpoint therefore cannot inherit the old secret.
  -- provider_state is reset and (above) the approvals + discovered-tool catalog are cleared: no
  -- operational state from the old endpoint carries onto the new one. status/health reset because the
  -- new endpoint is unverified until a probe.
  UPDATE public.mcp_connections SET
    server_url_ct           = public.platform_encrypt(_server_url),
    auth_kind               = _auth_kind,
    auth_header_name        = _auth_header_name,
    auth_token_ct           = CASE WHEN _auth_token IS NULL THEN NULL ELSE public.platform_encrypt(_auth_token) END,
    auth_token_last4        = _new_last4,
    refresh_token_ct        = CASE WHEN _refresh_token IS NULL THEN NULL ELSE public.platform_encrypt(_refresh_token) END,
    oauth_issuer            = _oauth_issuer,
    oauth_client_id         = _oauth_client_id,
    oauth_client_secret_ct  = CASE WHEN _oauth_client_secret IS NULL THEN NULL ELSE public.platform_encrypt(_oauth_client_secret) END,
    oauth_scopes            = _oauth_scopes,
    granted_scopes          = '{}',                       -- the old grant ceiling is void on re-bind
    provider_state          = '{}'::jsonb,                -- old-endpoint operational state does not carry over
    access_token_expires_at = _access_token_expires_at,
    enabled                 = true,                       -- P1(a): a successful re-key RECONNECTS. Re-keying an
                                                          -- already-enabled row is a no-op for enabled; re-keying a
                                                          -- disabled (soft-disconnected) row reconnects it. Same
                                                          -- authority (manage) — no escalation.
    status                  = 'pending_verification',
    health                  = 'unknown',
    last_error_code         = NULL,
    last_checked_at         = NULL,               -- the old endpoint's observation time must not carry over
    updated_by              = auth.uid(),
    updated_at              = now()
  WHERE connection_id = _connection_id;

  -- A1: durable audit in the SAME transaction — HASHES/ENUMS/COUNTS ONLY. A failure here aborts the txn,
  -- so the UPDATE + deletes above do not commit. actor_user_id = auth.uid() (a real tenant-admin: the
  -- capability gate refused a NULL actor), which also satisfies paige_audit_log's INSERT RLS as
  -- belt-and-suspenders. credential_changed is a BOOLEAN derived from an in-definer decrypt — the token
  -- plaintext is never logged; only last4 (round-6: a non-secret trailing-4 hint, present ONLY for a
  -- token >= 12 chars and NULL below that — never the whole short token) and the flags appear. BOTH
  -- last4 hints are redacted this way: _new_last4 from the new token, _old_last4 from the DECRYPTED old
  -- token (round-6 cont.) — never the stored _conn.auth_token_last4, which a legacy short-token row could
  -- carry whole.
  INSERT INTO public.paige_audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  VALUES (
    auth.uid(), _conn.tenant_id, 'mcp_connection.endpoint_changed', 'mcp_connections', _connection_id,
    jsonb_build_object(
      'old_endpoint_hash',        _old_hash,
      'new_endpoint_hash',        _new_hash,
      'endpoint_changed',         _endpoint_changed,
      'credential_changed',       _credential_changed,
      'auth_kind_before',         _conn.auth_kind,
      'auth_kind_after',          _auth_kind,
      'auth_token_last4_before',  _old_last4,
      'auth_token_last4_after',   _new_last4,
      'approvals_revoked',        _approvals_revoked,
      'tools_cleared',            _tools_cleared
    )
  );

  -- A3: write-only return — no secret material, no decrypted URL.
  RETURN jsonb_build_object(
    'connection_id',    _connection_id,
    'status',           'pending_verification',
    'endpoint_hash',    _new_hash,
    'auth_token_last4', _new_last4
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_mcp_connection_endpoint(uuid, text, text, text, text, text, text, text, text, text[], timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_mcp_connection_endpoint(uuid, text, text, text, text, text, text, text, text, text[], timestamptz, uuid) TO authenticated;

-- COMMENT re-issued (was inherited verbatim from 20270330000000) to record the P1(a) reconnect semantics.
COMMENT ON FUNCTION public.set_mcp_connection_endpoint(uuid, text, text, text, text, text, text, text, text, text[], timestamptz, uuid) IS
  'INT-099 (MCP PR-2) / G1a-1: the endpoint setter for the Connected MCP Gateway. Resolves authority BEFORE reading the connection (§9): the mcp.connections.manage capability for the caller''s server-resolved tenant via _mcp_caller_capabilities (owner/tenant-admin only; platform owner EXCLUDED, A2), fail closed, no service-role bypass; a missing or foreign-tenant connection is a uniform MCP_FORBIDDEN. REFUSES a legacy-projected row (D1). PRINCIPLE (round 3, round-4 corrected oracle): a bundle it accepts is one the runtime LOADER makeRpcConnectionLoader (_shared/mcp-gateway/connection.ts) loads as usable — never a destructive rebind that strands a working connection. Validates the CREDENTIAL BUNDLE against auth_kind BEFORE any write via the ONE helper _mcp_assert_credential_bundle (G1a-1 Correction 1): accepted kinds EQUAL the loader''s MCP_EXECUTABLE_AUTH_KINDS (connection.ts:58) — api_key → MCP_AUTH_KIND_NOT_EXECUTABLE (round-4); header→token + a runtime-usable header_name via _mcp_header_name_usable [F1], reject stray; bearer→token, reject stray; oauth→token+issuer+client_id [F3: token REQUIRED; refresh/secret/scopes optional-additional] + reject an already-expired access token (access_token_expires_at<=clock_timestamp() → MCP_OAUTH_TOKEN_EXPIRED, mirroring the loader''s oauthExpired connection.ts:118), reject stray header; url/none→no credential material [F2]; closed codes MCP_BAD_CREDENTIAL_BUNDLE / MCP_AUTH_KIND_NOT_EXECUTABLE / MCP_OAUTH_TOKEN_EXPIRED, never echoes a value. A bracketed endpoint host must be valid IPv6 (round-4: a bracketed IPv4 is refused, matching WHATWG new URL()). Writes the endpoint + FULL credential bundle in one atomic UPDATE, sourcing every credential column from the arguments (never carrying the old ciphertext forward) so a changed endpoint can never inherit the old secret; resets provider_state, and — EXPLICITLY, before the UPDATE — deletes the stale tool catalog AND revokes every endpoint-bound approval (unconditionally, so a same-URL credential rotation also drops consent; the 20270322000000 trigger then no-ops). P1(a): a successful re-key RESTORES enabled=true (re-key = reconnect) — re-keying an already-enabled row is a no-op for enabled, re-keying a disabled (soft-disconnected) row reconnects it, same manage authority, no escalation. Records a hashes/enums/counts-only audit into paige_audit_log in the same transaction (old/new endpoint_hash, endpoint_changed, credential_changed [F4: boolean derived in-definer from ALL credential-bearing fields — plaintext never logged], auth_kind + auth_token_last4 before/after, approvals_revoked, tools_cleared) (A1). Returns only connection_id/status/endpoint_hash/auth_token_last4 (A3). Static https + value-based IP + DNS-syntax SSRF URL validation only — runtime egress SSRF stays in mcp-client.ts (A4). EXECUTE to authenticated only (A5).';

-- ─────────────────────────────────────────────────────────────────────────────────
-- 3. Extend the ONE capability mapping with `mcp.connections.delete` (A2/D2/INT-089). Copied VERBATIM
--    from 20270330000000:496-527 and APPENDING a THIRD capability. `use_restricted` (FIRST) and
--    `manage` (SECOND) are UNCHANGED. `delete` (THIRD, appended) is the DESTRUCTIVE capability — owner
--    / tenant-admin of THIS tenant ONLY, a platform owner EXCLUDED (same as manage). Append order is
--    fixed use_restricted→manage→delete (the pgTAP exact-equality assertions depend on it). A delegated
--    grant is added HERE alone. service_role-only grants unchanged.
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._mcp_caller_capabilities(
  _tenant_id      uuid,
  _actor_user_id  uuid
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _caps text[] := ARRAY[]::text[];
BEGIN
  -- No actor ⇒ no capability. INT-089: NO silent service-role bypass (a NULL / headless actor holds
  -- nothing; system use is an EXPLICIT authority carrying a reason at the runner, never this mapping).
  IF _actor_user_id IS NULL THEN
    RETURN _caps;
  END IF;
  -- use_restricted (USE an owner_only connection) — owner / admin of THIS tenant, or a platform owner.
  -- UNCHANGED from INT-082. Appended FIRST.
  IF public.is_tenant_admin_as(_actor_user_id, _tenant_id)
     OR public.is_platform_owner(_actor_user_id) THEN
    _caps := array_append(_caps, 'mcp.connections.use_restricted');
  END IF;
  -- manage (CREATE / CONFIGURE / ROTATE a connection — NOT delete, which is the third key below) —
  -- owner / tenant-admin of THIS tenant ONLY. A platform owner is EXCLUDED (A2): platform authority is
  -- not tenant-management authority. A delegated grant is added HERE alone (INT-089). Appended SECOND.
  IF public.is_tenant_admin_as(_actor_user_id, _tenant_id) THEN
    _caps := array_append(_caps, 'mcp.connections.manage');
  END IF;
  -- delete (HARD-DELETE a connection — the destructive action, G1a-1) — owner / tenant-admin of THIS
  -- tenant ONLY. A platform owner is EXCLUDED (A2), same as manage: platform authority is not
  -- tenant-management authority, and a destructive tenant action is not a platform-operator power. A
  -- delegated grant is added HERE alone. Appended THIRD (fixed order use_restricted→manage→delete).
  IF public.is_tenant_admin_as(_actor_user_id, _tenant_id) THEN
    _caps := array_append(_caps, 'mcp.connections.delete');
  END IF;
  RETURN _caps;
END;
$$;

COMMENT ON FUNCTION public._mcp_caller_capabilities(uuid, uuid) IS
  'INT-082/INT-089/INT-099/G1a-1: the single server-side mapping from a SERVER-RESOLVED caller (tenant + actor user id) to the MCP capabilities they hold. mcp.connections.use_restricted (USE an owner_only connection) = owner + tenant-admin + platform owner. mcp.connections.manage (CREATE/CONFIGURE/ROTATE a connection; NOT delete) = owner + tenant-admin of THIS tenant ONLY — platform owner EXCLUDED. mcp.connections.delete (HARD-DELETE a connection — the destructive action, G1a-1) = owner + tenant-admin of THIS tenant ONLY — platform owner EXCLUDED (a destructive tenant action is not a platform-operator power). Fixed append order use_restricted→manage→delete (exact-equality tests depend on it). A future delegated grant is added HERE alone; consumers check for the capability, never a role. service_role-only; explicit _actor_user_id, never auth.uid() or a request body.';

REVOKE ALL ON FUNCTION public._mcp_caller_capabilities(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._mcp_caller_capabilities(uuid, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────────
-- 4. create_mcp_connection — the NATIVE CREATE for generic / Zapier-OAuth / n8n-OAuth facets
--    (auth_kind ∈ {oauth,bearer,header,url,none}). Authority FIRST (§9); provider descriptor must
--    exist; visibility valid; SAME shape order as the setter (schema-kind → api_key NOT_EXECUTABLE
--    inline → endpoint-safe → the ONE bundle helper); transport FORCED to 'http' (no transport param —
--    the client speaks only http today); status='pending_verification' / health='unknown' (the new
--    endpoint is unverified until a probe); granted_scopes/provider_state empty; legacy_source NULL
--    (a NATIVE row). A colliding (tenant, provider, label) → MCP_DUPLICATE_LABEL. Hashes/enums/last4-
--    only audit in the SAME txn; write-only return.
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_mcp_connection(
  _provider_key            text,
  _label                   text,
  _server_url              text,
  _auth_kind               text,
  _auth_token              text        DEFAULT NULL,
  _auth_header_name        text        DEFAULT NULL,
  _refresh_token           text        DEFAULT NULL,
  _oauth_issuer            text        DEFAULT NULL,
  _oauth_client_id         text        DEFAULT NULL,
  _oauth_client_secret     text        DEFAULT NULL,
  _oauth_scopes            text[]      DEFAULT NULL,
  _access_token_expires_at timestamptz DEFAULT NULL,
  _visibility              text        DEFAULT 'tenant',
  _tenant_id               uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tenant    uuid;
  _new_id    uuid;
  _new_hash  text;
  _new_last4 text;
BEGIN
  -- Authority FIRST (§9): resolve caller tenant server-side, then require the manage capability. A
  -- NULL actor (service-role) holds {} ⇒ refused (no bypass); a platform owner who is not a tenant
  -- admin holds no manage ⇒ refused (A2 — _mcp_resolve_tenant scopes but is not the authority).
  _tenant := public._mcp_resolve_tenant(_tenant_id, false);
  IF NOT ('mcp.connections.manage' = ANY(public._mcp_caller_capabilities(_tenant, auth.uid()))) THEN
    RAISE EXCEPTION 'MCP_FORBIDDEN: mcp.connections.manage capability required' USING ERRCODE = '42501';
  END IF;

  -- label present (NOT NULL column — a closed code, not a raw not-null violation).
  IF btrim(COALESCE(_label, '')) = '' THEN
    RAISE EXCEPTION 'MCP_BAD_LABEL' USING ERRCODE = '22023';
  END IF;
  -- provider descriptor must exist (a closed code, not a raw FK violation).
  IF NOT EXISTS (SELECT 1 FROM public.mcp_providers WHERE provider_key = _provider_key) THEN
    RAISE EXCEPTION 'MCP_BAD_PROVIDER' USING ERRCODE = '22023';
  END IF;
  IF _visibility IS NULL OR _visibility NOT IN ('tenant','owner_only') THEN
    RAISE EXCEPTION 'MCP_BAD_VISIBILITY' USING ERRCODE = '22023';
  END IF;

  -- SAME shape order as set_mcp_connection_endpoint: schema-kind → api_key→NOT_EXECUTABLE (inline) →
  -- endpoint-safe → the ONE bundle helper (G1a-1 Correction 1).
  IF _auth_kind IS NULL OR _auth_kind NOT IN ('oauth','bearer','header','api_key','url','none') THEN
    RAISE EXCEPTION 'MCP_BAD_AUTH_KIND' USING ERRCODE = '22023';
  END IF;
  IF _auth_kind = 'api_key' THEN
    RAISE EXCEPTION 'MCP_AUTH_KIND_NOT_EXECUTABLE' USING ERRCODE = '22023';   -- REST facet; use create_mcp_rest_connection
  END IF;
  IF NOT public._mcp_endpoint_write_safe(_server_url) THEN
    RAISE EXCEPTION 'MCP_BAD_ENDPOINT' USING ERRCODE = '22023';   -- closed code; never echoes the URL
  END IF;
  PERFORM public._mcp_assert_credential_bundle(
            _auth_kind, _auth_token, _auth_header_name, _refresh_token,
            _oauth_issuer, _oauth_client_id, _oauth_client_secret, _oauth_scopes, _access_token_expires_at);

  _new_hash  := public._mcp_endpoint_hash(_server_url);
  -- last4: a non-secret trailing-4 hint ONLY for a token >= 12 chars (mirrors the setter :704).
  _new_last4 := CASE WHEN _auth_token IS NULL OR length(_auth_token) < 12 THEN NULL ELSE right(_auth_token, 4) END;

  BEGIN
    INSERT INTO public.mcp_connections (
      tenant_id, provider_key, label, server_url_ct, transport, auth_kind, auth_header_name,
      auth_token_ct, auth_token_last4, refresh_token_ct, oauth_issuer, oauth_client_id,
      oauth_client_secret_ct, oauth_scopes, access_token_expires_at, granted_scopes, provider_state,
      visibility, status, health, enabled, legacy_source, legacy_provider, created_by, updated_by
    ) VALUES (
      _tenant, _provider_key, _label, public.platform_encrypt(_server_url), 'http', _auth_kind, _auth_header_name,
      CASE WHEN _auth_token IS NULL THEN NULL ELSE public.platform_encrypt(_auth_token) END,
      _new_last4,
      CASE WHEN _refresh_token IS NULL THEN NULL ELSE public.platform_encrypt(_refresh_token) END,
      _oauth_issuer, _oauth_client_id,
      CASE WHEN _oauth_client_secret IS NULL THEN NULL ELSE public.platform_encrypt(_oauth_client_secret) END,
      _oauth_scopes, _access_token_expires_at, '{}', '{}'::jsonb,
      _visibility, 'pending_verification', 'unknown', true, NULL, NULL, auth.uid(), auth.uid()
    )
    RETURNING connection_id INTO _new_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'MCP_DUPLICATE_LABEL' USING ERRCODE = '22023';
  END;

  -- A1: durable audit in the SAME transaction — hashes/enums/name/last4 ONLY, never a URL/token/ciphertext.
  INSERT INTO public.paige_audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  VALUES (
    auth.uid(), _tenant, 'mcp_connection.created', 'mcp_connections', _new_id,
    jsonb_build_object(
      'provider_key',      _provider_key,
      'label',             _label,
      'auth_kind',         _auth_kind,
      'transport',         'http',
      'visibility',        _visibility,
      'new_endpoint_hash', _new_hash,
      'auth_token_last4',  _new_last4
    )
  );

  -- A3: write-only return — no secret material, no decrypted URL.
  RETURN jsonb_build_object(
    'connection_id',    _new_id,
    'status',           'pending_verification',
    'endpoint_hash',    _new_hash,
    'auth_token_last4', _new_last4
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_mcp_connection(text, text, text, text, text, text, text, text, text, text, text[], timestamptz, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_mcp_connection(text, text, text, text, text, text, text, text, text, text, text[], timestamptz, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.create_mcp_connection(text, text, text, text, text, text, text, text, text, text, text[], timestamptz, text, uuid) IS
  'G1a-1 (MCP PR-G1a): NATIVE create for MCP-executable facets (generic remote MCP + Zapier/n8n OAuth). auth_kind ∈ {oauth,bearer,header,url,none}; api_key → MCP_AUTH_KIND_NOT_EXECUTABLE (use create_mcp_rest_connection). Authority FIRST (§9): mcp.connections.manage for the caller''s server-resolved tenant via _mcp_caller_capabilities (owner/tenant-admin only; platform owner EXCLUDED), fail closed, no service-role bypass. Provider descriptor must exist (MCP_BAD_PROVIDER); visibility ∈ {tenant,owner_only} (MCP_BAD_VISIBILITY); label present (MCP_BAD_LABEL); endpoint via _mcp_endpoint_write_safe (MCP_BAD_ENDPOINT, static https/IP/DNS SSRF — runtime egress is G2); bundle via the ONE helper _mcp_assert_credential_bundle. transport FORCED http; status pending_verification / health unknown; granted_scopes/provider_state empty; legacy_source NULL. Colliding (tenant,provider,label) → MCP_DUPLICATE_LABEL. Encrypts every credential to *_ct (platform_encrypt); auth_token_last4 a non-secret >=12-char hint. Hashes/enums/name/last4-only audit into paige_audit_log in the same txn; write-only return {connection_id,status,endpoint_hash,auth_token_last4}. EXECUTE to authenticated only.';

-- ─────────────────────────────────────────────────────────────────────────────────
-- 5. create_mcp_rest_connection — the NATIVE CREATE for the n8n REST api-key facet (auth_kind
--    'api_key'). This facet is deliberately NON-MCP-EXECUTABLE (the loader returns it as
--    connection_unusable, connection.ts:100-104) — it is a REST API, not an MCP JSON-RPC server — so
--    it is a DISJOINT write lane from create_mcp_connection. Same authority + provider + visibility +
--    endpoint (SAME _mcp_endpoint_write_safe SSRF guard on the base_url) + duplicate-label handling.
--    SIGNATURE NOTE (§13 deviation): the brief lists _provider_key with a default BEFORE _label /
--    _base_url / _api_key without defaults, which Postgres forbids (a non-defaulted parameter cannot
--    follow a defaulted one). The parameter ORDER + types + the _provider_key='n8n' default are kept
--    EXACTLY as specified; _label / _base_url / _api_key are given DEFAULT NULL to compile and their
--    presence is enforced in the body (MCP_BAD_LABEL / MCP_BAD_ENDPOINT / MCP_BAD_CREDENTIAL_BUNDLE).
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_mcp_rest_connection(
  _provider_key text DEFAULT 'n8n',
  _label        text DEFAULT NULL,
  _base_url     text DEFAULT NULL,
  _api_key      text DEFAULT NULL,
  _visibility   text DEFAULT 'tenant',
  _tenant_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tenant    uuid;
  _new_id    uuid;
  _new_hash  text;
  _new_last4 text;
BEGIN
  _tenant := public._mcp_resolve_tenant(_tenant_id, false);
  IF NOT ('mcp.connections.manage' = ANY(public._mcp_caller_capabilities(_tenant, auth.uid()))) THEN
    RAISE EXCEPTION 'MCP_FORBIDDEN: mcp.connections.manage capability required' USING ERRCODE = '42501';
  END IF;

  IF btrim(COALESCE(_label, '')) = '' THEN
    RAISE EXCEPTION 'MCP_BAD_LABEL' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mcp_providers WHERE provider_key = _provider_key) THEN
    RAISE EXCEPTION 'MCP_BAD_PROVIDER' USING ERRCODE = '22023';
  END IF;
  IF _visibility IS NULL OR _visibility NOT IN ('tenant','owner_only') THEN
    RAISE EXCEPTION 'MCP_BAD_VISIBILITY' USING ERRCODE = '22023';
  END IF;
  -- SAME static SSRF guard as the MCP setter, on the REST base_url.
  IF NOT public._mcp_endpoint_write_safe(_base_url) THEN
    RAISE EXCEPTION 'MCP_BAD_ENDPOINT' USING ERRCODE = '22023';   -- closed code; never echoes the URL
  END IF;
  -- api_key is the only credential the REST facet carries (btrim ⇒ whitespace-only counts as absent).
  IF btrim(COALESCE(_api_key, '')) = '' THEN
    RAISE EXCEPTION 'MCP_BAD_CREDENTIAL_BUNDLE' USING ERRCODE = '22023';
  END IF;

  _new_hash  := public._mcp_endpoint_hash(_base_url);
  _new_last4 := CASE WHEN length(_api_key) < 12 THEN NULL ELSE right(_api_key, 4) END;

  BEGIN
    INSERT INTO public.mcp_connections (
      tenant_id, provider_key, label, server_url_ct, transport, auth_kind, auth_header_name,
      auth_token_ct, auth_token_last4, refresh_token_ct, oauth_issuer, oauth_client_id,
      oauth_client_secret_ct, oauth_scopes, access_token_expires_at, granted_scopes, provider_state,
      visibility, status, health, enabled, legacy_source, legacy_provider, created_by, updated_by
    ) VALUES (
      _tenant, _provider_key, _label, public.platform_encrypt(_base_url), 'http', 'api_key', NULL,
      public.platform_encrypt(_api_key), _new_last4, NULL, NULL, NULL,
      NULL, NULL, NULL, '{}', '{}'::jsonb,
      _visibility, 'pending_verification', 'unknown', true, NULL, NULL, auth.uid(), auth.uid()
    )
    RETURNING connection_id INTO _new_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'MCP_DUPLICATE_LABEL' USING ERRCODE = '22023';
  END;

  INSERT INTO public.paige_audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  VALUES (
    auth.uid(), _tenant, 'mcp_connection.created', 'mcp_connections', _new_id,
    jsonb_build_object(
      'provider_key',      _provider_key,
      'label',             _label,
      'auth_kind',         'api_key',
      'transport',         'http',
      'visibility',        _visibility,
      'new_endpoint_hash', _new_hash,
      'auth_token_last4',  _new_last4
    )
  );

  RETURN jsonb_build_object(
    'connection_id',    _new_id,
    'status',           'pending_verification',
    'endpoint_hash',    _new_hash,
    'auth_token_last4', _new_last4
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_mcp_rest_connection(text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_mcp_rest_connection(text, text, text, text, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.create_mcp_rest_connection(text, text, text, text, text, uuid) IS
  'G1a-1 (MCP PR-G1a): NATIVE create for the n8n REST api-key facet (auth_kind=api_key). This facet is deliberately NON-MCP-executable (connection.ts:100-104) — a REST API, not an MCP JSON-RPC server — a disjoint write lane from create_mcp_connection. Authority FIRST (§9): mcp.connections.manage (owner/tenant-admin; platform owner EXCLUDED). Provider must exist; visibility ∈ {tenant,owner_only}; label present; base_url via the SAME _mcp_endpoint_write_safe SSRF guard as the MCP setter; api_key required. transport http; auth_header_name NULL; oauth/refresh NULL; status pending_verification; legacy_source NULL. Colliding (tenant,provider,label) → MCP_DUPLICATE_LABEL. api_key encrypted to auth_token_ct; last4 a non-secret >=12-char hint. Hashes/enums/name/last4-only audit; write-only return. (Signature: _provider_key defaults n8n; _label/_base_url/_api_key are DEFAULT NULL to satisfy Postgres''s defaults-must-trail rule and enforced non-empty in-body.) EXECUTE to authenticated only.';

-- ─────────────────────────────────────────────────────────────────────────────────
-- 6. set_mcp_rest_connection_endpoint — RE-KEY the n8n REST api-key facet (rotate base_url + api_key).
--    Authority + D1 + uniform-forbidden mirror the setter. This is the REST lane ONLY: a connection of
--    any other auth_kind → MCP_NOT_A_REST_CONNECTION (a shape error, so an MCP-executable connection is
--    never silently converted to a non-MCP REST facet). A re-key voids prior consent + the discovered-
--    tool catalog (an approval binds to a specific endpoint+credential), reset in the SAME txn with an
--    exact-count audit; credential_changed derived from an in-definer decrypt-compare of the old key.
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_mcp_rest_connection_endpoint(
  _connection_id uuid,
  _base_url      text,
  _api_key       text,
  _tenant_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _conn               public.mcp_connections%ROWTYPE;
  _tenant             uuid;
  _old_hash           text;
  _new_hash           text;
  _new_last4          text;
  _old_key            text;      -- decrypted in-definer ONLY to derive credential_changed; never logged
  _credential_changed boolean;
  _approvals_revoked  integer := 0;
  _tools_cleared      integer := 0;
BEGIN
  IF _connection_id IS NULL THEN
    RAISE EXCEPTION 'MCP_NO_CONNECTION' USING ERRCODE = '22023';
  END IF;

  _tenant := public._mcp_resolve_tenant(_tenant_id, false);
  IF NOT ('mcp.connections.manage' = ANY(public._mcp_caller_capabilities(_tenant, auth.uid()))) THEN
    RAISE EXCEPTION 'MCP_FORBIDDEN: mcp.connections.manage capability required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _conn FROM public.mcp_connections WHERE connection_id = _connection_id FOR UPDATE;
  IF _conn.connection_id IS NULL OR _conn.tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'MCP_FORBIDDEN: connection not in tenant' USING ERRCODE = '42501';
  END IF;
  IF _conn.legacy_source IS NOT NULL THEN
    RAISE EXCEPTION 'MCP_LEGACY_CONNECTION_READONLY: managed by the legacy connection path' USING ERRCODE = '42501';
  END IF;
  -- REST lane ONLY: refuse a connection of any other auth_kind (a shape error, closed code) so an
  -- MCP-executable connection cannot be silently converted into a non-MCP REST facet.
  IF _conn.auth_kind <> 'api_key' THEN
    RAISE EXCEPTION 'MCP_NOT_A_REST_CONNECTION' USING ERRCODE = '22023';
  END IF;

  IF NOT public._mcp_endpoint_write_safe(_base_url) THEN
    RAISE EXCEPTION 'MCP_BAD_ENDPOINT' USING ERRCODE = '22023';   -- closed code; never echoes the URL
  END IF;
  IF btrim(COALESCE(_api_key, '')) = '' THEN
    RAISE EXCEPTION 'MCP_BAD_CREDENTIAL_BUNDLE' USING ERRCODE = '22023';
  END IF;

  _old_hash  := CASE WHEN _conn.server_url_ct IS NULL THEN NULL
                     ELSE public._mcp_endpoint_hash(public.platform_decrypt(_conn.server_url_ct)) END;
  _new_hash  := public._mcp_endpoint_hash(_base_url);
  _new_last4 := CASE WHEN length(_api_key) < 12 THEN NULL ELSE right(_api_key, 4) END;
  _old_key   := CASE WHEN _conn.auth_token_ct IS NULL THEN NULL ELSE public.platform_decrypt(_conn.auth_token_ct) END;
  _credential_changed := _old_key IS DISTINCT FROM _api_key;

  -- Re-key voids consent + the tool catalog. Delete BEFORE the UPDATE (exact counts; audit-fail aborts).
  DELETE FROM public.mcp_connection_approvals WHERE connection_id = _connection_id;
  GET DIAGNOSTICS _approvals_revoked = ROW_COUNT;
  DELETE FROM public.mcp_connection_tools WHERE connection_id = _connection_id;
  GET DIAGNOSTICS _tools_cleared = ROW_COUNT;

  UPDATE public.mcp_connections SET
    server_url_ct    = public.platform_encrypt(_base_url),
    auth_kind        = 'api_key',                 -- unchanged; asserted above, kept explicit
    transport        = 'http',
    auth_token_ct    = public.platform_encrypt(_api_key),
    auth_token_last4 = _new_last4,
    enabled          = true,                      -- P1(a): a successful re-key RECONNECTS (no-op if already
                                                  -- enabled; reconnects a disabled row). Same manage authority.
    provider_state   = '{}'::jsonb,
    status           = 'pending_verification',
    health           = 'unknown',
    last_error_code  = NULL,
    last_checked_at  = NULL,
    updated_by       = auth.uid(),
    updated_at       = now()
  WHERE connection_id = _connection_id;

  INSERT INTO public.paige_audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  VALUES (
    auth.uid(), _conn.tenant_id, 'mcp_connection.endpoint_changed', 'mcp_connections', _connection_id,
    jsonb_build_object(
      'old_endpoint_hash',        _old_hash,
      'new_endpoint_hash',        _new_hash,
      'endpoint_changed',         _old_hash IS DISTINCT FROM _new_hash,
      'credential_changed',       _credential_changed,
      'auth_kind_before',         _conn.auth_kind,
      'auth_kind_after',          'api_key',
      'auth_token_last4_after',   _new_last4,
      'approvals_revoked',        _approvals_revoked,
      'tools_cleared',            _tools_cleared
    )
  );

  RETURN jsonb_build_object(
    'connection_id',    _connection_id,
    'status',           'pending_verification',
    'endpoint_hash',    _new_hash,
    'auth_token_last4', _new_last4
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_mcp_rest_connection_endpoint(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_mcp_rest_connection_endpoint(uuid, text, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.set_mcp_rest_connection_endpoint(uuid, text, text, uuid) IS
  'G1a-1 (MCP PR-G1a): RE-KEY the n8n REST api-key facet (rotate base_url + api_key). Authority FIRST (§9): mcp.connections.manage; uniform MCP_FORBIDDEN on a missing/foreign-tenant connection; D1 refuses a legacy-projected row. REST lane ONLY — a connection whose auth_kind <> api_key → MCP_NOT_A_REST_CONNECTION (shape error) so an MCP-executable connection is never silently converted. base_url via the SAME _mcp_endpoint_write_safe SSRF guard; api_key required. Voids consent + the discovered-tool catalog; resets provider_state/status/health; credential_changed from an in-definer decrypt-compare of the old key. P1(a): a successful re-key RESTORES enabled=true (re-key = reconnect) — a no-op for an already-enabled row, a reconnect for a disabled (soft-disconnected) one, same manage authority. Hashes/enums/last4/counts-only audit; write-only return. EXECUTE to authenticated only.';

-- ─────────────────────────────────────────────────────────────────────────────────
-- 7. disconnect_mcp_connection — SOFT disable (default) or HARD delete. Authority FIRST (§9): a hard
--    delete requires mcp.connections.delete; a soft disable requires mcp.connections.manage (both
--    owner/tenant-admin only, platform owner EXCLUDED). Uniform MCP_FORBIDDEN on missing/foreign-tenant;
--    D1 refuses a legacy row.
--      • DISABLE (_hard=false): idempotent (already-disabled ⇒ no-op, no new audit). Otherwise null the
--        live credential ciphertexts (access token, refresh token, oauth client secret) + last4, AND —
--        for auth_kind='url' ONLY — the url-embedded credential in server_url_ct (P2, Codex): a url
--        connection carries its secret INSIDE the endpoint, so a disconnect that left server_url_ct intact
--        would keep a live credential on the disabled shell that get_mcp_connections_v2 (url/none widening)
--        still reports configured:true. Every OTHER auth_kind (bearer/header/oauth/none) retains its
--        encrypted endpoint + oauth identity metadata on the disabled shell (the endpoint alone is not a
--        credential there; get_mcp_connection_secret returns configured:false/enabled:false for a disabled
--        row, so nothing is exposed). Then empty granted_scopes/provider_state, status→unconfigured,
--        health→unknown, enabled→false; delete approvals + tools (LIVE state); audit 'mcp_connection.disabled'.
--      • DELETE (_hard=true, HISTORY-PRESERVING — G1a-1 Correction 2): count the LIVE child rows,
--        WRITE THE 'mcp_connection.deleted' AUDIT FIRST (so an audit failure aborts before the
--        destructive delete), THEN DELETE the connection — approvals + tools cascade away, receipts
--        survive with connection_id NULL (§0 FK swap), the audit row is durable. A SECOND hard delete
--        finds no row ⇒ uniform MCP_FORBIDDEN (§9 no existence oracle).
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.disconnect_mcp_connection(
  _connection_id uuid,
  _hard          boolean DEFAULT false,
  _tenant_id     uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _conn              public.mcp_connections%ROWTYPE;
  _tenant            uuid;
  _caps              text[];
  _old_hash          text;
  _approvals_revoked integer := 0;
  _tools_cleared     integer := 0;
BEGIN
  IF _connection_id IS NULL THEN
    RAISE EXCEPTION 'MCP_NO_CONNECTION' USING ERRCODE = '22023';
  END IF;

  -- Authority FIRST (§9): resolve the caller's tenant, then require the RIGHT capability for the mode.
  -- A hard delete needs the DESTRUCTIVE `delete` key; a disable needs `manage`. A NULL actor holds {}.
  _tenant := public._mcp_resolve_tenant(_tenant_id, false);
  _caps := public._mcp_caller_capabilities(_tenant, auth.uid());
  IF _hard THEN
    IF NOT ('mcp.connections.delete' = ANY(_caps)) THEN
      RAISE EXCEPTION 'MCP_FORBIDDEN: mcp.connections.delete capability required' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT ('mcp.connections.manage' = ANY(_caps)) THEN
      RAISE EXCEPTION 'MCP_FORBIDDEN: mcp.connections.manage capability required' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Uniform refusal (§9): a missing connection AND a connection in another tenant are the SAME error.
  SELECT * INTO _conn FROM public.mcp_connections WHERE connection_id = _connection_id FOR UPDATE;
  IF _conn.connection_id IS NULL OR _conn.tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'MCP_FORBIDDEN: connection not in tenant' USING ERRCODE = '42501';
  END IF;
  IF _conn.legacy_source IS NOT NULL THEN
    RAISE EXCEPTION 'MCP_LEGACY_CONNECTION_READONLY: managed by the legacy connection path' USING ERRCODE = '42501';
  END IF;

  _old_hash := CASE WHEN _conn.server_url_ct IS NULL THEN NULL
                    ELSE public._mcp_endpoint_hash(public.platform_decrypt(_conn.server_url_ct)) END;

  IF _hard THEN
    -- HARD DELETE (history-preserving). Count LIVE child rows (they cascade away on the delete);
    -- receipts are HISTORY and survive with connection_id→NULL (§0). Audit FIRST so a failing audit
    -- aborts before the destructive delete; then delete the connection row.
    SELECT count(*) INTO _approvals_revoked FROM public.mcp_connection_approvals WHERE connection_id = _connection_id;
    SELECT count(*) INTO _tools_cleared     FROM public.mcp_connection_tools     WHERE connection_id = _connection_id;

    INSERT INTO public.paige_audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
    VALUES (
      auth.uid(), _conn.tenant_id, 'mcp_connection.deleted', 'mcp_connections', _connection_id,
      jsonb_build_object(
        'old_endpoint_hash', _old_hash,
        'provider_key',      _conn.provider_key,
        'auth_kind',         _conn.auth_kind,
        'approvals_revoked', _approvals_revoked,
        'tools_cleared',     _tools_cleared
      )
    );

    DELETE FROM public.mcp_connections WHERE connection_id = _connection_id;

    RETURN jsonb_build_object(
      'connection_id',    _connection_id,
      'deleted',          true,
      'mode',             'delete',
      'approvals_revoked', _approvals_revoked,
      'tools_cleared',     _tools_cleared
    );
  END IF;

  -- SOFT DISABLE. Idempotent: an already-disabled connection is a no-op (no new audit row).
  IF _conn.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'connection_id',   _connection_id,
      'disconnected',    true,
      'mode',            'disable',
      'already_disabled', true
    );
  END IF;

  -- Scrub the LIVE state: delete approvals + tools, null every stored secret, reset scopes/state.
  DELETE FROM public.mcp_connection_approvals WHERE connection_id = _connection_id;
  GET DIAGNOSTICS _approvals_revoked = ROW_COUNT;
  DELETE FROM public.mcp_connection_tools WHERE connection_id = _connection_id;
  GET DIAGNOSTICS _tools_cleared = ROW_COUNT;

  UPDATE public.mcp_connections SET
    enabled                = false,
    auth_token_ct          = NULL,
    refresh_token_ct       = NULL,
    oauth_client_secret_ct = NULL,
    auth_token_last4       = NULL,
    -- P2 (Codex): for auth_kind='url' the credential is EMBEDDED IN the endpoint, so nulling the token
    -- ciphertexts above does NOT scrub the secret — it survives inside server_url_ct. A user-initiated
    -- disconnect must clear that url-embedded credential too, or the disabled shell keeps a live secret
    -- that get_mcp_connections_v2 (with this PR's url/none widening) STILL reports configured:true. Scrub
    -- server_url_ct ONLY for a url row; every other auth_kind (bearer/header/oauth/none) keeps its endpoint
    -- on the disabled shell (the endpoint alone is not a credential there), exactly as before.
    server_url_ct          = CASE WHEN auth_kind = 'url' THEN NULL ELSE server_url_ct END,
    granted_scopes         = '{}',
    provider_state         = '{}'::jsonb,
    status                 = 'unconfigured',
    health                 = 'unknown',
    last_error_code        = NULL,
    last_checked_at        = NULL,
    updated_by             = auth.uid(),
    updated_at             = now()
  WHERE connection_id = _connection_id;

  INSERT INTO public.paige_audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  VALUES (
    auth.uid(), _conn.tenant_id, 'mcp_connection.disabled', 'mcp_connections', _connection_id,
    jsonb_build_object(
      'old_endpoint_hash', _old_hash,
      'mode',              'disable',
      'status_after',      'unconfigured',
      'approvals_revoked', _approvals_revoked,
      'tools_cleared',     _tools_cleared
    )
  );

  RETURN jsonb_build_object(
    'connection_id',    _connection_id,
    'disconnected',     true,
    'mode',             'disable',
    'status',           'unconfigured',
    'approvals_revoked', _approvals_revoked,
    'tools_cleared',     _tools_cleared
  );
END;
$$;

REVOKE ALL ON FUNCTION public.disconnect_mcp_connection(uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disconnect_mcp_connection(uuid, boolean, uuid) TO authenticated;

COMMENT ON FUNCTION public.disconnect_mcp_connection(uuid, boolean, uuid) IS
  'G1a-1 (MCP PR-G1a): SOFT disable (default) or HARD delete of a NATIVE connection. Authority FIRST (§9): hard delete needs mcp.connections.delete, disable needs mcp.connections.manage (both owner/tenant-admin only, platform owner EXCLUDED, no service-role bypass). Uniform MCP_FORBIDDEN on a missing/foreign-tenant connection (a second hard delete finds none ⇒ same refusal, no existence oracle); D1 refuses a legacy row. DISABLE: idempotent (already-disabled ⇒ already_disabled no-op); else null the live credential ciphertexts (access token, refresh token, oauth client secret) + last4, AND — for auth_kind=url ONLY — the url-embedded credential in server_url_ct (P2: a url connection carries its secret inside the endpoint, so leaving server_url_ct intact would keep a live credential on the disabled shell that get_mcp_connections_v2''s url/none widening still reports configured:true). Every other auth_kind (bearer/header/oauth/none) retains its encrypted endpoint + oauth identity metadata on the disabled shell (the endpoint alone is not a credential there; get_mcp_connection_secret returns configured:false/enabled:false for a disabled row, so nothing is exposed). Empty scopes/state, status→unconfigured, enabled→false, delete approvals+tools (LIVE state), audit mcp_connection.disabled. DELETE (history-preserving): audit mcp_connection.deleted FIRST then delete the row — approvals+tools cascade away, mcp_connection_receipts survive with connection_id→NULL (this migration''s FK swap), paige_audit_log survives (no FK). Hashes/enums/counts-only audit; write-only return. EXECUTE to authenticated only.';

-- ─────────────────────────────────────────────────────────────────────────────────
-- 8. get_mcp_connections_v2 — CREATE OR REPLACE reproducing the 20270319000000 definition (:214-256)
--    BYTE-FOR-BYTE EXCEPT the `configured` expression (P2). The list-side `configured` must agree with
--    get_mcp_connection_secret's credential-less exemption (INT-079, 20270326000000/20270328000000): a
--    url- or none-auth connection carries its credential INSIDE the encrypted endpoint, so both token
--    columns are legitimately NULL, yet the connection IS configured once server_url_ct is present. The
--    prior `(auth_token_ct IS NOT NULL OR refresh_token_ct IS NOT NULL)` reported such a row
--    `configured:false`, contradicting the loader (which resolves it usable) and the secret RPC (which
--    returns configured:true). This ADDITIVELY widens `configured:true` to `auth_kind IN ('url','none')
--    AND server_url_ct IS NOT NULL`; behavior for every OTHER auth_kind is unchanged — a bearer/header/
--    oauth row with no token column still reports `configured:false` (fail-closed preserved). RLS /
--    owner_only visibility (`_full`), SECURITY DEFINER, SET search_path, and the REVOKE/GRANT are the
--    20270319000000 originals, re-issued identically. No COMMENT existed on this function; none is added.
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_mcp_connections_v2(
  _tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _tenant uuid; _out jsonb; _full boolean;
BEGIN
  _tenant := public._mcp_resolve_tenant(_tenant_id, false);
  -- owner_only connections are visible only to a tenant admin / platform owner (or a trusted
  -- service-role caller, where auth.uid() is NULL); an ordinary member does not see them.
  _full := auth.uid() IS NULL OR public.is_tenant_admin(_tenant) OR public.is_platform_owner();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'connection_id', c.connection_id,
           'provider_key', c.provider_key,
           'label', c.label,
           'transport', c.transport,
           'auth_kind', c.auth_kind,
           -- P2: a url/none connection carries its credential in the encrypted endpoint (both token
           -- columns legitimately NULL), so it is configured once server_url_ct is present — mirroring
           -- get_mcp_connection_secret's INT-079 exemption. Every other auth_kind is unchanged.
           'configured', (c.auth_token_ct IS NOT NULL OR c.refresh_token_ct IS NOT NULL OR (c.auth_kind IN ('url','none') AND c.server_url_ct IS NOT NULL)),
           'enabled', c.enabled,
           'status', c.status,
           'health', c.health,
           -- observed_at, never presented as "verified now" (truth-boundary; the reader labels freshness).
           'last_checked_at', c.last_checked_at,
           'granted_scopes', c.granted_scopes,
           'visibility', c.visibility,
           -- Host only, never the secret-bearing full URL/path.
           'server_url_host', CASE WHEN c.server_url_ct IS NOT NULL
             THEN split_part(split_part(public.platform_decrypt(c.server_url_ct), '://', 2), '/', 1)
             ELSE NULL END,
           'tool_count', (SELECT count(*) FROM public.mcp_connection_tools t WHERE t.connection_id = c.connection_id),
           'approved_count', (SELECT count(*) FROM public.mcp_connection_approvals a WHERE a.connection_id = c.connection_id)
         ) ORDER BY c.created_at), '[]'::jsonb)
    INTO _out
    FROM public.mcp_connections c
   WHERE c.tenant_id = _tenant
     AND (_full OR c.visibility <> 'owner_only');
  RETURN _out;
END;
$$;

REVOKE ALL ON FUNCTION public.get_mcp_connections_v2(uuid)                                    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mcp_connections_v2(uuid)                                    TO authenticated, service_role;
