#!/usr/bin/env bash
# =============================================================================
# D2 — the concurrency fix, pinned by two REAL sessions.
#
# WHY THIS EXISTS AS A SEPARATE SCRIPT
#
# The durable-save proof runs inside one DO block, so it has exactly one session
# and cannot observe a lock. An independent review measured the consequence: with
# the whole D2 mechanism reverted — the `for update` on the read, the `where not
# ... immutable` on the DO UPDATE, and the in-body pre-check — every one of those
# 20 assertions still passed. The single fix the owner locked as D2 had no proof
# coverage at all, and "all assertions passed" said nothing about it.
#
# Two guards make the outcome safe, so deleting either alone changes no outcome
# and no single-session test can ever see it. What distinguishes `for update`
# specifically is not the outcome, it is whether a concurrent writer BLOCKS. So
# that is what this measures, directly.
#
# THE SCENARIO
#   A: BEGIN; lock the tenant's registration FOR UPDATE; hold it; approve it; COMMIT.
#   B: (starting while A holds the lock) call the save seam as a tenant admin.
#
# WHAT THIS DOES AND DOES NOT PIN — measured, not assumed.
#
# An earlier draft of this script claimed the wait time pins `for update`. It does
# not, and the mutation says so: with `for update` deleted, B still waits ~2s and
# still refuses. The reason is that the INSERT ... ON CONFLICT DO UPDATE has to take
# the same row lock to write, so B contends either way — just later. `for update`
# moves the contention earlier; it does not change the outcome, and no test can
# observe it. Reporting the wait as proof of the lock would have been a green
# assertion measuring something other than what it named.
#
# What IS pinned is the thing D2 was locked for: an approved, carrier-linked
# registration must not be overwritten by a draft save racing it. Removing any ONE
# of the three overlapping guards changes no outcome — each independently refuses —
# but removing the immutability protection outright is caught here, and reproduces
# the original defect exactly: status downgraded approved -> pending, the draft's
# copy in place, and brand_sid still set.
#
# Asserted: B contended for the row, B REFUSED, and the approved row is byte-intact.
# =============================================================================
# =============================================================================
# WHY THIS IS NOW ONE PARAMETERIZED MATRIX AND NOT FOUR HAND-WRITTEN SESSIONS
#
# Four consecutive independent reviews found the same defect here, one instance
# at a time: a session whose exit status and output were discarded, so a DEAD
# session was reported as a guard or lock finding. Each round fixed the instance
# it was shown and left its symmetric twin — A then T1 then T2, and the eighth
# review proved the fix had covered three of four and pointed its newly-confident
# message at the fourth (B).
#
# Patching the next one would repeat the cycle. So the sessions are now DATA, run
# through ONE path that cannot forget any of them: every session is registered in
# SESSIONS, and the runner captures its exit status AND its output AND asserts a
# positive RAN-MARK for it before any outcome assertion is evaluated. Adding a
# fifth session means adding a row; it cannot mean forgetting a capture.
#
# THE RAN-MARK IS THE MECHANISM, AND EXIT STATUS ALONE IS NOT ENOUGH.
# Measured on a real cluster: B's HEALTHY run exits 1, because the guard it exists
# to prove raises. So does a dead B whose RPC is missing. An rc-based gate would
# either fire on every green run or catch nothing. Each session therefore declares
# a mark that is true ONLY if it did its own work — a string its own output must
# contain, or a value it must have left in the row — and that mark is what
# distinguishes "did not run" from "ran and the guard fired".
#
# The ordering skew is a THIRD outcome, distinct from both: both sessions ran, and
# they raced the other way round. It is named as that rather than as either.
#
# MUTATION-TESTED, on a real cluster, TEN runs. Not "reviewed and believed":
#
#   baseline, nothing mutated ............ PASSED
#   A's UPDATE broken .................... INCONCLUSIVE, names A
#   B's RPC name broken .................. INCONCLUSIVE, names B
#   T1's RPC name broken ................. INCONCLUSIVE, names T1
#   T2's RPC name broken ................. INCONCLUSIVE, names T2
#   D2's verification READ broken ........ INCONCLUSIVE, names the READ
#   D3's verification READ broken ........ INCONCLUSIVE, names the READ
#   a second alternate on T2's mark ...... PASSED (the extension point is safe)
#   pg_advisory_xact_lock deleted ........ D3 FAILED, "a real finding"
#   a2p_registration_is_immutable := false  D2 FAILED, "a real guard/lock finding"
#
# The last two are what stop this being a machine for reporting INCONCLUSIVE: the
# guards it exists to pin are removed for real, all four sessions run clean, and it
# names the defect rather than a dead session.
#
# FOUR OF THOSE ROWS EXIST BECAUSE A DRAFT OF THIS FILE FAILED THEM, and each
# failure was the same shape as the four it was written to end:
#
#   · B's mark was REGISTRATION_IMMUTABLE, which is ALSO B's assertion, so
#     deleting the guard produced a healthy B that printed no such string and was
#     reported as dead. A mark may never be the outcome it gates.
#   · The verification READS discarded stderr and rc, so a broken column name in
#     one — with all four sessions healthy — printed "this is a real guard/lock
#     finding". The defect had simply moved one layer out, from the sessions to
#     the reads that judge them.
#   · The first repair for that was `final=$(read_or_die …)`. `exit` inside a
#     command substitution ends the SUBSHELL: the run would have carried on with
#     an empty value and printed the finding anyway. It sets a global instead.
#   · Feeding the SQL by `-f` (to kill a second shell expansion) made psql
#     continue past an error, so A's post-COMMIT token printed for a transaction
#     that had rolled back. ON_ERROR_STOP is why that row passes now.
#
# Every one of those was caught by RUNNING the matrix, not by reading it.
# =============================================================================
set -uo pipefail
BASE="${1:?usage: a2p-concurrency-proof.sh <cluster-base> <pgbin> <unix-user>}"
PGBIN="${2:?}"; USER_NAME="${3:?}"
HOLD_SECONDS=3
LAUNCH_GAP=1          # the gap between a pair's two launches. THIS is what decides
                      # which session reaches the lock first — HOLD_SECONDS governs
                      # only how long the winner then holds it.

