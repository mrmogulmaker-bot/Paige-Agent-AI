-- ============================================================================
-- P1c Wave 2 · Slice E — §32 behavioral regression test (VERIFY-ONLY).
--
-- Owner ruling (2026-08-03): Slice E is CLOSED-BY-EXISTING-DESIGN. A §30
-- ground-truth diagnosis found the target security property — "an agency cannot
-- SILENTLY DELETE a sub-account's Paige chat threads" — is ALREADY enforced by
-- the live RLS on public.paige_chat_threads, so NO migration is shipped. This
-- test PROVES the property and guards it against regression.
--
-- Why it holds (live RLS, verified 2026-08-03 via pg_policies):
--   * DELETE  policy threads_delete_owner_or_platform:
--             (caller_user_id = auth.uid()) OR is_platform_owner()
--   * UPDATE  policy threads_update_self (the soft-archive path):
--             (caller_user_id = auth.uid())
--   * RESTRICTIVE threads_tenant_isolation caps every op to
--             is_platform_owner() OR tenant_id = current_user_tenant_id()
-- An agency reaches a sub-account ONLY by context-switching INTO it
-- (agency_enter_subaccount → active_tenant_id = child, admin-as-membership #607).
-- Even seated there, both write paths key on caller_user_id = auth.uid(), so a
-- non-platform-owner agency admin can delete/archive ONLY threads THEY created —
-- never the sub-account principal's. No SECURITY DEFINER function bypasses this
-- (the only definer writer, paige_chat_turn_append, just bumps last_message_at).
--
-- The test simulates the exact principal an "agency admin seated in a sub-account"
-- IS at the RLS layer: a non-platform-owner authenticated user scoped into the
-- child tenant. Synthetic fixtures only; self-contained; rolls back.
--
-- Run: psql "$DB_URL" -1 -f supabase/tests/slice_e_agency_thread_delete_block.sql
-- (or via the ephemeral-clone pre-merge harness once #222 lands). Terminal row
-- 'SLICE_E_RLS_BLOCK_PROVEN' = pass; any RAISE = fail.
-- ============================================================================
BEGIN;

INSERT INTO auth.users (id, aud, role, email) VALUES
  ('91e00000-0000-0000-0000-0000000000a1','authenticated','authenticated','slicee-agency-admin@example.invalid'),
  ('91e00000-0000-0000-0000-0000000000b1','authenticated','authenticated','slicee-principal@example.invalid');

INSERT INTO public.tenants (id, slug, name, status, account_type, account_number_prefix, features) VALUES
  ('91e00000-0000-0000-0000-00000000aaaa','slicee-agency','Slice E Agency','active','agency','SEA','{}'::jsonb);
INSERT INTO public.tenants (id, slug, name, status, account_type, account_number_prefix, parent_tenant_id, features) VALUES
  ('91e00000-0000-0000-0000-0000000cccc1','slicee-child','Slice E Child','active','standalone','SEC','91e00000-0000-0000-0000-00000000aaaa','{}'::jsonb);

INSERT INTO public.profiles (user_id, active_tenant_id) VALUES
  ('91e00000-0000-0000-0000-0000000000a1','91e00000-0000-0000-0000-0000000cccc1'),
  ('91e00000-0000-0000-0000-0000000000b1','91e00000-0000-0000-0000-0000000cccc1');

-- Agency admin seated in the child (admin-as-membership, #607); principal owns the child.
INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at) VALUES
  ('91e00000-0000-0000-0000-0000000cccc1','91e00000-0000-0000-0000-0000000000a1','admin','active',false, now()),
  ('91e00000-0000-0000-0000-0000000cccc1','91e00000-0000-0000-0000-0000000000b1','owner','active',true, now());

-- The principal's private thread in the child.
INSERT INTO public.paige_chat_threads
  (id, caller_user_id, contact_id, tenant_id, lens, title, consent_snapshot, auto_delete_at, last_message_at)
VALUES ('91e00000-0000-0000-0000-00000000dead','91e00000-0000-0000-0000-0000000000b1', NULL,
        '91e00000-0000-0000-0000-0000000cccc1','coach','principal private thread','{}'::jsonb,
        now()+interval '90 days', now());

DO $t$
DECLARE _n int;
BEGIN
  -- Become the non-platform-owner agency admin, scoped into the child.
  PERFORM set_config('role','authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"91e00000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

  IF public.is_platform_owner() THEN
    RAISE EXCEPTION 'SETUP_FAIL: synthetic admin resolves as platform owner (confound)';
  END IF;
  IF public.current_user_tenant_id() <> '91e00000-0000-0000-0000-0000000cccc1' THEN
    RAISE EXCEPTION 'SETUP_FAIL: admin not scoped into child (got %)', public.current_user_tenant_id();
  END IF;

  -- NEGATIVE 1 — cannot HARD-DELETE the principal's thread (RLS silently filters → 0 rows).
  DELETE FROM public.paige_chat_threads WHERE id='91e00000-0000-0000-0000-00000000dead';
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL_DELETE: agency-seated admin deleted the principal thread (% rows)', _n; END IF;

  -- NEGATIVE 2 — cannot SILENTLY ARCHIVE (soft-delete via UPDATE) the principal's thread.
  UPDATE public.paige_chat_threads SET is_archived=true WHERE id='91e00000-0000-0000-0000-00000000dead';
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL_ARCHIVE: agency-seated admin archived the principal thread (% rows)', _n; END IF;

  -- POSITIVE control — the principal CAN delete their OWN thread (RLS allows self; not a blanket denial).
  PERFORM set_config('request.jwt.claims',
    '{"sub":"91e00000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
  DELETE FROM public.paige_chat_threads WHERE id='91e00000-0000-0000-0000-00000000dead';
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL_SELF: principal could not delete their OWN thread (% rows)', _n; END IF;

  PERFORM set_config('role','postgres', true);
END
$t$;

SELECT 'SLICE_E_RLS_BLOCK_PROVEN' AS proof;
ROLLBACK;
