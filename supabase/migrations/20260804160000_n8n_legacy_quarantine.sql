-- Wave 1 #240 Track A — n8n legacy quarantine (§9/§18/§37/§51).
--
-- CONTEXT. n8n is already fully per-tenant: the PROVEN model is
-- `tenant_n8n_connections` (20260711210000) — tenant_id PK, encrypted
-- base_url_ct/api_key_ct, RLS owner-ALL, all access via dual-caller SECURITY
-- DEFINER RPCs, consumed by the live `paige-n8n` edge function. The B1 slice did
-- the identical move for the MCP analog (`tenant_mcp_connections`, 20260804130000)
-- and explicitly deferred the LEGACY retirement to "a later slice". Track A is
-- that retirement for n8n.
--
-- THE RESIDUAL GAP (grounded on prod xygzykjyynhzqytbqnzu, 2026-08-04):
--   `public.paige_n8n_connections` is the legacy platform-GLOBAL connection
--   (single row keyed by is_default=true, NO tenant_id). Prod state:
--     • 0 rows (empty), RLS ENABLED, policy `is_platform_owner()` for USING+CHECK
--       (locked down 2026-07-21 by 20260721053737).
--     • BUT table-level GRANTs are still WIDE: BOTH `anon` AND `authenticated`
--       hold SELECT/INSERT/UPDATE/DELETE on a table whose surviving payload column
--       is the ciphertext `base_url_ct bytea`. The proven `tenant_n8n_connections`
--       grants NOTHING to anon/authenticated (only `postgres`) — its ciphertext is
--       never member-reachable. RLS blocks non-owners today, but the standing grant
--       is defense-in-depth debt of the exact class B1 closed for MCP.
--
-- THE FIX (this migration — additive, NON-DESTRUCTIVE, merge-on-verified per §4):
--   REVOKE the anon/authenticated table grants so the legacy table matches the
--   proven table's posture — reachable ONLY by the platform owner (RLS) / service
--   role (server). No rows are touched, no column/schema changes, no secret rotation.
--
-- The companion half of Track A (retiring the 3 legacy edge functions
-- `n8n-list-workflows` / `n8n-trigger-workflow` / `n8n-get-executions`, which read
-- the DROPPED `base_url` column and are non-tenant-scoped `requireAdmin`-gated dead
-- code, plus removing the one orphaned frontend producer) ships in the same PR as
-- code deletions. §4: the empty legacy table itself is left PARKED (not dropped) —
-- `paige_workflow_registry.connection_id` still FKs it ON DELETE SET NULL; a table
-- DROP would trip the §4 destructive gate and is deliberately a separate later slice.

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.paige_n8n_connections
  FROM anon, authenticated;

-- Belt-and-suspenders: also drop any implicit PUBLIC grant on the ciphertext table.
REVOKE ALL ON public.paige_n8n_connections FROM PUBLIC;

-- service_role + postgres retain their grants intentionally (server-side / owner).
-- RLS (policy `admins manage n8n connections` = is_platform_owner()) is unchanged
-- and remains the JWT-level gate; this REVOKE removes the redundant table grant that
-- should never have existed on a ciphertext-bearing legacy table.
