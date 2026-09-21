-- ============================================================================
-- Connected MCP Gateway — the endpoint setter (INT-099, MCP PR-2).
--
-- THE PRINCIPLE (coordinator ruling, round 3). "A bundle the setter accepts must be one the runtime
-- loads as usable. The setter never destructively replaces a working connection with an unusable one."
-- The true yardstick (round-4 correction) is makeRpcConnectionLoader (_shared/mcp-gateway/connection.ts),
-- NOT just authFromSecret/authUsable (a subset). Every bundle this setter ACCEPTS loads usable through
-- that LOADER; every loader-unusable credential shape is REJECTED before the destructive reset. Proven
-- both here (pgTAP bundle matrix) and on the TS side (scripts/mcp-gateway-smoke.mjs, which drives the
-- REAL loader via loaderFor(row)), under identical case names, so the two can never silently diverge.
--
-- CLASS-CLOSER v2 (round-4, by enumeration). Every path in makeRpcConnectionLoader (connection.ts) that
-- yields a non-usable result, and how this setter relates to it — (a) the setter REJECTS it (+ the test),
-- or (b) NOT the setter's concern (+ why):
--   L1  RPC read error → no_connection ............... (b) a runtime read failure; the setter writes the
--          row, it does not control whether a later service-role read errors.
--   L2  configured!=true → no_connection (conn.ts:86)  (b) row-state projection: `configured` means an
--          endpoint is set; the setter ALWAYS writes a validated endpoint, so it only ever yields
--          configured=true — it cannot produce this state.
--   L3  enabled!=true → connection_disabled (:87) ..... (b) runtime state the setter does NOT write (its
--          UPDATE never touches `enabled`).
--   L4  auth===null → connection_unusable (:91) ....... (a) a token-requiring kind with no token — REJECTED
--          (MCP_BAD_CREDENTIAL_BUNDLE): tests reject_bearer_no_token / reject_oauth_no_token / header-no-token.
--   L5  server_url empty/non-string → unusable (:92) .. (a) REJECTED: _mcp_endpoint_write_safe requires a
--          non-empty https URL (MCP_BAD_ENDPOINT) — A4 matrix.
--   L6  connection_id non-string → unusable (:93) ..... (b) structural: connection_id is the PK, always present.
--   L7  tenant_id non-string → unusable (:94) ......... (b) structural: tenant_id is NOT NULL on every row.
--   L8  endpoint_hash not 64-hex → unusable (:98) ..... (b) RPC-DERIVED: get_mcp_connection_secret computes
--          it as sha256 of the loaded endpoint — always 64-hex for any row with an endpoint, which the
--          setter guarantees by writing a validated endpoint.
--   L9  transport not in {http} → unusable (:101/:52) . (b) the setter does NOT write `transport` (owned by
--          the CREATE path); its UPDATE never sets it, so it cannot produce or fix this.
--   L10 auth_kind not in MCP_EXECUTABLE_AUTH_KINDS → unusable (:102; const :58 = {oauth,bearer,header,url,
--          none}) ....................................... (a) REJECTED: api_key (the only recognized non-
--          executable kind) → MCP_AUTH_KIND_NOT_EXECUTABLE — test reject_api_key. Round-5 F4 accept-set
--          divergence guard is a TWO-HALVES proof: the pgTAP enumerates every CHECK-set kind through the
--          REAL setter and asserts the accepted set == the documented executable set; the smoke asserts
--          the loader's MCP_EXECUTABLE_AUTH_KINDS (:58) == that SAME documented set. Neither alone proves
--          setter==loader; the pair does.
--   L11 !authUsable(auth) — reserved/invalid header name → unusable (:128) (a) REJECTED via
--          _mcp_header_name_usable — tests reject_header_reserved / reject_header_bad_grammar.
--   L12 oauthExpired → unusable (:118/:128) ............ (a) REJECTED: oauth access_token_expires_at<=now()
--          → MCP_OAUTH_TOKEN_EXPIRED, mirroring conn.ts:118 exactly — test reject_oauth_expired.
--   L13 header row → bearer auth (no header_name) → unusable (:127/:128) (a) REJECTED: header requires a
--          header_name — test header-no-name.
--   L14 visibility owner_only (normalized) (:138) ...... (b) explicitly an AUTHORITY facet, NOT a usability
--          gate; the runner enforces owner_only per caller — never the setter.
--   D1  new URL(server_url) throws at DISPATCH (e.g. bracketed IPv4 [8.8.8.8]) — not a loader branch but a
--          runtime WHATWG-URL rejection (a) REJECTED: _mcp_endpoint_write_safe is https-only + DNS-syntax +
--          bracketed⇒family(_ip)=6 — tests reject bracketed-IPv4 / accept valid IPv6.
--   D2  endpoint-bound consent/approval facet ......... (b) not a load result; the setter revokes approvals
--          on every rebind (round-2 item 1), it is not a load-usability gate.
--
-- THE INVARIANT (one, this PR). A connection's endpoint and its credential are written in ONE
-- atomic UPDATE whose credential-bearing columns are ALWAYS sourced from the call arguments (a new
-- value, or NULL) and NEVER carried forward from the prior row. So a changed endpoint can never
-- inherit the old endpoint's secret: to keep a secret on a new endpoint the caller must re-supply it
-- (a deliberate re-attestation). `endpoint_hash` is DERIVED (public._mcp_endpoint_hash of the
-- DECRYPTED endpoint), so it recomputes automatically. Every successful rebind UNCONDITIONALLY
-- revokes the endpoint-bound consent, done EXPLICITLY in this function (a DELETE on
-- mcp_connection_approvals) BEFORE the UPDATE — NOT relying on the shipped AFTER-UPDATE trigger
-- `trg_mcp_gw_revoke_approvals_on_endpoint_change` (20270322000000) alone, because that trigger fires
-- ONLY on a decrypted-URL change and would miss a SAME-URL credential rotation (an approval is
-- consent for a specific endpoint AND credential; either changing voids it). Doing the DELETE first
-- makes the trigger a harmless no-op on a real re-point and makes the reported `approvals_revoked`
-- count exact. (A→B→A cannot resurrect A's approvals: A→B already deleted them.) The re-point ALSO
-- resets provider_state, the last-checked observation time, and deletes the stale discovered-tool
-- catalog: nothing operational from the old endpoint carries onto the new one, which is unverified
-- until a re-probe. The CREDENTIAL BUNDLE is validated against auth_kind BEFORE any of these
-- destructive writes (see A6), so a bundle that could never authenticate never clears state.
--
-- WHAT THIS PR IS NOT. It does NOT wire the gateway (still library-only, zero deployed importer), does
-- NOT probe/verify the endpoint (no outbound call — see below), does NOT register a paige_action_kind
-- or an autonomy lane (deferred to the wiring lane, INT-083), and does NOT create the native-connection
-- CREATE path — that is a separate, coordinator-numbered future PR. Until that PR lands there are NO
-- native (legacy_source IS NULL) rows, so this setter has no operable row on prod: it is
-- deployment-live but functionally inert, exactly like the rest of the PR-1B series. The RPC IS
-- directly JWT-invokable, which is why its authority gate + URL validation + tenant scope must be
-- correct on merge, not deferred to activation.
--
-- ORDER (§9, INT-099 peer-gate). Authority is resolved BEFORE the connection is read: an unauthorized
-- or cross-tenant caller gets a UNIFORM MCP_FORBIDDEN and can never learn (by a distinct error code)
-- whether a connection_id exists or is legacy-projected. Only an authorized manage-capable admin of
-- the connection's own tenant reaches the existence / D1-legacy distinctions — matching
-- set_mcp_connection_approval's resolve-tenant-first shape.
--
-- D1 — REFUSES a legacy-projected row (legacy_source IS NOT NULL). tenant_mcp_connections /
--      tenant_n8n_connections remain the sole LIVE write path (20270319000000 header); writing an
--      endpoint onto a projection would diverge it from its source of truth (§57). No cutover here.
--
-- A2 — Authority is the CAPABILITY `mcp.connections.manage`, resolved SERVER-SIDE for the caller's
--      resolved tenant via the single re-pointable mapping public._mcp_caller_capabilities (INT-089:
--      capability keys, never role literals; a delegated grant is added THERE alone). `manage` is held
--      by the OWNER / TENANT-ADMIN of THIS tenant ONLY — a platform owner is EXCLUDED from `manage`
--      (they keep `use_restricted` only). NOTE: public._mcp_resolve_tenant(_tenant, false) does NOT by
--      itself refuse a platform owner — it lets a platform owner target ANY _tenant_id and requires
--      only membership-or-platform-owner — so it SCOPES the tenant but is NOT the authority; the
--      capability gate is what refuses a platform owner who is not a tenant admin. Fail closed: a NULL
--      actor (service-role) holds `{}` and is refused (no silent service-role bypass, INT-089/A5).
--
-- A1 — Every successful change is durably recorded in the SAME transaction into the existing
--      public.paige_audit_log (the established config-change audit home — direct in-transaction INSERT,
--      as delete_conversation / grant_tenant_member_role do; there is no writer RPC). HASHES / ENUMS /
--      BOOLEANS / COUNTS ONLY — NEVER the URL, a token, or ciphertext. Payload keys: old + new
--      endpoint_hash; endpoint_changed and credential_changed (booleans — credential_changed is derived
--      from an in-definer decrypt of the OLD token compared to the new argument; the plaintext is never
--      logged); auth_kind before + after; auth_token_last4 before + after (round-6: a last4 hint is
--      emitted ONLY for a token of length >= 12, where the trailing 4 chars are a negligible non-secret
--      suffix; a token < 12 chars has NO non-secret hint and is recorded as NULL — right(token,4) on a
--      short token returns the whole (or nearly the whole) credential, so last4 is redacted everywhere it
--      is written [the row column, the audit before/after, and the return]); approvals_revoked and
--      tools_cleared (row counts from the pre-UPDATE deletes).
--      If the audit INSERT fails, the whole function transaction aborts and the UPDATE + deletes do
--      NOT commit (plain in-transaction INSERT; no autonomous-transaction anywhere in the audit path).
--      The row sets actor_user_id = auth.uid(), which satisfies the current INSERT policy
--      "Actors record their own actions" WITH CHECK (actor_user_id = auth.uid()) (20261027000000, which
--      dropped the older is_staff requirement) — and the SECURITY DEFINER owner bypasses RLS regardless.
--      (Honesty §13: paige_audit_log is not trigger-immutable and service_role retains UPDATE/DELETE —
--      A1 requires a durable RECORD, not DB-enforced immutability; none of the candidate homes provides
--      the latter today, and it would be a separate trigger on the existing table if ever required.)
--
-- A3 — Write-only. The RPC returns NO secret material and NO decrypted URL — only connection_id,
--      status, the new endpoint_hash, and auth_token_last4.
--
-- A4 — URL validation is STATIC (pure SQL, no network call): https only; rejects userinfo, localhost,
--      *.local / *.internal / *.localhost, trailing-dot hosts, a malformed or out-of-range port
--      (1–65535 only — never silently dropped), and every IP LITERAL that is not a public address. IP
--      literals are parsed to `inet` and range-checked NUMERICALLY (notation-agnostic — every spelling
--      of loopback/mapped/ULA/link-local IPv6 and every private/reserved IPv4 is caught, not just
--      canonical strings), and encoded / shorthand IPv4 (decimal, hex, octal, 2-/3-part dotted) is
--      refused outright. ROUND-5 (F3): the value classifier _mcp_inet_is_public is now at FULL PARITY
--      with ssrfGuard.ts's ipUnsafe (_shared/ssrfGuard.ts:116-143) — it adds fec0::/10 site-local, the
--      top-64-zero blanket (mapped/compatible/translated), and EMBEDDED-IPv4 inspection for 6to4
--      (2002::/16) and NAT64 (64:ff9b::/32) so a public embedded v4 is public and a private one blocked,
--      exactly as ssrfGuard. The class is closed by ONE shared, named IP-literal list
--      (supabase/tests/mcp-ip-literal-cases.json) asserted on BOTH sides under identical names: the
--      pgTAP asserts _mcp_inet_is_public; the TS smoke asserts ssrfGuard.ts's assertPublicHttpUrl
--      (read-only import). Neither alone proves parity; the pair does. A non-literal host must also be
--      SYNTACTICALLY valid DNS (labels of [a-z0-9-],
--      1–63 chars, no leading/trailing hyphen, ≥1 dot, total ≤253) — so whitespace, control chars, and
--      percent-encoding in the host (all outside the label charset) are rejected before the destructive
--      reset, matching what a runtime `new URL(...)` would refuse. A BRACKETED host must be a valid IPv6
--      (round-4: `family(_ip)=6`) — a bracketed IPv4 like `[8.8.8.8]` is an invalid URL WHATWG rejects
--      at dispatch, so it is refused here too. HOSTNAME-TO-PRIVATE-IP RESOLUTION IS NOT COVERED AT WRITE
--      TIME (SQL cannot resolve DNS) and remains the job of _shared/mcp-client.ts's SSRF-guarded egress
--      at DISPATCH. This validation is an additional write-time layer, never a replacement for that
--      runtime guard.
--
-- A5 — Grants: EXECUTE to `authenticated` ONLY (revoked from PUBLIC + anon). _mcp_caller_capabilities
--      stays service_role-only and is called from inside this SECURITY DEFINER function.
--
-- A6 — CREDENTIAL-BUNDLE validation (round-3 F1/F2/F3, round-4 tightening — enforcing THE PRINCIPLE
--      above, measured against makeRpcConnectionLoader). Checked BEFORE any destructive write so a bundle
--      the loader could never accept never clears state or lands a half-written credential.
--        • auth_kind (round-4): the accepted set EQUALS the loader's MCP_EXECUTABLE_AUTH_KINDS
--          (connection.ts:58 = {oauth,bearer,header,url,none}). `api_key` is a recognized schema kind the
--          loader marks connection_unusable, so it is REJECTED with MCP_AUTH_KIND_NOT_EXECUTABLE; a
--          garbage kind is MCP_BAD_AUTH_KIND. Round-5 F4: the accept-set divergence guard is proven in
--          TWO HALVES that meet at a documented executable set {oauth,bearer,header,url,none} — the pgTAP
--          drives the REAL setter for every CHECK-set kind (accepted == documented); the smoke asserts
--          the loader constant == documented. Neither alone proves setter==loader; the pair does.
--        • header  → token + a header_name that public._mcp_header_name_usable accepts (F1: the runtime's
--          RFC 9110 token grammar AND reserved-name set, mirrored from mcp-client.ts:77/:63-72); reject
--          refresh / any oauth-* field.
--        • bearer → token; reject header_name / refresh / any oauth-* field. (api_key never reaches the
--          bundle stage — rejected at the auth_kind gate above.)
--        • oauth → token + oauth_issuer + oauth_client_id (F3: token REQUIRED — the runtime has no
--          refresh step, so a refresh-only bundle loads unusable; refresh_token / client_secret /
--          scopes / expiry are optional-additional); reject a header_name; and (round-4, round-5 F2)
--          reject an already-EXPIRED access token — `access_token_expires_at <= clock_timestamp()` →
--          MCP_OAUTH_TOKEN_EXPIRED, mirroring the loader's oauthExpired (connection.ts:118) EXACTLY.
--          F2: clock_timestamp() (live wall clock), NOT now()/transaction_timestamp() (frozen at txn
--          start), is the faithful mirror of the loader's Date.now(); exact <=, no skew/grace; a
--          NULL/absent expiry is live.
--        • url / none → NO credential material at all (F2: any stray token / header_name / refresh /
--          oauth-* field is rejected).
--      Text presence is btrim(COALESCE(...)) so a whitespace-only value counts as absent. Closed codes
--      (all 22023, never echoing a value): MCP_BAD_CREDENTIAL_BUNDLE, MCP_AUTH_KIND_NOT_EXECUTABLE,
--      MCP_OAUTH_TOKEN_EXPIRED. FORWARD-CONSTRAINT (F3): refresh-only OAuth becomes acceptable only when
--      the gateway grows a refresh step that mints a token before first use — a wiring-lane item
--      (INT-083), not this setter.
--
-- A7 — AUDIT credential_changed (round-3, F4) is derived from EVERY credential-bearing field
--      (auth_kind, header name, token, refresh token, oauth issuer / client_id / client_secret, scopes,
--      expiry), comparing DECRYPTED values in-definer — so a same-URL rotation of any of them reads
--      true, and the receipt is faithful. The plaintext is never logged; only the boolean is recorded.
--
-- D2 — `mcp.connections.manage` scope: it authorizes CREATE, CONFIGURE and ROTATE of a connection
--      (this setter is its first consumer — configure/rotate the endpoint + credential). It EXCLUDES
--      DELETE, which gets its own capability key in a later PR.
--
-- D4 — HARD GATE (recorded here and in the decision-log): durable persistence of the runner's EXPLICIT
--      system-authority REASON on the canonical Rail (its own PR, not authorized yet) MUST land BEFORE
--      any system/headless authority path is wired. This setter has NO system path (D5): its authority
--      is the capability held by a real tenant-admin actor (auth.uid()), so no system reason arises here.
--
-- FORWARD-CONSTRAINT (INT-107, round-5 F1 — probe TOCTOU, recorded in the decision-log). The endpoint
--      PROBE/verify step (a future PR, NOT this one and NOT authorized) inspects an endpoint's identity
--      to mark it verified. It MUST carry and verify the endpoint_hash / generation it inspected, and
--      re-confirm that value, BEFORE any wiring acts on the probe result — so a probe of endpoint A can
--      never mark a since-repointed endpoint B verified (the load↔verify TOCTOU, the same class INT-078
--      closed for dispatch). This setter already resets status to pending_verification and clears
--      provider_state/tools on every rebind, so a repoint can never leave a stale "verified" behind; the
--      constraint binds the probe lane, which does not exist yet.
--
-- Carries INT-079's url exemption, INT-078's endpoint_hash and INT-082's visibility UNTOUCHED (this
-- migration does not redefine get_mcp_connection_secret). anon reaches none of the new surface.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.set_mcp_connection_endpoint(uuid, text, text, text, text, text, text, text, text, text[], timestamptz, uuid);
--   DROP FUNCTION IF EXISTS public._mcp_header_name_usable(text);
--   DROP FUNCTION IF EXISTS public._mcp_endpoint_write_safe(text);
--   DROP FUNCTION IF EXISTS public._mcp_inet_is_public(inet);
--   DROP FUNCTION IF EXISTS public._mcp_v4_is_private(inet);   -- round-5 F3 helper (the ONE v4 range set)
--   -- and restore public._mcp_caller_capabilities(uuid, uuid) to its 20270328000000 body (drop the
--   -- `mcp.connections.manage` branch; the mapping is additive, so removing that one append reverts it).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────────
-- 1a-0. The ONE IPv4 private/reserved range set (round-5 F3). Mirrors ssrfGuard.ts's ipv4Private
--     (supabase/functions/_shared/ssrfGuard.ts:42-60) EXACTLY. Single source: it is used for a
--     family-4 input AND for the embedded IPv4 of a 6to4/NAT64 IPv6 address (below), so the v4 range
--     set exists in exactly one place and cannot drift between the direct-v4 and embedded paths.
--     IMMUTABLE, pure. TRUE ⇒ the v4 address is private/reserved (blocked); FALSE ⇒ public.
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._mcp_v4_is_private(_v4 inet)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _v4 <<= '0.0.0.0/8'::inet          -- "this" network / 0.0.0.0        (ssrfGuard.ts:50)
      OR _v4 <<= '10.0.0.0/8'::inet          -- private                         (:50)
      OR _v4 <<= '100.64.0.0/10'::inet       -- CGNAT                           (:52)
      OR _v4 <<= '127.0.0.0/8'::inet         -- loopback                        (:50)
      OR _v4 <<= '169.254.0.0/16'::inet      -- link-local (incl. 169.254.169.254 metadata) (:51)
      OR _v4 <<= '172.16.0.0/12'::inet       -- private                         (:51)
      OR _v4 <<= '192.0.0.0/24'::inet        -- IETF protocol assignments       (:52)
      OR _v4 <<= '192.88.99.0/24'::inet      -- 6to4 relay anycast              (:55)
      OR _v4 <<= '192.168.0.0/16'::inet      -- private                         (:51)
      OR _v4 <<= '198.18.0.0/15'::inet       -- benchmarking                    (:52)
      OR _v4 <<= '224.0.0.0/4'::inet         -- multicast                       (:58)
      OR _v4 <<= '240.0.0.0/4'::inet;        -- reserved (incl. 255.255.255.255 broadcast) (:58-59)