# 0755, because the sessions run as $USER_NAME and read their SQL from here.
# mktemp -d gives 0700 owned by root, which every session would fail to read —
# and it would fail as "could not open file", i.e. as a dead session, which the
# ran-marks would correctly report but which is a self-inflicted INCONCLUSIVE.
TMPD="$(mktemp -d)"; chmod 755 "$TMPD"; trap 'rm -rf "$TMPD"' EXIT
psql_as() { su "$USER_NAME" -c "$PGBIN/psql -h $BASE/sock -U postgres -X -q -t -A $*"; }

# ── the session matrix ───────────────────────────────────────────────────────
declare -A S_PID S_RC S_OUT S_MARK_KIND S_MARK_WANT S_MARK_GOT S_MARK_OK S_LABEL

# start_session <name> <label> <bg|fg> <sql>
#   Captures stdout+stderr for EVERY session, backgrounded or not. The previous
#   revisions sent background sessions to /dev/null, which is precisely how a dead
#   one became invisible.
# THE SQL GOES IN ON STDIN, NOT THROUGH A SECOND SHELL.
#
# It used to be interpolated into the string handed to `su -c`, which `sh` then
# re-parses — two rounds of expansion. Measured: `select $$dollar-quoted$$` came
# back as `select 31451dollar-quoted31451`, the PID substituted into the SQL. The
# four sessions here are `$`-free after bash's own pass so nothing was wrong, but
# this file's whole thesis is that adding a session is JUST ADDING A ROW, and a
# future row using dollar-quoting, a backtick or a backslash would corrupt in
# silence rather than error. Writing to a file and feeding `-f` removes the second
# hop entirely — and it lets the SQL below be written plainly, with no \\\" ladder.
start_session() {
  local n="$1" label="$2" mode="$3" sql="$4"
  S_LABEL[$n]="$label"
  printf '%s\n' "$sql" > "$TMPD/$n.sql"
  chmod 644 "$TMPD/$n.sql"
  # ON_ERROR_STOP IS LOAD-BEARING, and the mutation matrix proved it. `-f` feeds
  # statements one at a time and psql CONTINUES past an error by default — so a
  # broken UPDATE inside A's transaction aborted the transaction, the COMMIT
  # rolled it back, and the token AFTER the commit still printed. A's ran-mark
  # went green on a session that did nothing, and the run reported a guard
  # finding. The old single `-c` string aborted the whole thing for free; `-f`
  # has to be told.
  local PSQL="$PGBIN/psql -h $BASE/sock -U postgres -X -q -t -A -v ON_ERROR_STOP=1 -f $TMPD/$n.sql"
  if [ "$mode" = bg ]; then
    su "$USER_NAME" -c "$PSQL" >"$TMPD/$n.out" 2>&1 &
    S_PID[$n]=$!
  else
    su "$USER_NAME" -c "$PSQL" >"$TMPD/$n.out" 2>&1
    S_RC[$n]=$?
    S_OUT[$n]="$(cat "$TMPD/$n.out")"
  fi
}

