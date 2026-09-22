#!/usr/bin/env bash
# INT-163 — executable proof that the agreements engine's integrity guarantees are real.
#
# WHY THIS EXISTS. Every immutability claim in `20270401000000_agreements_engine_records.sql` — the
# one-way status machine, the freeze at send, the write-once seal, the append-only audit trail, the
# cross-tenant refusal — is enforced by a TRIGGER, because RLS does not bind `service_role` and the
# real writers are service-role edge functions. A trigger that is believed to fire and does not is
# indistinguishable, in the schema, from one that works. So this drives each guarantee and asserts
# the exact SQLSTATE, and it drives POSITIVE controls too: negatives that pass because the statement
# was malformed prove nothing at all.
#
# It stands up its own throwaway cluster, so it needs no credentials and touches no real database.
#
#   ./scripts/agreements/run-integrity-proof.sh
#
# Exit 0 means every negative was refused with the expected code and every positive succeeded.
#
# WHAT IT DOES NOT PROVE (§13). The fixture schema is a stand-in for the real `clients` /
# `tenant_products` / auth-helper surface, and the ownership model is representative of Supabase's
# (tables owned by a non-superuser role; `service_role` BYPASSRLS but not a member of the owner) —
# it is NOT production. Confirming the same behaviour on prod is a separate §32 step for a session
# that holds database access.
set -euo pipefail

# Postgres refuses to run as root. Containers and CI images frequently ARE root, so rather than
# failing with a hint nobody can act on, drop to an unprivileged user and re-exec once.
if [ "$(id -u)" -eq 0 ]; then
  RUNNER="${PROOF_RUNNER_USER:-pgproof}"
  id "$RUNNER" >/dev/null 2>&1 || useradd -m "$RUNNER" >/dev/null 2>&1 || true
  if [ "${PROOF_REEXEC:-}" = "1" ]; then
    echo "already re-executed and still root — refusing to run postgres as root"; exit 2
  fi
  export PROOF_REEXEC=1
  exec su "$RUNNER" -c "PROOF_REEXEC=1 PGBIN='${PGBIN:-}' TMPDIR=/var/tmp $(printf '%q' "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")")"
fi

# Find the server binaries. GitHub runners ship PostgreSQL but the major version moves, so the
# version is discovered rather than pinned; PGBIN overrides everything.
if [ -z "${PGBIN:-}" ]; then
  for candidate in /usr/lib/postgresql/*/bin /usr/pgsql-*/bin /opt/homebrew/opt/postgresql@*/bin; do
    [ -x "$candidate/initdb" ] && PGBIN="$candidate"
  done
  : "${PGBIN:=$(dirname "$(command -v initdb 2>/dev/null || echo /nonexistent/x)")}"
fi
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIGRATION="$REPO/supabase/migrations/20270401000000_agreements_engine_records.sql"
WORK="$(mktemp -d)"
PORT="${PGPORT:-55432}"

cleanup() { "$PGBIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

[ -x "$PGBIN/initdb" ] || {
  echo "FAIL — no PostgreSQL server binaries found (looked for initdb; PGBIN='$PGBIN')."
  echo "This proof is the only thing asserting the engine's integrity triggers actually fire."
  echo "Install postgresql or set PGBIN. It is deliberately NOT skipped: a silently skipped"
  echo "integrity proof reads exactly like a passing one."
  exit 2
}
[ -f "$MIGRATION" ] || { echo "migration not found: $MIGRATION"; exit 2; }

"$PGBIN/initdb" -D "$WORK/data" -U proofrunner --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$WORK/data" -l "$WORK/server.log" -o "-p $PORT -k $WORK" start >/dev/null
for _ in $(seq 1 20); do "$PGBIN/pg_isready" -h "$WORK" -p "$PORT" >/dev/null 2>&1 && break; sleep 0.5; done

psql() { "$PGBIN/psql" -h "$WORK" -p "$PORT" -U proofrunner -d proof "$@"; }
"$PGBIN/psql" -h "$WORK" -p "$PORT" -U proofrunner -d postgres -q -c 'CREATE DATABASE proof' >/dev/null

psql -v ON_ERROR_STOP=1 -q -f "$HERE/_fixture-schema.sql" >/dev/null
psql -v ON_ERROR_STOP=1 -q -f "$MIGRATION" >/dev/null 2>&1
echo "migration applied to a clean database"
echo

OUT="$WORK/out.txt"
psql -q -f "$HERE/integrity-proof.sql"     2>&1 | grep -E '^(P[0-9]|C[0-9]|---)' | tee "$OUT"
echo
psql -q -f "$HERE/service-role-proof.sql"  2>&1 | grep -E '^(table|service_role|acting|S[0-9])' | tee -a "$OUT"
echo

if grep -qE 'NO ERROR - GUARANTEE IS FALSE|UNEXPECTED|SUCCEEDED - INTEGRITY CLAIM IS FALSE' "$OUT"; then
  echo "FAIL — at least one integrity guarantee did not hold."
  exit 1
fi
if [ "$(grep -c 'PASS' "$OUT")" -lt 19 ]; then
  echo "FAIL — fewer negatives ran than expected; the proof itself is broken."
  exit 1
fi
if ! grep -q 'C1 .*signed' "$OUT" || ! grep -q 'C2 .*signed' "$OUT"; then
  echo "FAIL — positive controls did not succeed, so the negatives prove nothing."
  exit 1
fi
echo "OK — every negative refused with its expected SQLSTATE; positive controls succeeded."