$$;

REVOKE ALL ON FUNCTION public._mcp_v4_is_private(inet) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._mcp_v4_is_private(inet) TO authenticated, service_role;

COMMENT ON FUNCTION public._mcp_v4_is_private(inet) IS
  'INT-099/A4/F3: the ONE IPv4 private/reserved range set — mirror of ssrfGuard.ts ipv4Private (_shared/ssrfGuard.ts:42-60). Used by _mcp_inet_is_public for a family-4 input AND for the embedded IPv4 of a 6to4/NAT64 IPv6 address, so the range set lives in exactly one place. TRUE = private/reserved (blocked), FALSE = public. IMMUTABLE, pure.';

-- ─────────────────────────────────────────────────────────────────────────────────
-- 1a. Numeric address classifier — is this inet a PUBLIC address? Parsed value, not spelling, so
--     every notation of a blocked range is caught (INT-099 peer-gate). IMMUTABLE, pure, no I/O.
--     Round-5 (F3): brought to FULL PARITY with ssrfGuard.ts's ipUnsafe (_shared/ssrfGuard.ts:116-143),
--     the authoritative runtime egress classifier this defends in depth. The IPv6 branch now mirrors it
--     line-for-line: (1) the top-64-zero BLANKET refusal (:129) — one ::/64 containment covers loopback,
--     unspecified, IPv4-mapped, IPv4-compatible AND every IPv4-translated low form, so a PUBLIC v4 in a
--     mapped/compatible spelling is refused on the block rule exactly as ssrfGuard refuses it (a
--     piecewise subset check was a spelling short); (2) fe80::/10 link-local (:132); (3) fec0::/10
--     site-local (:133 — was MISSING before F3); (4) fc00::/7 ULA (:134); (5) ff00::/8 multicast (:135);
--     (6) NAT64 64:ff9b::/32 judged by its EMBEDDED IPv4 (:138), so 64:ff9b:: + a public v4 is public and
--     + a private v4 is blocked (was a whole-block refusal, which wrongly refused public-embedded NAT64);
--     (7) 6to4 2002::/16 judged by its EMBEDDED IPv4 (:140), same semantics. ssrfGuard matches NAT64 on
--     the /32 prefix and inspects ONLY the last 32 bits (ignoring bytes 4-11), so the NAT64 branch masks
--     to the low 32 bits (& ::ffff:ffff) rather than a single CIDR (which cannot express "ignore the
--     middle"); 6to4's embedded bytes sit immediately after the /16 prefix, so its private ranges ARE a
--     mechanical CIDR translation (2002:<v4>::/(16+bits)) that naturally leaves bytes 6-15 free. The
--     SAME v4 range set (_mcp_v4_is_private) backs the family-4 path and the NAT64 embedded check; the
--     6to4 CIDR chain is the same set translated, and the pgTAP shared IP-literal list asserts every
--     range in every form against this classifier AND (on the TS side) against ssrfGuard.ts, so the two
--     cannot drift. Hostname->IP resolution stays runtime-owned (mcp-client.ts); this is IP-literal only.
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._mcp_inet_is_public(_ip inet)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE _n bigint;   -- the embedded IPv4 of a NAT64 address, as an integer (0..4294967295)
BEGIN
  IF _ip IS NULL THEN RETURN false; END IF;

  IF family(_ip) = 4 THEN
    RETURN NOT public._mcp_v4_is_private(_ip);

  ELSIF family(_ip) = 6 THEN
    -- (1) top-64-zero BLANKET (ssrfGuard.ts:129): loopback ::1, unspecified ::, IPv4-mapped
    -- ::ffff:0:0/96, IPv4-compatible ::/96, and every IPv4-translated low form. A public v4 embedded in
    -- a mapped/compatible spelling is refused HERE (ssrfGuard does not embed-inspect these — the whole
    -- low block is refused). Postgres keeps ::ffff:x.x.x.x as family 6, so it reaches this branch.
    IF _ip <<= '::/64'::inet     THEN RETURN false; END IF;
    IF _ip <<= 'fe80::/10'::inet THEN RETURN false; END IF;   -- (2) link-local (ssrfGuard.ts:132)
    IF _ip <<= 'fec0::/10'::inet THEN RETURN false; END IF;   -- (3) site-local (F3; ssrfGuard.ts:133)
    IF _ip <<= 'fc00::/7'::inet  THEN RETURN false; END IF;   -- (4) unique local fc/fd (ssrfGuard.ts:134)
    IF _ip <<= 'ff00::/8'::inet  THEN RETURN false; END IF;   -- (5) multicast (ssrfGuard.ts:135)
    -- (6) NAT64 64:ff9b::/32 (ssrfGuard.ts:138): ssrfGuard matches the /32 prefix and judges by the
    -- EMBEDDED IPv4 (bytes 12-15), IGNORING bytes 4-11 — so mask to the low 32 bits (discarding bytes
    -- 0-11), rebuild that embedded v4, and judge it by the ONE v4 range set. A single CIDR cannot
    -- express "ignore the middle bytes", which is why this uses the mask, not a CIDR chain.
    IF _ip <<= '64:ff9b::/32'::inet THEN
      _n := (_ip & '::ffff:ffff'::inet) - '::'::inet;   -- embedded v4 as an integer
      RETURN NOT public._mcp_v4_is_private(
        ((_n / 16777216 % 256)::text || '.' || (_n / 65536 % 256)::text || '.'
         || (_n / 256 % 256)::text || '.' || (_n % 256)::text)::inet);
    END IF;
    -- (7) 6to4 2002::/16 (ssrfGuard.ts:140): judged by the EMBEDDED IPv4 (bytes 2-5), which sit
    -- immediately after the /16 prefix — so each private range is a mechanical translation to
    -- 2002:<v4>::/(16+bits), whose length naturally fixes prefix+embedded and leaves bytes 6-15 free
    -- (matching ssrfGuard ignoring them). Same set as _mcp_v4_is_private, translated (the pgTAP shared
    -- IP-literal list pins every range in this form to ssrfGuard so it cannot drift from the v4 set).
    IF _ip <<= '2002::/16'::inet THEN
      RETURN NOT (
           _ip <<= '2002:0000::/24'::inet      -- 0.0.0.0/8
        OR _ip <<= '2002:0a00::/24'::inet      -- 10.0.0.0/8
        OR _ip <<= '2002:6440::/26'::inet      -- 100.64.0.0/10
        OR _ip <<= '2002:7f00::/24'::inet      -- 127.0.0.0/8
        OR _ip <<= '2002:a9fe::/32'::inet      -- 169.254.0.0/16
        OR _ip <<= '2002:ac10::/28'::inet      -- 172.16.0.0/12
        OR _ip <<= '2002:c000::/40'::inet      -- 192.0.0.0/24
        OR _ip <<= '2002:c058:6300::/40'::inet -- 192.88.99.0/24
        OR _ip <<= '2002:c0a8::/32'::inet      -- 192.168.0.0/16
        OR _ip <<= '2002:c612::/31'::inet      -- 198.18.0.0/15
        OR _ip <<= '2002:e000::/20'::inet      -- 224.0.0.0/4
        OR _ip <<= '2002:f000::/20'::inet      -- 240.0.0.0/4 (incl. 255.255.255.255)
      );
    END IF;
    RETURN true;  -- a routable public IPv6 (ssrfGuard.ts:142)
  END IF;

  RETURN false;  -- unknown family ⇒ not provably public
END;
$$;

REVOKE ALL ON FUNCTION public._mcp_inet_is_public(inet) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._mcp_inet_is_public(inet) TO authenticated, service_role;

COMMENT ON FUNCTION public._mcp_inet_is_public(inet) IS
  'INT-099/A4: numeric (value, not spelling) classifier — TRUE only for a public IPv4/IPv6 address. Round-5 (F3) brought the IPv6 branch to FULL PARITY with ssrfGuard.ts ipUnsafe (_shared/ssrfGuard.ts:116-143): a top-64-zero BLANKET (loopback/unspecified/IPv4-mapped/-compatible/-translated, :129), fe80::/10 (:132), fec0::/10 site-local (F3, :133), fc00::/7 ULA (:134), ff00::/8 multicast (:135), and NAT64 64:ff9b::/32 (:138) + 6to4 2002::/16 (:140) judged by their EMBEDDED IPv4 (a public embedded v4 is public, a private one blocked). v4 uses the ONE range set _mcp_v4_is_private (also backing the NAT64 embedded check). Every case is asserted, under identical names, against BOTH this classifier (pgTAP) and ssrfGuard.ts (TS smoke) via supabase/tests/mcp-ip-literal-cases.json, so they cannot silently diverge. Defense in depth for the endpoint setter; the authoritative runtime egress guard is _shared/mcp-client.ts. IP-literal only; hostname->IP resolution is runtime-owned.';

-- ─────────────────────────────────────────────────────────────────────────────────
-- 1b. Static, write-time endpoint safety (A4). IMMUTABLE, pure — no auth, no I/O, no DNS. Defense in
--     depth ONLY; the authoritative runtime egress SSRF guard is _shared/mcp-client.ts at dispatch.
--     Returns TRUE only for an https endpoint whose host is not a known-unsafe literal/name. IP
--     literals are parsed to inet and range-checked numerically; encoded/shorthand IPv4 is rejected.
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._mcp_endpoint_write_safe(_url text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _hostport   text;
  _host       text;
  _after      text;
  _port       text;
  _bracketed  boolean := false;
  _ip         inet;
BEGIN
  -- https only (D6).
  IF _url IS NULL OR _url !~ '^https://' THEN RETURN false; END IF;
  -- No userinfo (https://user:pass@host…) — a common SSRF/credential-smuggling shape.
  IF _url ~ '^https://[^/?#]*@' THEN RETURN false; END IF;

  -- host[:port] is everything after the scheme up to the first /, ? or #.
  _hostport := substring(_url from '^https://([^/?#]+)');
  IF _hostport IS NULL OR _hostport = '' THEN RETURN false; END IF;

  IF left(_hostport, 1) = '[' THEN
    -- bracketed IPv6 literal, optionally followed by :<port>.
    _bracketed := true;
    _host := substring(_hostport from '^\[([0-9A-Fa-f:.]+)\]');
    IF _host IS NULL OR _host = '' THEN RETURN false; END IF;
    -- Whatever follows the closing bracket must be empty or a valid :<port> (never a malformed tail).
    _after := substring(_hostport from '\](.*)$');
    IF _after IS DISTINCT FROM '' THEN
      IF _after !~ '^:[0-9]{1,5}$' OR substring(_after from 2)::int NOT BETWEEN 1 AND 65535 THEN
        RETURN false;
      END IF;
    END IF;
  ELSE
    -- A raw (unbracketed) IPv6 in a URL is malformed; more than one colon and not bracketed ⇒ reject.
    IF _hostport ~ ':.*:' THEN RETURN false; END IF;
    -- If a port is present it must be numeric and in range (a malformed port is not silently dropped).
    IF position(':' in _hostport) > 0 THEN
      _port := split_part(_hostport, ':', 2);
      IF _port !~ '^[0-9]{1,5}$' OR _port::int NOT BETWEEN 1 AND 65535 THEN RETURN false; END IF;
    END IF;
    _host := split_part(_hostport, ':', 1);   -- strip :port
  END IF;
  _host := lower(_host);
  IF _host = '' THEN RETURN false; END IF;

  -- Name-based blocks.
  IF _host = 'localhost' THEN RETURN false; END IF;
  IF _host ~ '\.$' THEN RETURN false; END IF;                       -- trailing-dot host
  IF _host ~ '\.(local|internal|localhost)$' THEN RETURN false; END IF;

  -- Bracketed ⇒ an IPv6 literal: parse to inet and classify by VALUE (every spelling of loopback /
  -- mapped / ULA / link-local is caught, not just the canonical strings).
  IF _bracketed THEN
    BEGIN
      _ip := _host::inet;
    EXCEPTION WHEN OTHERS THEN
      RETURN false;   -- unparseable bracketed literal (incl. dotted forms that are not valid IPv6)
    END;
    -- round-4 (F/bracketed-IPv4): brackets are for IPv6 ONLY. The `[0-9A-Fa-f:.]` capture admits dots,
    -- so `[8.8.8.8]` parses as a family-4 inet — but WHATWG `new URL()` rejects a bracketed IPv4 as an
    -- invalid URL, so the runtime could never dispatch it. Require family 6 (a bracketed IPv4 or an
    -- IPv4-mapped `::ffff:x.x.x.x` is then either family 4 → rejected here, or a mapped IPv6 → rejected
    -- by _mcp_inet_is_public's ::ffff:0:0/96 block).
    IF family(_ip) <> 6 THEN RETURN false; END IF;
    RETURN public._mcp_inet_is_public(_ip);
  END IF;

  -- Encoded / shorthand IPv4 shapes — reject rather than try to decode.
  IF _host ~ '0[xX]' THEN RETURN false; END IF;                     -- hex-encoded octet(s)
  IF _host ~ '(^|\.)0[0-9]' THEN RETURN false; END IF;              -- octal (leading-zero) octet
  IF _host ~ '^[0-9]+$' THEN RETURN false; END IF;                  -- bare decimal integer host

  -- A clean dotted-quad IPv4 literal: parse to inet and classify by value.
  IF _host ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' THEN
    BEGIN
      _ip := _host::inet;
    EXCEPTION WHEN OTHERS THEN
      RETURN false;   -- e.g. an octet > 255
    END;
    RETURN public._mcp_inet_is_public(_ip);
  END IF;

  -- Any OTHER all-numeric-and-dots host is a 2-/3-part shorthand or malformed IPv4 (e.g. 127.1,
  -- 10.0.1) that resolvers expand to loopback/private — refuse it outright.
  IF _host ~ '^[0-9.]+$' THEN RETURN false; END IF;

  -- A normal public https hostname must be a syntactically valid DNS name (P2b): labels of
  -- [a-z0-9-], 1–63 chars, no leading/trailing hyphen, at least one dot, total length ≤ 253. This
  -- rejects whitespace, control characters, and percent-encoding in the host (none are in the label
  -- charset), so a host the runtime `new URL(...)` would reject never triggers the destructive reset.
  IF length(_host) > 253 THEN RETURN false; END IF;
  IF _host !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?))+$' THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public._mcp_endpoint_write_safe(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._mcp_endpoint_write_safe(text) TO authenticated, service_role;

COMMENT ON FUNCTION public._mcp_endpoint_write_safe(text) IS
  'INT-099/A4: static write-time SSRF/endpoint validation for the MCP gateway endpoint setter. https only; rejects userinfo, localhost, *.local/*.internal/*.localhost, trailing-dot hosts, encoded/shorthand IPv4 (decimal/hex/octal/2-3-part), and every non-public IP literal (parsed to inet and range-checked by value via _mcp_inet_is_public, so all notations are caught). IMMUTABLE, pure, NO DNS — defense in depth ONLY; the authoritative runtime egress guard is _shared/mcp-client.ts at dispatch (hostname→private-IP resolution is not covered here).';

-- ─────────────────────────────────────────────────────────────────────────────────
-- 1c. A custom `header`-auth name the transport can actually PRESENT (round-3, F1). MIRRORS the runtime
--     gate EXACTLY so an accepted header bundle is one the loader loads as usable — never a destructive
--     rebind that strands a connection the runtime then refuses. Kept byte-for-byte in step with
--     `_shared/mcp-client.ts`:
--       • grammar: mcp-client.ts:77  `HEADER_NAME_RE = /^[A-Za-z0-9!#$%&'*+.^_\`|~-]+$/`  (RFC 9110 token)
--       • reserved set: mcp-client.ts:63-72 `RESERVED_HEADERS` (compared case-insensitively at :82)
--     If either drifts, this and `isUsableHeaderName` disagree and a header the setter accepts is one
--     `authUsable` refuses — exactly the class this PR closes. IMMUTABLE, pure.
-- ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._mcp_header_name_usable(_name text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF _name IS NULL OR _name = '' THEN RETURN false; END IF;
  -- RFC 9110 token grammar (mirror of HEADER_NAME_RE @ mcp-client.ts:77). The bracket carries every
  -- tchar: A-Za-z0-9 and ! # $ % & ' * + - . ^ _ ` | ~  ('' is one escaped quote; the trailing - is a
  -- literal hyphen).
  IF _name !~ '^[A-Za-z0-9!#$%&''*+.^_`|~-]+$' THEN RETURN false; END IF;
  -- Reserved headers this transport sets itself (mirror of RESERVED_HEADERS @ mcp-client.ts:63-72),
  -- compared case-insensitively (mcp-client.ts:82 lowercases before the set lookup).
  IF lower(_name) IN (
       'authorization','content-type','accept','mcp-protocol-version','mcp-session-id',
       'host','content-length','connection','transfer-encoding'
     ) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public._mcp_header_name_usable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._mcp_header_name_usable(text) TO authenticated, service_role;

COMMENT ON FUNCTION public._mcp_header_name_usable(text) IS
  'INT-099/F1: TRUE only for a custom header-auth name the MCP transport can present — a valid RFC 9110 token AND not a reserved header. EXACT mirror of isUsableHeaderName (_shared/mcp-client.ts:81): grammar HEADER_NAME_RE (:77) + case-insensitive RESERVED_HEADERS (:63-72, :82). Cited so drift is traceable. Ensures a header bundle the setter accepts is one the runtime loads as usable (never a destructive rebind that strands the connection). IMMUTABLE, pure.';

-- ─────────────────────────────────────────────────────────────────────────────────
-- 2. Extend the ONE capability mapping with `mcp.connections.manage` (A2/D2/INT-089). Same signature,
--    CREATE OR REPLACE. `use_restricted` is UNCHANGED (owner/admin/platform-owner). `manage` is added
--    for the OWNER / TENANT-ADMIN of THIS tenant ONLY — a platform owner is EXCLUDED. Append order is
--    fixed: use_restricted first, then manage (the pgTAP exact-equality assertions depend on it, D8).
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
  -- manage (CREATE / CONFIGURE / ROTATE a connection — NOT delete, which gets its own key later, D2) —
  -- owner / tenant-admin of THIS tenant ONLY. A platform owner is EXCLUDED (A2): platform authority is
  -- not tenant-management authority. A delegated grant is added HERE alone (INT-089). Appended SECOND.
  IF public.is_tenant_admin_as(_actor_user_id, _tenant_id) THEN
    _caps := array_append(_caps, 'mcp.connections.manage');
  END IF;
  RETURN _caps;
END;
$$;

COMMENT ON FUNCTION public._mcp_caller_capabilities(uuid, uuid) IS
  'INT-082/INT-089/INT-099: the single server-side mapping from a SERVER-RESOLVED caller (tenant + actor user id) to the MCP capabilities they hold. mcp.connections.use_restricted (USE an owner_only connection) = owner + tenant-admin + platform owner (mirrors get_mcp_connections_v2 _full, minus the null-actor bypass). mcp.connections.manage (CREATE/CONFIGURE/ROTATE a connection; NOT delete) = owner + tenant-admin of THIS tenant ONLY — a platform owner is EXCLUDED (platform authority is not tenant-management authority, INT-099/A2). A future delegated grant is added HERE alone; consumers check for the capability, never a role. service_role-only; explicit _actor_user_id, never auth.uid() or a request body.';

REVOKE ALL ON FUNCTION public._mcp_caller_capabilities(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._mcp_caller_capabilities(uuid, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────────
-- 3. The endpoint setter. SECURITY DEFINER; authority resolved BEFORE the connection is read (§9);
--    the endpoint + FULL credential bundle written in one atomic UPDATE (the invariant); provider
--    state + tool catalog reset; the change audited in the SAME transaction (A1); return write-only (A3).
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
  _old_token          text;      -- decrypted in-definer ONLY to derive _credential_changed; NEVER logged
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

  -- Credential-bundle validation (round-3 F1/F2/F3, round-4 tightening). PRINCIPLE: a bundle the setter
  -- ACCEPTS must be one the runtime loads as USABLE — measured against makeRpcConnectionLoader
  -- (_shared/mcp-gateway/connection.ts), the true gate (authFromSecret/authUsable are only a subset).
  -- The setter never destructively replaces a working connection with an unusable one. Validated BEFORE any
  -- destructive write, so a bundle that could never authenticate never clears state or lands a
  -- half-written credential. Two rules per kind: (a) the fields the runtime REQUIRES; (b) NO STRAY
  -- fields from another scheme (nothing the runtime would ignore is stored). Closed code
  -- MCP_BAD_CREDENTIAL_BUNDLE; NEVER echoes a value; text presence via btrim(COALESCE(...)).
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
    -- (api_key was already rejected above as MCP_AUTH_KIND_NOT_EXECUTABLE, so it never reaches here.)
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
    -- F3 (coordinator spec correction): the runtime's authFromSecret has NO refresh step — it ignores
    -- refresh_token and returns null without auth_token, so a refresh-only bundle loads as unusable and
    -- a rebind would strand a working connection. REQUIRE _auth_token, plus issuer + client_id; a
    -- refresh token (and client_secret/scopes/expiry) is OPTIONAL and additional. FORWARD-CONSTRAINT:
    -- refresh-only OAuth becomes acceptable only when the gateway grows a refresh step that mints a
    -- token before first use — a wiring-lane item (INT-083), not this setter.
    IF btrim(COALESCE(_auth_token, '')) = '' OR btrim(COALESCE(_oauth_issuer, '')) = ''
       OR btrim(COALESCE(_oauth_client_id, '')) = '' THEN
      RAISE EXCEPTION 'MCP_BAD_CREDENTIAL_BUNDLE' USING ERRCODE = '22023';
    END IF;
    -- F2: a custom header name belongs to the 'header' scheme, not oauth.
    IF btrim(COALESCE(_auth_header_name, '')) <> '' THEN
      RAISE EXCEPTION 'MCP_BAD_CREDENTIAL_BUNDLE' USING ERRCODE = '22023';
    END IF;
    -- round-4 (F/expired-oauth), round-5 F2 (now() -> clock_timestamp()): mirror the loader's oauthExpired
    -- EXACTLY (connection.ts:118 — `row.auth_kind === "oauth" && Number.isFinite(expiresAt) && expiresAt
    -- <= Date.now()`). `Date.now()` is the WALL CLOCK at the moment the check runs. In Postgres, now() is
    -- transaction_timestamp() — FIXED at the start of the transaction, so inside this setter's transaction
    -- it is a stale point that could pass a token the loader (using live time) would reject. clock_timestamp()
    -- is the true current wall clock and advances during the transaction, so it is the faithful mirror of
    -- Date.now(). EXACT `<=` — no skew, no grace. An already-expired access token loads as connection_unusable
    -- (no refresh step), so reject it at write time. A NULL / absent expiry is NOT expired (the loader treats
    -- a non-finite expiresAt as live), so it is allowed.
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
  -- token >= 12 chars and NULL below that — never the whole short token) and the flags appear.
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
      'auth_token_last4_before',  _conn.auth_token_last4,
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

COMMENT ON FUNCTION public.set_mcp_connection_endpoint(uuid, text, text, text, text, text, text, text, text, text[], timestamptz, uuid) IS
  'INT-099 (MCP PR-2): the endpoint setter for the Connected MCP Gateway. Resolves authority BEFORE reading the connection (§9): the mcp.connections.manage capability for the caller''s server-resolved tenant via _mcp_caller_capabilities (owner/tenant-admin only; platform owner EXCLUDED, A2), fail closed, no service-role bypass; a missing or foreign-tenant connection is a uniform MCP_FORBIDDEN. REFUSES a legacy-projected row (D1). PRINCIPLE (round 3, round-4 corrected oracle): a bundle it accepts is one the runtime LOADER makeRpcConnectionLoader (_shared/mcp-gateway/connection.ts) loads as usable — never a destructive rebind that strands a working connection. Validates the CREDENTIAL BUNDLE against auth_kind BEFORE any write: accepted kinds EQUAL the loader''s MCP_EXECUTABLE_AUTH_KINDS (connection.ts:58) — api_key → MCP_AUTH_KIND_NOT_EXECUTABLE (round-4); header→token + a runtime-usable header_name via _mcp_header_name_usable [F1], reject stray; bearer→token, reject stray; oauth→token+issuer+client_id [F3: token REQUIRED; refresh/secret/scopes optional-additional] + reject an already-expired access token (access_token_expires_at<=now() → MCP_OAUTH_TOKEN_EXPIRED, mirroring the loader''s oauthExpired connection.ts:118), reject stray header; url/none→no credential material [F2]; closed codes MCP_BAD_CREDENTIAL_BUNDLE / MCP_AUTH_KIND_NOT_EXECUTABLE / MCP_OAUTH_TOKEN_EXPIRED, never echoes a value). A bracketed endpoint host must be valid IPv6 (round-4: a bracketed IPv4 is refused, matching WHATWG new URL()). Writes the endpoint + FULL credential bundle in one atomic UPDATE, sourcing every credential column from the arguments (never carrying the old ciphertext forward) so a changed endpoint can never inherit the old secret; resets provider_state, and — EXPLICITLY, before the UPDATE — deletes the stale tool catalog AND revokes every endpoint-bound approval (unconditionally, so a same-URL credential rotation also drops consent; the 20270322000000 trigger then no-ops). Records a hashes/enums/counts-only audit into paige_audit_log in the same transaction (old/new endpoint_hash, endpoint_changed, credential_changed [F4: boolean derived in-definer from ALL credential-bearing fields — plaintext never logged], auth_kind + auth_token_last4 before/after, approvals_revoked, tools_cleared) (A1). Returns only connection_id/status/endpoint_hash/auth_token_last4 (A3). Static https + value-based IP + DNS-syntax SSRF URL validation only — runtime egress SSRF stays in mcp-client.ts (A4). EXECUTE to authenticated only (A5).';

REVOKE ALL ON FUNCTION public.set_mcp_connection_endpoint(uuid, text, text, text, text, text, text, text, text, text[], timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_mcp_connection_endpoint(uuid, text, text, text, text, text, text, text, text, text[], timestamptz, uuid) TO authenticated;