reap_session() {   # <name> — for backgrounded sessions only
  local n="$1"
  wait "${S_PID[$n]}" 2>/dev/null
  S_RC[$n]=$?
  S_OUT[$n]="$(cat "$TMPD/$n.out")"
}

# A MARK MUST NEVER BE THE OUTCOME IT GATES.
#
# Mutation testing caught this in the first revision of this matrix. B's mark was
# the string REGISTRATION_IMMUTABLE — which is also B's assertion. Deleting the
# immutability protection for real then produced a B that ran perfectly, saved
# happily, printed no such string, and was reported as a DEAD SESSION. Wrong
# diagnosis, right exit code: exactly the failure this file exists to end, rebuilt
# by the fix for it. A mark has to be true when the session ran and the guard held
# AND when the session ran and the guard was gone.
#
# So a mark accepts ALTERNATES. B's is "raised the guard OR saved" — either proves
# it reached the RPC; neither is possible if it never got there.
#
# mark_output <name> <alt> [alt…]      — the session's OWN output contains one of them
# mark_query  <name> <sql> <alt> [alt…] — the session's OWN effect is in the row
# `$*` joins on the FIRST CHARACTER of IFS, not the whole string, so `IFS=" | "`
# rendered `want 'A "B"'` — two alternates looking like one value. Joined by hand.
_mark_join() { local out="" w; for w in "$@"; do out="${out:+$out | }$w"; done; echo "$out"; }
mark_output() { local n="$1"; shift; S_MARK_KIND[$n]=output; S_MARK_WANT[$n]="$(_mark_join "$@")"
  S_MARK_GOT[$n]="(absent)"; S_MARK_OK[$n]=f
  local w; for w in "$@"; do
    case "${S_OUT[$n]}" in *"$w"*) S_MARK_GOT[$n]="$w"; S_MARK_OK[$n]=t; return;; esac
  done; }
mark_query()  { local n="$1" q="$2"; shift 2; S_MARK_KIND[$n]=query; S_MARK_WANT[$n]="$(_mark_join "$@")"
  read_into "mark for ${S_LABEL[$n]}" "$q"; S_MARK_GOT[$n]="$READ_VAL"; S_MARK_OK[$n]=f
  local w; for w in "$@"; do [ "${S_MARK_GOT[$n]}" = "$w" ] && { S_MARK_OK[$n]=t; return; }; done; }

# A VERIFICATION READ IS A SESSION TOO, AND IT WAS THE LAST PLACE THIS HID.
#
# `final`, `race` and every mark_query send stderr to /dev/null and drop rc. A
# review broke one column name in each, left all four sessions healthy, and got
# "D2 CONCURRENCY PROOF FAILED — this is a real guard/lock finding" and "a
# concurrent first save destroyed reviewed copy" — the exact shape the last five
# rounds chased, relocated from the sessions to the reads that judge them, and now
# stated with MORE confidence because the marks vouch for the sessions.
#
# So a read that fails is INCONCLUSIVE, never a finding, and it says what broke.
# IT SETS A GLOBAL AND IS NEVER CALLED IN $( ). That is not style — the first
# draft of this repair WAS `final=$(read_or_die …)`, and `exit` inside a command
# substitution ends the SUBSHELL, not the script: a failed read would have set
# `final` to empty and the run would have carried on to print the very
# guard-finding this exists to stop. Measured before it shipped. psql exits 1 on a
# bad column with or without ON_ERROR_STOP, so rc is the discriminator here.
READ_VAL=""
read_into() {   # <label> <sql>  → sets READ_VAL, or exits 1 as INCONCLUSIVE
  local label="$1" sql="$2" out rc
  out="$(psql_as -c "\"$sql\"" 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "  !! INCONCLUSIVE — the verification read '$label' failed (rc=$rc)."
    echo "     This is the READ, not the guard. Every assertion that consumes it"
    echo "     would otherwise read exactly like the defect under test."
    printf '%s\n' "$out" | sed 's/^/       /' | head -10
    exit 1
  fi
  READ_VAL="$(printf '%s' "$out" | tr -d ' ')"
}

