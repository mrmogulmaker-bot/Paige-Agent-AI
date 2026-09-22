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
MIGRATION2="$REPO/supabase/migrations/20270402000000_agreements_read_and_expiry.sql"
MIGRATION3="$REPO/supabase/migrations/20270403000000_agreements_autonomy_catalogue.sql"
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
psql -v ON_ERROR_STOP=1 -q -f "$MIGRATION2" 2>&1 | grep -iE "^psql.*error" && { echo "FAIL — the read/expiry migration did not apply"; exit 1; }
# The catalogue migration depends on tables this fixture does not stand up (tenant_tool_autonomy
# and friends), so it is deliberately NOT applied here. Its coverage is proven by
# `npm run lint:tool-catalogue`, which reads the SQL directly — stating that rather than pretending
# this proof covers it.
echo "migrations 1 and 2 applied to a clean database (3 is catalogue-only, covered by lint:tool-catalogue)"
echo

OUT="$WORK/out.txt"
psql -q -f "$HERE/integrity-proof.sql"     2>&1 | grep -E '^(P[0-9]|C[0-9]|---)' | tee "$OUT"
echo
psql -q -f "$HERE/service-role-proof.sql"  2>&1 | grep -E '^(table|service_role|acting|S[0-9])' | tee -a "$OUT"
echo
# psql prefixes a NOTICE with "<file>:<line>: NOTICE:  ", so strip anything before the marker
# rather than anchoring at the start of the line.
psql -q -f "$HERE/read-and-expiry-proof.sql" 2>&1 | sed -E 's/^.*NOTICE:  //' | grep -E '^(E[0-9]|---)' | tee -a "$OUT"
echo

if grep -qE 'NO ERROR - GUARANTEE IS FALSE|UNEXPECTED|SUCCEEDED - INTEGRITY CLAIM IS FALSE' "$OUT"; then
  echo "FAIL — at least one integrity guarantee did not hold."
  exit 1
fi
if [ "$(grep -c 'PASS' "$OUT")" -lt 19 ]; then
  echo "FAIL — fewer negatives ran than expected; the proof itself is broken."
  exit 1
fi
if ! grep -q 'E2 status = expired' "$OUT" || ! grep -q 'E3 revoked = true' "$OUT"; then
  echo "FAIL — the expiry sweep did not expire the agreement or did not revoke its live token."
  exit 1
fi
if ! grep -q 'E8 refused' "$OUT" || ! grep -q 'E9 refused' "$OUT"; then
  echo "FAIL — the overview did not refuse a foreign workspace or a non-member."
  exit 1
fi
if ! grep -q 'C1 .*signed' "$OUT" || ! grep -q 'C2 .*signed' "$OUT"; then
  echo "FAIL — positive controls did not succeed, so the negatives prove nothing."
  exit 1
fi
echo "OK — every negative refused with its expected SQLSTATE; positive controls succeeded."
