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
set -uo pipefail
BASE="${1:?usage: a2p-concurrency-proof.sh <cluster-base> <pgbin> <unix-user>}"
PGBIN="${2:?}"; USER_NAME="${3:?}"
HOLD_SECONDS=3

psql_as() { su "$USER_NAME" -c "$PGBIN/psql -h $BASE/sock -U postgres -X -q -t -A $*"; }

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

# ── A: take the row lock, hold it, then approve and commit ───────────────────
su "$USER_NAME" -c "$PGBIN/psql -h $BASE/sock -U postgres -X -q -t -A -c \"
  begin;
  select 1 from public.tenant_a2p_registrations where tenant_id='$TEN' for update;
  select pg_sleep($HOLD_SECONDS);
  update public.tenant_a2p_registrations
     set status='approved', approved_at=now(), brand_sid='BN-CONC-LIVE', use_case='APPROVED COPY'
   where tenant_id='$TEN';
  commit;
\"" >/dev/null 2>&1 &
A_PID=$!

sleep 1   # let A acquire the lock before B starts

# ── B: the draft save, as a tenant admin, while A holds the lock ─────────────
B_START=$(date +%s%N)
B_OUT=$(su "$USER_NAME" -c "$PGBIN/psql -h $BASE/sock -U postgres -X -q -t -A -c \"
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','$USR','role','authenticated')::text, true);
  select public.tenant_a2p_registration_save_draft('re-draft','Should never land.','[\\\"x\\\",\\\"y\\\"]'::jsonb, null, null);
\"" 2>&1)
B_END=$(date +%s%N)
wait "$A_PID" 2>/dev/null
B_MS=$(( (B_END - B_START) / 1000000 ))

blocked=f; [ "$B_MS" -ge $(( (HOLD_SECONDS - 1) * 1000 )) ] && blocked=t
refused=f; echo "$B_OUT" | grep -q "REGISTRATION_IMMUTABLE" && refused=t
final=$(psql_as -c "\"select status||'/'||coalesce(use_case,'')||'/'||coalesce(brand_sid,'') from public.tenant_a2p_registrations where tenant_id='$TEN'\"" 2>/dev/null | tr -d ' ')

echo
echo "  D2 CONCURRENCY (two real sessions)"
echo "    B contended for the row ............. $blocked   want t  (waited ${B_MS}ms, A held ${HOLD_SECONDS}s)"
echo "    B refused the approved row .......... $refused   want t  (REGISTRATION_IMMUTABLE)"
echo "    approved row survived intact ........ $final   want approved/APPROVEDCOPY/BN-CONC-LIVE"

psql_as -c "\"delete from public.tenant_a2p_registrations where tenant_id='$TEN';
             delete from public.tenant_legal_profile where tenant_id='$TEN';
             delete from public.user_roles where user_id='$USR';
             delete from public.tenant_members where tenant_id='$TEN';
             delete from public.tenants where id='$TEN';
             delete from auth.users where id='$USR';\"" >/dev/null 2>&1

[ "$blocked" = t ] && [ "$refused" = t ] && [ "$final" = "approved/APPROVEDCOPY/BN-CONC-LIVE" ] || {
  echo "  !! D2 CONCURRENCY PROOF FAILED"; exit 1; }
echo "  D2 concurrency proof PASSED"
