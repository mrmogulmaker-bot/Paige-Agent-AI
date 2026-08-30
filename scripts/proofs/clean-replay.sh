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
#
# WHAT IT DOES NOT PROVE — read this before quoting the pass rate:
#
#   1. ANYTHING ABOUT PRODUCTION. Persisted-apply is §32.a and comes from
#      deploy-migrations.yml at merge.
#
#   2. THE FRESH-REBUILD CASE IT MOST RESEMBLES. Everything here runs as the
#      bootstrap SUPERUSER, who also owns every object the shim creates —
#      including `realtime.messages`. On hosted, `db push` connects as a
#      non-superuser that does NOT own that table, and 7 migrations do
#      `CREATE POLICY ... ON realtime.messages`, which requires ownership. That is
#      the repo's own tracked #275/#350 hazard, named in deploy-migrations.yml as a
#      hard blocker for fresh rebuilds. This harness CANNOT reproduce it by
#      construction, so "the sequence applies from nothing" is true for a superuser
#      replay and is NOT a fresh-rebuild guarantee.
#
#   3. THAT THE CRON-TOUCHING MIGRATIONS DID ANYTHING. `cron.schedule` is stubbed;
#      it returns an id and schedules nothing, so ~31 migrations apply without their
#      effect being exercised. Disclosed here because "830 applied" would otherwise
#      imply more than it means.
#
# TWO CORRECTIONS TO AN EARLIER VERSION OF THIS FILE, both found by an independent
# review rather than by me:
#
#   · IT DID NOT APPLY MIGRATIONS THE WAY `db push` DOES. Each file was fed to psql
#     WITHOUT a wrapping transaction, so 20260801120000 — which does
#     `CREATE TEMP TABLE ... ON COMMIT DROP` and then reads that table — dropped it
#     underneath itself and failed at `_c169_groups does not exist`. I had filed
#     that under "known shim gaps", i.e. as a fault in the model rather than
#     evidence about it. It is now `--single-transaction`, and that migration
#     applies. This also SETTLES a question a previous commit recorded as
#     unanswerable from the tree: 20260801120000 is recorded applied in prod's
#     supabase_migrations.schema_migrations and was applied by db push, and it
#     cannot have succeeded unless db push wrapped the file. It does.
#
#   · THE FAILURE GUARD COMPARED A COUNT. `[ "$fail" -gt 5 ]` let a NEW broken
#     migration take a known one's slot in total silence — demonstrated by
#     neutering one known failure and breaking a real migration from this branch,
#     which produced five failures, ALL ASSERTIONS PASSED, and exit 0. It now
#     compares the failing SET against a named list, so a substitution, an
#     addition, or a shim gap being fixed all show as drift.
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
cp "$REPO/scripts/proofs/a2p-draft-durability-cases.sql" "$BASE/a2p-cases.sql"
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
  # --single-transaction, because that is what `supabase db push` actually does.
  #
  # SETTLED 2026-08-30, having previously been recorded as unknowable from the
  # tree. An independent review noticed that 20260801120000 fails here at
  # `_c169_groups does not exist` — a CREATE TEMP TABLE ... ON COMMIT DROP
  # autocommitting and dropping itself before the next statement — and applies
  # cleanly WITH a wrapping transaction. That migration is recorded applied in
  # prod's supabase_migrations.schema_migrations, and it was applied by db push.
  # It could not have succeeded unless db push wrapped the file. So the replay
  # was UNFAITHFUL, and the resulting failure was filed under "known shim gaps"
  # when it was really this harness diverging from the thing it models.
  if out=$(su "$USER_NAME" -c "$PGBIN/psql -h $BASE/sock -U postgres -v ON_ERROR_STOP=1 -q --single-transaction -f $f" 2>&1); then
    su "$USER_NAME" -c "$PGBIN/psql -h $BASE/sock -U postgres -q -c \"insert into supabase_migrations.schema_migrations(version,name) values ('$v','$(basename "$f")') on conflict do nothing\"" >/dev/null 2>&1
    ok=$((ok+1))
  else
    fail=$((fail+1))
    { echo "=== $(basename "$f")"; echo "$out" | grep -E "ERROR|FATAL" | head -2; echo; } >> "$BASE/failures.txt"
  fi
done
echo "MIGRATIONS APPLIED=$ok FAILED=$fail   (failures: $BASE/failures.txt)"
echo

