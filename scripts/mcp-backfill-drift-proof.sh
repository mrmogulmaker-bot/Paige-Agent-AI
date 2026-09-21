#!/usr/bin/env bash
# Falsifying proof for scripts/sql/mcp-backfill-drift.sql.
#
# Spins up a throwaway Postgres, creates the three tables the drift report reads (only the columns
# it references), seeds a CLEAN 1:1 pair for each legacy source plus one row of every drift kind,
# runs the REAL query file, and asserts it reports EXACTLY the seeded drift and never the clean pairs.
# It is falsifying: it fails loudly if the query misses a seeded drift OR flags a clean pair.
#
# Read-only against its own scratch cluster; it touches no project data and no production. Run:
#   bash scripts/mcp-backfill-drift-proof.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
QUERY="$HERE/sql/mcp-backfill-drift.sql"
[ -f "$QUERY" ] || { echo "FAIL: query file missing: $QUERY"; exit 1; }

# Locate the server binaries (initdb/pg_ctl are typically not on PATH; psql usually is).
PGBIN="$(dirname "$(command -v pg_ctl 2>/dev/null || ls /usr/lib/postgresql/*/bin/pg_ctl 2>/dev/null | sort -V | tail -1)")"
[ -x "$PGBIN/pg_ctl" ] || { echo "FAIL: pg_ctl not found (looked in PATH and /usr/lib/postgresql/*/bin)"; exit 1; }

WORK="$(mktemp -d /tmp/mcpdrift.XXXXXX)"
PGDATA="$WORK/data"; SOCK="$WORK/s"; mkdir -p "$PGDATA" "$SOCK"

# Postgres refuses to run as root; run the cluster as the postgres system user when we are root.
AS_PG="bash -lc"
if [ "$(id -un)" = "root" ]; then chown -R postgres "$WORK"; AS_PG="su postgres -c"; fi
pg() { PATH="$PGBIN:$PATH" $AS_PG "PATH='$PGBIN:$PATH' $*"; }