# Every registered session must prove it ran BEFORE any outcome is judged.
# Prints the session's real output, which is what actually names the cause.
require_ran() {
  local n
  for n in "$@"; do
    if [ "${S_MARK_OK[$n]}" != t ]; then
      echo "  !! INCONCLUSIVE — session ${S_LABEL[$n]} did not do its work."
      echo "     ran-mark (${S_MARK_KIND[$n]}): got '${S_MARK_GOT[$n]}'  want '${S_MARK_WANT[$n]}'   rc=${S_RC[$n]}"
      echo "     Every assertion below describes state this session was supposed to create,"
      echo "     so a dead session reads exactly like the defect being tested. It is NOT that."
      echo "     Its own output was:"
      printf '%s\n' "${S_OUT[$n]:-(no output)}" | sed 's/^/       /' | head -20
      exit 1
    fi
  done
}

report_session() {   # one uniform status line per session
  local n
  for n in "$@"; do
    printf "    %-34s rc=%-3s mark=%s\n" "session ${S_LABEL[$n]} ran" "${S_RC[$n]}" "${S_MARK_GOT[$n]}"
  done
}

TEN="ee000000-0000-4000-8000-0000000000e1"
USR="ee000000-0000-4000-8000-0000000000e2"

# ── committed fixture: both sessions must see the same rows ──────────────────
psql_as -v ON_ERROR_STOP=1 -c "\"
  insert into auth.users (id, aud, role, email)
    values ('$USR','authenticated','authenticated','a2p-conc@t') on conflict do nothing;
  insert into public.tenants (id, slug, name, account_number_prefix, account_number)
    values ('$TEN','a2p-conc','A2P Concurrency','A2X','910099') on conflict do nothing;
  insert into public.tenant_members (tenant_id,user_id,status,role)
    values ('$TEN','$USR','active','owner') on conflict do nothing;
  insert into public.user_roles (user_id,role) values ('$USR','admin') on conflict do nothing;
  insert into public.tenant_legal_profile (tenant_id, legal_business_name)
    values ('$TEN','Concurrency Fixture LLC') on conflict do nothing;
  insert into public.tenant_a2p_registrations (tenant_id, use_case, campaign_description, sample_messages, status)
    values ('$TEN','before','Before the approver ran.','[\\\"a\\\",\\\"b\\\"]'::jsonb,'pending')
    on conflict (tenant_id) do update set status='pending', use_case='before',
      approved_at=null, submitted_at=null, brand_sid=null, campaign_sid=null;
\"" >/dev/null 2>&1 || { echo "!! concurrency fixture failed"; exit 1; }

# ── D2: A takes the row lock, holds it, approves, commits ────────────────────
start_session A "A (approver)" bg "
  begin;
  select 1 from public.tenant_a2p_registrations where tenant_id='$TEN' for update;
  select pg_sleep($HOLD_SECONDS);
  update public.tenant_a2p_registrations
     set status='approved', approved_at=now(), brand_sid='BN-CONC-LIVE', use_case='APPROVED COPY'
   where tenant_id='$TEN';
  commit;
  select 'A-COMMITTED';
"
sleep "$LAUNCH_GAP"

B_START=$(date +%s%N)
start_session B "B (racing draft save)" fg "
  begin;
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','$USR','role','authenticated')::text, true);
  select public.tenant_a2p_registration_save_draft('re-draft','Should never land.','[\"x\",\"y\"]'::jsonb, null, null);
  commit;
"
B_END=$(date +%s%N)
reap_session A
B_MS=$(( (B_END - B_START) / 1000000 ))

