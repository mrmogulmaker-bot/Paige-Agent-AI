-- mcp-backfill-drift.sql — READ-ONLY drift report for the Connected MCP Gateway backfill.
--
-- WHAT THIS IS. The Connected MCP Gateway registry (`public.mcp_connections`, migration
-- 20270319000000) was seeded by a ONE-TIME, non-destructive backfill (§6a/§6b of that migration)
-- that projects every legacy connection 1:1:
--   • §6a  public.tenant_mcp_connections (Zapier + n8n-OAuth) → mcp_connections
--          WHERE legacy_source='tenant_mcp_connections', matched on (tenant_id, legacy_provider = provider).
--   • §6b  public.tenant_n8n_connections (n8n REST / API-key) → mcp_connections
--          WHERE legacy_source='tenant_n8n_connections', matched on (tenant_id, legacy_provider IS NULL).
--
-- WHY A DRIFT CHECK IS NEEDED BEFORE CUTOVER. The legacy tables remain the SOLE live read/write path
-- (the gateway is unwired — Phase C). The backfill was a snapshot, and it does NOT auto-update, so the
-- projection can go stale the moment a legacy row is created, deleted, or has its endpoint/credential
-- rotated. The Phase-C cutover (moving execution onto `runConnectionCapability`) may not proceed until
-- the projection is proven 1:1 AND current with legacy — this report is that proof.
--
-- HOW TO RUN. Read-only; it only SELECTs. Zero rows returned = the projection is 1:1 and current.
-- Any row returned names a divergence that must be reconciled before that connection is cut over.
-- Run against production read-only (Supabase MCP `execute_sql`, or `psql -f`), never with a write.
--
-- FOUR DRIFT KINDS:
--   missing_projection   — a legacy row with no mcp_connections projection (backfill never ran for
--                          it, or the legacy row was created after the backfill).
--   orphan_projection    — an mcp_connections projection whose legacy row no longer exists (legacy
--                          row deleted; the projection now points at nothing).
--   duplicate_projection — more than one §6b (tenant_n8n_connections) projection for one tenant. The
--                          idempotency index does not constrain §6b (its legacy_provider is NULL), so
--                          a duplicate created outside the guarded backfill would otherwise pass
--                          silently. (§6a is uniquely indexed, so it cannot duplicate this way.)
--   credential_drift     — a matched pair whose VERBATIM-COPIED, EXECUTION-AFFECTING columns diverge.
--                          Only columns the backfill copies byte-for-byte AND the loader consumes to
--                          dispatch or refuse are compared. For §6a that is the COMPLETE copied runtime
--                          bundle: server_url_ct/auth_token_ct/auth_token_last4, the OAuth grant
--                          refresh_token_ct/oauth_client_secret_ct (the LIVE credential for a Zapier
--                          row, whose auth_token_ct is NULL), the header NAME (auth_header_name) a
--                          `header` connection dispatches with, the OAuth identity/expiry the secret
--                          reader consumes (access_token_expires_at — the loader refuses an
--                          expired-looking OAuth token, so a stale expiry mis-refuses —
--                          oauth_issuer/oauth_client_id/oauth_scopes), auth_kind/transport, AND the
--                          `enabled` gate: §6a copies `enabled` VERBATIM (`r.enabled`) and the loader
--                          refuses `enabled <> true` as `connection_disabled`, so a legacy enable/
--                          disable after the backfill leaves the projection stale enough to EXECUTE a
--                          connection legacy refuses (or vice versa) at cutover. For §6b it is
--                          base_url_ct/api_key_ct/api_key_last4 plus the fixed http/api_key facet. An
--                          updated legacy credential re-encrypts, changing the ciphertext, so an
--                          `IS DISTINCT FROM` on the `*_ct` bytea is the staleness signal. CAVEAT: if
--                          the cipher uses a random IV/salt, re-saving the SAME secret yields new
--                          ciphertext and is reported as drift — an over-report in the SAFE direction
--                          (never a missed rotation). DERIVED columns are NOT compared — they are
--                          re-mapped, not copied, so their per-connection parity belongs to the
--                          Phase-C cutover parity proof, not this row check: for both sources that is
--                          label / status→health / provider_state, and for §6b ALSO `enabled`, which
--                          §6b DERIVES as `(status IS DISTINCT FROM 'unconfigured')` rather than
--                          copying — hence the deliberate a_cred/b_cred asymmetry (§6a enabled is
--                          verbatim ⇒ compared; §6b enabled is derived ⇒ deferred). Audit lineage
--                          (created_by/updated_by/created_at) and the backfill-stamped updated_at are
--                          also never compared — the loader never reads them, so they cannot change
--                          dispatch or refusal.
--
-- Result shape: (drift_kind, legacy_source, tenant_id, provider_key, connection_id, detail).