cleanup() { pg "pg_ctl -D '$PGDATA' -s -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

pg "initdb -D '$PGDATA' -A trust -U postgres" >/dev/null
pg "pg_ctl -D '$PGDATA' -o \"-k '$SOCK' -c listen_addresses=''\" -w start" >/dev/null

# psql helper: -f FILE, or stdin heredoc. Runs as postgres against the unix socket.
psql_run() { pg "psql -v ON_ERROR_STOP=1 -h '$SOCK' -U postgres -d postgres $*"; }

# ── Schema: only the columns the drift report reads ──────────────────────────────────────────────
psql_run -q <<'SQL'
CREATE TABLE public.mcp_connections (
  connection_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid, provider_key text, legacy_source text, legacy_provider text,
  server_url_ct bytea, auth_token_ct bytea, auth_token_last4 text,
  refresh_token_ct bytea, oauth_client_secret_ct bytea, auth_kind text, transport text,
  auth_header_name text, access_token_expires_at timestamptz,
  oauth_issuer text, oauth_client_id text, oauth_scopes text[], enabled boolean);
CREATE TABLE public.tenant_mcp_connections (
  tenant_id uuid, provider text, server_url_ct bytea, auth_token_ct bytea, auth_token_last4 text,
  refresh_token_ct bytea, oauth_client_secret_ct bytea, auth_kind text, transport text,
  auth_header_name text, access_token_expires_at timestamptz,
  oauth_issuer text, oauth_client_id text, oauth_scopes text[], enabled boolean);
CREATE TABLE public.tenant_n8n_connections (
  tenant_id uuid, base_url_ct bytea, api_key_ct bytea, api_key_last4 text);
SQL

# ── Fixtures. Tenants are named so the assertions can address each case. Explicit column lists so
#    the new OAuth-grant columns don't shift positional inserts. ───────────────────────────────────
psql_run -q <<'SQL'
-- CLEAN §6a pair (must produce NO drift): identical verbatim columns.
INSERT INTO public.tenant_mcp_connections (tenant_id, provider, server_url_ct, auth_token_ct, auth_token_last4, auth_kind, transport) VALUES
  ('a1111111-1111-4111-8111-111111111111','zapier','\x01','\x02','WXYZ','bearer','http');
INSERT INTO public.mcp_connections (tenant_id, provider_key, legacy_source, legacy_provider, server_url_ct, auth_token_ct, auth_token_last4, auth_kind, transport) VALUES
  ('a1111111-1111-4111-8111-111111111111','zapier','tenant_mcp_connections','zapier','\x01','\x02','WXYZ','bearer','http');

-- CLEAN §6b pair (NO drift): projection carries the fixed http/api_key facet.
INSERT INTO public.tenant_n8n_connections VALUES
  ('b1111111-1111-4111-8111-111111111111','\x0a','\x0b','K123');
INSERT INTO public.mcp_connections (tenant_id, provider_key, legacy_source, legacy_provider, server_url_ct, auth_token_ct, auth_token_last4, auth_kind, transport) VALUES
  ('b1111111-1111-4111-8111-111111111111','n8n','tenant_n8n_connections',NULL,'\x0a','\x0b','K123','api_key','http');

-- §6a missing_projection: legacy only.
INSERT INTO public.tenant_mcp_connections (tenant_id, provider, server_url_ct, auth_token_ct, auth_token_last4, auth_kind, transport) VALUES
  ('a2222222-2222-4222-8222-222222222222','zapier','\x01','\x02','WXYZ','bearer','http');

-- §6b missing_projection: legacy only.
INSERT INTO public.tenant_n8n_connections VALUES
  ('b2222222-2222-4222-8222-222222222222','\x0a','\x0b','K123');

-- §6a orphan_projection: projection with no legacy row.
INSERT INTO public.mcp_connections (tenant_id, provider_key, legacy_source, legacy_provider, server_url_ct, auth_token_ct, auth_token_last4, auth_kind, transport) VALUES
  ('a3333333-3333-4333-8333-333333333333','zapier','tenant_mcp_connections','zapier','\x01','\x02','WXYZ','bearer','http');

-- §6b orphan_projection.
INSERT INTO public.mcp_connections (tenant_id, provider_key, legacy_source, legacy_provider, server_url_ct, auth_token_ct, auth_token_last4, auth_kind, transport) VALUES
  ('b3333333-3333-4333-8333-333333333333','n8n','tenant_n8n_connections',NULL,'\x0a','\x0b','K123','api_key','http');

-- §6a credential_drift: matched pair, projected server_url_ct is STALE (legacy rotated).
INSERT INTO public.tenant_mcp_connections (tenant_id, provider, server_url_ct, auth_token_ct, auth_token_last4, auth_kind, transport) VALUES
  ('a4444444-4444-4444-8444-444444444444','n8n','\xFF','\x02','WXYZ','bearer','http');
INSERT INTO public.mcp_connections (tenant_id, provider_key, legacy_source, legacy_provider, server_url_ct, auth_token_ct, auth_token_last4, auth_kind, transport) VALUES
  ('a4444444-4444-4444-8444-444444444444','n8n','tenant_mcp_connections','n8n','\x01','\x02','WXYZ','bearer','http');

-- §6b credential_drift: matched pair, projected last4 is STALE.
INSERT INTO public.tenant_n8n_connections VALUES
  ('b4444444-4444-4444-8444-444444444444','\x0a','\x0b','NEW9');
INSERT INTO public.mcp_connections (tenant_id, provider_key, legacy_source, legacy_provider, server_url_ct, auth_token_ct, auth_token_last4, auth_kind, transport) VALUES
  ('b4444444-4444-4444-8444-444444444444','n8n','tenant_n8n_connections',NULL,'\x0a','\x0b','K123','api_key','http');

-- §6a ZAPIER credential_drift via the OAuth GRANT (the adversarial Finding-1 case the old query
-- missed): auth_token_ct is NULL on both sides (Zapier ⇒ oauth), but the legacy refresh_token_ct was
-- ROTATED while the projection keeps the old grant. Undetectable unless refresh_token_ct is compared.
INSERT INTO public.tenant_mcp_connections (tenant_id, provider, server_url_ct, auth_token_ct, auth_token_last4, refresh_token_ct, auth_kind, transport) VALUES
  ('a5555555-5555-4555-8555-555555555555','zapier','\x01',NULL,NULL,'\xAA','oauth','http');
INSERT INTO public.mcp_connections (tenant_id, provider_key, legacy_source, legacy_provider, server_url_ct, auth_token_ct, auth_token_last4, refresh_token_ct, auth_kind, transport) VALUES
  ('a5555555-5555-4555-8555-555555555555','zapier','tenant_mcp_connections','zapier','\x01',NULL,NULL,'\x99','oauth','http');

-- §6a credential_drift via the REST of the runtime bundle (Codex P2): a `header` connection whose
-- auth_header_name drifted, with server_url_ct/auth_token_ct/last4 all matching — undetectable
-- unless the header name (and the OAuth identity/expiry) are compared.
INSERT INTO public.tenant_mcp_connections (tenant_id, provider, server_url_ct, auth_token_ct, auth_token_last4, auth_kind, transport, auth_header_name) VALUES
  ('a6666666-6666-4666-8666-666666666666','custom','\x01','\x02','WXYZ','header','http','X-New-Key');
INSERT INTO public.mcp_connections (tenant_id, provider_key, legacy_source, legacy_provider, server_url_ct, auth_token_ct, auth_token_last4, auth_kind, transport, auth_header_name) VALUES
  ('a6666666-6666-4666-8666-666666666666','custom','tenant_mcp_connections','custom','\x01','\x02','WXYZ','header','http','X-Old-Key');

-- §6a credential_drift via the ENABLED gate (Codex P1, head 7b132df8): a matched pair whose `enabled`
-- flag drifted — legacy DISABLED the connection but the projection still reads enabled=true. §6a copies
-- `enabled` VERBATIM, and the gateway loader refuses `enabled <> true` (connection_disabled), so at
-- cutover the projection would EXECUTE a connection the legacy path refuses. EVERY other column matches;
-- undetectable unless `enabled` is compared. (§6b derives enabled from status ⇒ deferred, not seeded.)
INSERT INTO public.tenant_mcp_connections (tenant_id, provider, server_url_ct, auth_token_ct, auth_token_last4, auth_kind, transport, enabled) VALUES
  ('a7777777-7777-4777-8777-777777777777','n8n','\x01','\x02','WXYZ','bearer','http',false);
INSERT INTO public.mcp_connections (tenant_id, provider_key, legacy_source, legacy_provider, server_url_ct, auth_token_ct, auth_token_last4, auth_kind, transport, enabled) VALUES
  ('a7777777-7777-4777-8777-777777777777','n8n','tenant_mcp_connections','n8n','\x01','\x02','WXYZ','bearer','http',true);

-- §6b duplicate_projection: one legacy row, TWO projections (the unindexed-NULL gap, Finding 2).
INSERT INTO public.tenant_n8n_connections VALUES
  ('b5555555-5555-4555-8555-555555555555','\x0a','\x0b','K123');
INSERT INTO public.mcp_connections (tenant_id, provider_key, legacy_source, legacy_provider, server_url_ct, auth_token_ct, auth_token_last4, auth_kind, transport) VALUES
  ('b5555555-5555-4555-8555-555555555555','n8n','tenant_n8n_connections',NULL,'\x0a','\x0b','K123','api_key','http'),
  ('b5555555-5555-4555-8555-555555555555','n8n','tenant_n8n_connections',NULL,'\x0a','\x0b','K123','api_key','http');
SQL

# ── Run the REAL query and assert ────────────────────────────────────────────────────────────────
OUT="$(psql_run "-tAF'|' -f '$QUERY'")"
echo "── drift report ──"; echo "$OUT"; echo "──────────────────"

fail=0
have()   { echo "$OUT" | grep -q "$1" && echo "  ok   $2" || { echo "  FAIL $2"; fail=1; }; }
absent() { echo "$OUT" | grep -q "$1" && { echo "  FAIL $2"; fail=1; } || echo "  ok   $2"; }

have   "missing_projection|tenant_mcp_connections|a2222222"   "§6a missing_projection detected"
have   "missing_projection|tenant_n8n_connections|b2222222"   "§6b missing_projection detected"
have   "orphan_projection|tenant_mcp_connections|a3333333"    "§6a orphan_projection detected"
have   "orphan_projection|tenant_n8n_connections|b3333333"    "§6b orphan_projection detected"
have   "credential_drift|tenant_mcp_connections|a4444444"     "§6a credential_drift (server_url_ct) detected"
have   "credential_drift|tenant_n8n_connections|b4444444"     "§6b credential_drift (last4) detected"
have   "credential_drift|tenant_mcp_connections|a5555555"     "§6a ZAPIER credential_drift via refresh_token_ct detected (Finding 1)"
have   "credential_drift|tenant_mcp_connections|a6666666"     "§6a credential_drift via auth_header_name detected (Codex P2 — full runtime bundle)"
have   "credential_drift|tenant_mcp_connections|a7777777"     "§6a credential_drift via enabled gate detected (Codex P1 — stale-enabled would execute a disabled connection)"
have   "duplicate_projection|tenant_n8n_connections|b5555555" "§6b duplicate_projection detected (Finding 2)"
absent "a1111111" "CONTROL — clean §6a pair produces NO drift"
absent "b1111111" "CONTROL — clean §6b pair produces NO drift"

# 2 missing + 2 orphan + 2 cred + 1 zapier-cred + 1 header-cred + 1 enabled-cred + 2 duplicate rows = 11.
COUNT="$(echo "$OUT" | grep -c '|' || true)"
[ "$COUNT" = "11" ] && echo "  ok   exactly 11 drift rows, no more" || { echo "  FAIL expected 11 drift rows, got $COUNT"; fail=1; }

echo
if [ "$fail" = "0" ]; then echo "PROOF PASSED — mcp-backfill-drift.sql detects every drift kind and no clean pair."; else echo "PROOF FAILED"; exit 1; fi