# A's mark is a token it prints AFTER its own COMMIT. psql sends this -c string as
# one message, so an error anywhere in it aborts the rest — the token appears if
# and only if the lock, the update and the commit all succeeded. It is deliberately
# NOT a read of brand_sid: that column is also in the assertion below.
#
# B's mark is an ALTERNATION, and that is the point. B exits 1 when healthy (the
# guard raises), so rc can never be its discriminator — a missing RPC exits 1 too.
# But "raised the guard" alone cannot be the mark either, because the guard being
# GONE is the defect under test. Either outcome proves B reached the RPC; a B that
# never got there produces neither.
mark_output A "A-COMMITTED"
mark_output B "REGISTRATION_IMMUTABLE" '"prepared"'

blocked=f; [ "$B_MS" -ge $(( (HOLD_SECONDS - 1) * 1000 )) ] && blocked=t
refused=f; case "${S_OUT[B]}" in *REGISTRATION_IMMUTABLE*) refused=t;; esac
read_into "D2 final row" "select status||'/'||coalesce(use_case,'')||'/'||coalesce(brand_sid,'') from public.tenant_a2p_registrations where tenant_id='$TEN'"
final="$READ_VAL"

psql_as -c "\"delete from public.tenant_a2p_registrations where tenant_id='$TEN';
             delete from public.tenant_legal_profile where tenant_id='$TEN';
             delete from public.user_roles where user_id='$USR';
             delete from public.tenant_members where tenant_id='$TEN';
             delete from public.tenants where id='$TEN';
             delete from auth.users where id='$USR';\"" >/dev/null 2>&1

echo
echo "  D2 CONCURRENCY (two real sessions)"
report_session A B
echo "    B contended for the row ............. $blocked   want t  (waited ${B_MS}ms, A held ${HOLD_SECONDS}s)"
echo "    B refused the approved row .......... $refused   want t  (REGISTRATION_IMMUTABLE)"
echo "    approved row survived intact ........ $final   want approved/APPROVEDCOPY/BN-CONC-LIVE"

# Both sessions before either outcome. A dead session reads exactly like the
# defect each of these assertions exists to catch, so the ran-marks are judged
# first and their failure is INCONCLUSIVE, never a guard finding.
require_ran A B
[ "$blocked" = t ] && [ "$refused" = t ] && [ "$final" = "approved/APPROVEDCOPY/BN-CONC-LIVE" ] || {
  echo "  !! D2 CONCURRENCY PROOF FAILED — both sessions did their own work (see marks above),"
  echo "     so this is a real guard/lock finding."
  echo "     blocked=$blocked  refused=$refused  final=$final"; exit 1; }

# =============================================================================
# D3 — THE FIRST SAVE, RACED.
#
# 20261004020000 moved the absent/cleared/replaced merge into procedural code
# reading v_existing, and claimed it ran "against the row we are holding a lock
# on". True once a row exists. FALSE on the very first save: SELECT ... FOR UPDATE
# on ZERO rows takes no lock, so two concurrent first saves both resolve "absent"
# against an empty v_existing, and the loser's ON CONFLICT DO UPDATE writes its
# NULLs over the winner's committed values — reporting {"ok": true}.
#
# 20261004030000 takes a transaction-scoped advisory lock keyed on the tenant,
# which exists whether or not the row does. This proves it: T2 mentions none of
# the optional fields, so with the lock it must WAIT, see T1's committed row, and
# preserve. Without it, T1's compliance copy is silently destroyed.
#
# T1's ran-mark CANNOT be a row read. Under the defect this case exists to catch,
# T2 overwrites every column T1 wrote — use_case, samples and the four optional
# fields alike — so a clobbered T1 and an absent T1 leave byte-identical rows.
# Its mark is therefore its OWN returned payload, which is true if and only if
# its RPC ran, whatever happened to the row afterwards.
# =============================================================================
TEN2="ff000000-0000-4000-8000-0000000000f1"
USR2="ff000000-0000-4000-8000-0000000000f2"

psql_as -v ON_ERROR_STOP=1 -c "\"
  insert into auth.users (id, aud, role, email)
    values ('$USR2','authenticated','authenticated','a2p-race@t') on conflict do nothing;
  insert into public.tenants (id, slug, name, account_number_prefix, account_number)
    values ('$TEN2','a2p-race','A2P Race','A2R','910098') on conflict do nothing;
  insert into public.tenant_members (tenant_id,user_id,status,role)
    values ('$TEN2','$USR2','active','owner') on conflict do nothing;
  insert into public.user_roles (user_id,role) values ('$USR2','admin') on conflict do nothing;
  insert into public.tenant_legal_profile (tenant_id, legal_business_name)
    values ('$TEN2','Race Fixture LLC') on conflict do nothing;
  delete from public.tenant_a2p_registrations where tenant_id = '$TEN2';
