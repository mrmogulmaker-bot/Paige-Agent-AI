#!/usr/bin/env bash
# A disposable, from-scratch replay of the FULL migration sequence on bare Postgres,
# then the C-7 tenant cases against it.
#
# WHY THIS EXISTS. Supabase's preview branch only pushes migration files it has not
# already recorded, so editing an already-applied migration means the next green
# Preview does NOT re-run it. The only way to force a full replay is a branch reset,
# and that fails on this schema with `out of shared memory (SQLSTATE 53200)` — the
# teardown drops every object in one DO block and exhausts locks on 344 tables.
# This runs the same replay locally, where `max_locks_per_transaction` can be raised.
#
# WHAT IT PROVES: that the migration sequence applies from nothing, and that the
# policies it ends with actually enforce the tenant boundary.
# WHAT IT DOES NOT PROVE: anything about production. Persisted-apply is §32.a, and
# comes from deploy-migrations.yml at merge.
#
# Usage:  sudo ./scripts/proofs/clean-replay.sh
set -uo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
BASE=${BASE:-/tmp/c7replay}
USER_NAME=${PGRUNNER:-pgrunner}
REPO=$(cd "$(dirname "$0")/../.." && pwd)

id "$USER_NAME" >/dev/null 2>&1 || useradd -m -s /bin/bash "$USER_NAME"
[ -d "$BASE/data" ] && su "$USER_NAME" -c "$PGBIN/pg_ctl -D $BASE/data -m immediate stop" >/dev/null 2>&1
rm -rf "$BASE"; mkdir -p "$BASE/data" "$BASE/sock"
cp -r "$REPO/supabase/migrations" "$BASE/migrations"
cp "$REPO/scripts/proofs/clean-replay-supabase-shim.sql" "$BASE/00-shim.sql"
cp "$REPO/scripts/proofs/c7-clean-replay-cases.sql"      "$BASE/c7-cases.sql"
chown -R "$USER_NAME:$USER_NAME" "$BASE"

su "$USER_NAME" -c "$PGBIN/initdb -D $BASE/data -U postgres --auth=trust" >/dev/null 2>&1
# The lock ceiling the hosted reset dies on. A full replay touches thousands of objects.
{ echo "unix_socket_directories = '$BASE/sock'"; echo "listen_addresses = ''"
  echo "max_locks_per_transaction = 4096"; echo "max_connections = 20"
  echo "shared_buffers = 256MB"; echo "fsync = off"; } >> "$BASE/data/postgresql.conf"
su "$USER_NAME" -c "$PGBIN/pg_ctl -D $BASE/data -l $BASE/server.log -w start" >/dev/null 2>&1
su "$USER_NAME" -c "$PGBIN/psql -h $BASE/sock -U postgres -q -f $BASE/00-shim.sql" 2>&1 | grep -E "^psql.*ERROR" || true

ok=0; fail=0; : > "$BASE/failures.txt"
for f in $(ls "$BASE"/migrations/*.sql | sort); do
  v=$(basename "$f" | cut -d_ -f1)
  if out=$(su "$USER_NAME" -c "$PGBIN/psql -h $BASE/sock -U postgres -v ON_ERROR_STOP=1 -q -f $f" 2>&1); then
    su "$USER_NAME" -c "$PGBIN/psql -h $BASE/sock -U postgres -q -c \"insert into supabase_migrations.schema_migrations(version,name) values ('$v','$(basename "$f")') on conflict do nothing\"" >/dev/null 2>&1
    ok=$((ok+1))
  else
    fail=$((fail+1))
    { echo "=== $(basename "$f")"; echo "$out" | grep -E "ERROR|FATAL" | head -2; echo; } >> "$BASE/failures.txt"
  fi
done
echo "MIGRATIONS APPLIED=$ok FAILED=$fail   (failures: $BASE/failures.txt)"
echo
su "$USER_NAME" -c "$PGBIN/psql -h $BASE/sock -U postgres -f $BASE/c7-cases.sql" 2>&1 | grep -vE "WARNING|CONTEXT|enqueue"