WITH
-- §6a: a legacy tenant_mcp_connections row that has no projection.
a_missing AS (
  SELECT 'missing_projection'::text  AS drift_kind,
         'tenant_mcp_connections'::text AS legacy_source,
         l.tenant_id,
         l.provider                  AS provider_key,
         NULL::uuid                  AS connection_id,
         'legacy tenant_mcp_connections row has no mcp_connections projection'::text AS detail
    FROM public.tenant_mcp_connections l
   WHERE NOT EXISTS (
           SELECT 1
             FROM public.mcp_connections m
            WHERE m.legacy_source = 'tenant_mcp_connections'
              AND m.tenant_id = l.tenant_id
              AND m.legacy_provider IS NOT DISTINCT FROM l.provider)
),
-- §6b: a legacy tenant_n8n_connections row that has no projection.
b_missing AS (
  SELECT 'missing_projection'::text,
         'tenant_n8n_connections'::text,
         l.tenant_id,
         'n8n'::text,
         NULL::uuid,
         'legacy tenant_n8n_connections row has no mcp_connections projection'::text
    FROM public.tenant_n8n_connections l
   WHERE NOT EXISTS (
           SELECT 1
             FROM public.mcp_connections m
            WHERE m.legacy_source = 'tenant_n8n_connections'
              AND m.tenant_id = l.tenant_id
              AND m.legacy_provider IS NULL)
),
-- A §6a projection whose legacy row no longer exists.
a_orphan AS (
  SELECT 'orphan_projection'::text,
         m.legacy_source,
         m.tenant_id,
         m.provider_key,
         m.connection_id,
         'mcp_connections row projects a tenant_mcp_connections row that no longer exists'::text
    FROM public.mcp_connections m
   WHERE m.legacy_source = 'tenant_mcp_connections'
     AND NOT EXISTS (
           SELECT 1
             FROM public.tenant_mcp_connections l
            WHERE l.tenant_id = m.tenant_id
              AND l.provider IS NOT DISTINCT FROM m.legacy_provider)
),
-- A §6b projection whose legacy row no longer exists.
b_orphan AS (
  SELECT 'orphan_projection'::text,
         m.legacy_source,
         m.tenant_id,
         m.provider_key,
         m.connection_id,
         'mcp_connections row projects a tenant_n8n_connections row that no longer exists'::text
    FROM public.mcp_connections m
   WHERE m.legacy_source = 'tenant_n8n_connections'
     AND NOT EXISTS (
           SELECT 1
             FROM public.tenant_n8n_connections l
            WHERE l.tenant_id = m.tenant_id)
),
-- §6a: matched pair whose verbatim-copied, execution-affecting columns diverge (endpoint +
-- credential bundle + auth facet + the `enabled` gate — see the credential_drift header note).
a_cred AS (
  SELECT 'credential_drift'::text,
         'tenant_mcp_connections'::text,
         m.tenant_id,
         m.provider_key,
         m.connection_id,
         'projected endpoint/credential diverges from the current tenant_mcp_connections row'::text
    FROM public.mcp_connections m
    JOIN public.tenant_mcp_connections l
      ON l.tenant_id = m.tenant_id
     AND l.provider IS NOT DISTINCT FROM m.legacy_provider
   WHERE m.legacy_source = 'tenant_mcp_connections'
     AND ( m.server_url_ct            IS DISTINCT FROM l.server_url_ct
        OR m.auth_token_ct            IS DISTINCT FROM l.auth_token_ct
        OR m.auth_token_last4         IS DISTINCT FROM l.auth_token_last4
        -- The OAuth grant columns are copied verbatim by §6a and are the LIVE credential for a
        -- Zapier connection (provider='zapier' ⇒ auth_kind='oauth', with auth_token_ct/last4 NULL),
        -- so a refresh-token / client-secret rotation must count as drift or Zapier would be blind.
        OR m.refresh_token_ct         IS DISTINCT FROM l.refresh_token_ct
        OR m.oauth_client_secret_ct   IS DISTINCT FROM l.oauth_client_secret_ct
        -- The rest of the copied runtime bundle the secret reader consumes: the header NAME a
        -- `header` connection dispatches with, the OAuth identity used to refresh, and the
        -- access-token expiry the loader reads to refuse an expired OAuth token. A stale value in
        -- any of these makes the projection dispatch (or refuse) differently from legacy at cutover.
        OR m.auth_header_name         IS DISTINCT FROM l.auth_header_name
        OR m.access_token_expires_at  IS DISTINCT FROM l.access_token_expires_at
        OR m.oauth_issuer             IS DISTINCT FROM l.oauth_issuer
        OR m.oauth_client_id          IS DISTINCT FROM l.oauth_client_id
        OR m.oauth_scopes             IS DISTINCT FROM l.oauth_scopes
        OR m.auth_kind                IS DISTINCT FROM l.auth_kind
        OR m.transport                IS DISTINCT FROM l.transport
        -- The `enabled` gate. §6a copies `enabled` VERBATIM (`r.enabled`); the loader refuses
        -- `enabled <> true` as `connection_disabled`, so a projection left stale after a legacy
        -- enable/disable would EXECUTE a connection legacy refuses (or refuse one legacy allows) at
        -- cutover. (§6b DERIVES enabled from status and is deferred to the cutover parity proof — see
        -- the credential_drift note above for the deliberate a_cred/b_cred asymmetry.)
        OR m.enabled                  IS DISTINCT FROM l.enabled )
),
-- §6b: matched pair whose verbatim-copied endpoint/credential columns diverge. The backfill fixes
-- transport='http' and auth_kind='api_key' for this facet, so those are compared to the constants.
b_cred AS (
  SELECT 'credential_drift'::text,
         'tenant_n8n_connections'::text,
         m.tenant_id,
         m.provider_key,
         m.connection_id,
         'projected endpoint/credential diverges from the current tenant_n8n_connections row'::text
    FROM public.mcp_connections m
    JOIN public.tenant_n8n_connections l
      ON l.tenant_id = m.tenant_id
   WHERE m.legacy_source = 'tenant_n8n_connections'
     AND ( m.server_url_ct    IS DISTINCT FROM l.base_url_ct
        OR m.auth_token_ct    IS DISTINCT FROM l.api_key_ct
        OR m.auth_token_last4 IS DISTINCT FROM l.api_key_last4
        OR m.auth_kind        IS DISTINCT FROM 'api_key'
        OR m.transport        IS DISTINCT FROM 'http' )
),
-- More than one §6b projection for one tenant. The idempotency index
-- mcp_connections_legacy_lineage_uq(legacy_source, tenant_id, legacy_provider) does NOT constrain
-- §6b rows — their legacy_provider is always NULL and Postgres treats NULLs as distinct — so a
-- duplicate could slip in outside the guarded backfill (e.g. a manual owner insert under RLS). The
-- row checks above would otherwise pass every duplicate silently, so name it. (§6a is immune: its
-- legacy_provider is non-NULL, so the same index enforces uniqueness there.)
b_dup AS (
  SELECT 'duplicate_projection'::text,
         'tenant_n8n_connections'::text,
         m.tenant_id,
         m.provider_key,
         m.connection_id,
         'more than one tenant_n8n_connections projection exists for this tenant'::text
    FROM public.mcp_connections m
   WHERE m.legacy_source = 'tenant_n8n_connections'
     AND ( SELECT count(*)
             FROM public.mcp_connections d
            WHERE d.legacy_source = 'tenant_n8n_connections'
              AND d.tenant_id = m.tenant_id ) > 1
)
SELECT * FROM a_missing
UNION ALL SELECT * FROM b_missing
UNION ALL SELECT * FROM a_orphan
UNION ALL SELECT * FROM b_orphan
UNION ALL SELECT * FROM a_cred
UNION ALL SELECT * FROM b_cred
UNION ALL SELECT * FROM b_dup
ORDER BY drift_kind, legacy_source, tenant_id, connection_id;