\"" >/dev/null 2>&1 || { echo "!! race fixture failed"; exit 1; }

# T1: the FIRST save, carrying every optional field, holding its transaction open.
start_session T1 "T1 (first writer)" bg "
  begin;
  select set_config('role','authenticated',true);
  select set_config('request.jwt.claims', json_build_object('sub','$USR2','role','authenticated')::text, true);
  select public.tenant_a2p_registration_save_draft('race one','First writer.','[\"a\",\"b\"]'::jsonb,
           'FLOW ONE', null, 'OPTIN ONE', 'STOP ONE', 'HELP ONE');
  select pg_sleep($HOLD_SECONDS);
  commit;
"
sleep "$LAUNCH_GAP"

# T2: a concurrent first save that mentions NO optional field. Absent must PRESERVE.
start_session T2 "T2 (racing first save)" fg "
  begin;
  select set_config('role','authenticated',true);
  select set_config('request.jwt.claims', json_build_object('sub','$USR2','role','authenticated')::text, true);
  select public.tenant_a2p_registration_save_draft('race two','Second writer.','[\"c\",\"d\"]'::jsonb,
           null, null, null, null, null);
  commit;
"
reap_session T1

read_into "D3 preserved-copy row" "select coalesce(optin_flow,'(null)')||'/'||coalesce(optin_message,'(null)')||'/'||coalesce(optout_message,'(null)')||'/'||coalesce(help_message,'(null)') from public.tenant_a2p_registrations where tenant_id='$TEN2'"
race="$READ_VAL"

# T1's mark is its own payload; T2's is its own values landing LAST, which also
# fixes the order the case depends on. Neither is the assertion below: `race`
# reads only the four columns T1 wrote, and would pass unchanged for a run in
# which T2 never happened at all.
mark_output T1 '"prepared"'
mark_query  T2 "select use_case||'/'||(sample_messages #>> '{0}') from public.tenant_a2p_registrations where tenant_id='$TEN2'" "racetwo/c"

psql_as -c "\"delete from public.tenant_a2p_registrations where tenant_id='$TEN2';
             delete from public.tenant_legal_profile where tenant_id='$TEN2';
             delete from public.user_roles where user_id='$USR2';
             delete from public.tenant_members where tenant_id='$TEN2';
             delete from public.tenants where id='$TEN2';
             delete from auth.users where id='$USR2';\"" >/dev/null 2>&1

echo
echo "  D3 FIRST-SAVE RACE (two real sessions, no pre-existing row)"
report_session T1 T2
echo "    T1's optional copy survived T2 ...... $race   want FLOWONE/OPTINONE/STOPONE/HELPONE"

# T1's mark is judged first: a T1 that never ran leaves a row that reads exactly
# like a destroyed copy. T2's mark is BOTH a ran-mark and the ordering check —
# it is absent when T2 did not run, and wrong when the pair raced the other way
# round — so the two causes are separated before either is reported.
require_ran T1
if [ "${S_MARK_OK[T2]}" != t ]; then
  case "${S_OUT[T2]}" in
    *'"prepared"'*)
      echo "  !! D3 INCONCLUSIVE (ORDERING SKEW) — both sessions ran, but T2's values are not the"
      echo "     last ones in the row (mark=${S_MARK_GOT[T2]}). They raced the other way round: T2"
      echo "     reached the lock first and T1 overwrote it, so the preservation this case exists"
      echo "     to measure never happened. It is not a lock defect, and it is not a dead session."
      echo "     The knob is LAUNCH_GAP (${LAUNCH_GAP}s), which decides who reaches the lock first."
      echo "     HOLD_SECONDS governs only how long the winner then holds it and cannot change the"
      echo "     order. Raise LAUNCH_GAP if this recurs."; exit 1;;
    *) require_ran T2;;
  esac
fi
[ "$race" = "FLOWONE/OPTINONE/STOPONE/HELPONE" ] || {
  echo "  !! D3 FIRST-SAVE RACE FAILED — both sessions did their own work in the right order"
  echo "     (see marks above), and a concurrent first save still destroyed reviewed copy."; exit 1; }

echo "  D2 + D3 concurrency proofs PASSED"