# EXIT CODE. `psql -f` returns 0 even when the script RAISEs, and a `grep -v`
# filter returns 0 because it prints lines — so an earlier version of this script
# exited 0 whether the assertions passed or failed, making PASS and FAIL
# indistinguishable to any caller. A one-line CI wiring of that would have been a
# permanently-green gate on a file whose header calls itself a proof.
cases_out=$(su "$USER_NAME" -c "$PGBIN/psql -h $BASE/sock -U postgres -f $BASE/c7-cases.sql" 2>&1)
echo "$cases_out" | grep -vE "WARNING|CONTEXT|enqueue"

# FAILED is tested FIRST, deliberately. The failure message embeds the whole
# assertion log, so a future label containing the phrase "ALL ASSERTIONS PASSED"
# would have matched inside a FAILING run's own body and scored it green. No
# current label does, so this was never live — but for the one mechanism whose
# entire job is telling PASS from FAIL, the safe order costs nothing.
# The A2P draft-durability cases run against the SAME fresh replay, so the seam is
# proved on a schema built from nothing rather than on prod's accumulated state.
a2p_out=$(su "$USER_NAME" -c "$PGBIN/psql -h $BASE/sock -U postgres -f $BASE/a2p-cases.sql" 2>&1)
echo "$a2p_out" | grep -vE "WARNING|CONTEXT|enqueue"
if echo "$a2p_out" | grep -q "A2P DRAFT PROOF: ALL ASSERTIONS PASSED"; then
  a2p_rc=0
elif echo "$a2p_out" | grep -q "ASSERTION(S) FAILED"; then
  a2p_rc=1
else
  echo "!! a2p-cases produced neither sentinel — treating as FAILURE" >&2
  a2p_rc=1
fi

if echo "$cases_out" | grep -q "ASSERTION(S) FAILED"; then
  cases_rc=1
elif echo "$cases_out" | grep -q "ALL ASSERTIONS PASSED"; then
  cases_rc=0
else
  # Neither sentinel: the block did not reach its own RAISE, so it aborted early.
  # That is a failure, not an unknown — refusing to guess is the point.
  echo "!! c7-cases produced neither sentinel — treating as FAILURE" >&2
  cases_rc=1
fi

# A migration failure outside the known shim gaps is also a failure — compared as
# a LIST, not a count.
#
# The count guard was worse than no guard. An independent review neutered one
# known-failing migration and broke a real one from THIS branch
# (20261002000000_comms_credential_lockdown_and_readiness), and the harness
# reported five failures, printed ALL ASSERTIONS PASSED and exited 0: a different
# five, one of them genuinely broken, entirely silent. Substitution was invisible
# because nothing ever compared WHICH migrations failed.
#
# These four are shim gaps, not defects: objects Supabase provides that the shim
# does not (auth.refresh_tokens, vault.create_secret). Each is named so that a
# NEW failure cannot hide behind an old one's slot, and so that a shim gap being
# FIXED shows up as drift too.
EXPECTED_FAILURES="20260419011001_cae1c77f-6d84-4463-9f0a-f2068179db74.sql
20260712134641_cron_token_to_vault_functions.sql
20260712135910_cron_token_to_vault.sql
20260712150000_cron_token_to_vault.sql"

actual_failures=$(grep '^=== ' "$BASE/failures.txt" | sed 's/^=== //' | sort)
expected_sorted=$(printf '%s\n' "$EXPECTED_FAILURES" | sed '/^$/d' | sort)
if [ "$actual_failures" != "$expected_sorted" ]; then
  echo "!! migration failure SET differs from the expected shim gaps" >&2
  echo "--- unexpected (failed but should not have) ---" >&2
  comm -13 <(printf '%s\n' "$expected_sorted") <(printf '%s\n' "$actual_failures") >&2
  echo "--- no longer failing (fix the expected list) ---" >&2
  comm -23 <(printf '%s\n' "$expected_sorted") <(printf '%s\n' "$actual_failures") >&2
  cases_rc=1
fi
if [ "$a2p_rc" -ne 0 ]; then cases_rc=1; fi

# D2 is the one fix a single-session DO block structurally cannot pin — see the
# script's header. It runs last because it commits fixtures and cleans them up.
if ! bash "$REPO/scripts/proofs/a2p-concurrency-proof.sh" "$BASE" "$PGBIN" "$USER_NAME"; then
  cases_rc=1
fi
exit "$cases_rc"
