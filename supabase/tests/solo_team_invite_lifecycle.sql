-- An invitation says what happened to it, and can be cleared when it is finished.
--
-- Behavioural proof against the APPLIED schema. `supabase db reset` replays every migration from
-- zero, so these assertions run against 20261105000000 as the pipeline actually applies it — not
-- against objects created inside the test and discarded with it. Synthetic fixtures, always rolled
-- back, no production data.
--
-- THE PART MOST WORTH PROVING is not the archive RPC. It is that widening a CHECK constraint on a
-- table with eight writers did not quietly drop a value one of them still writes. A migration that
-- re-adds a constraint is the one moment that can happen, and it would fail silently until some
-- unrelated function tried to log a bounce.
BEGIN;

-- 40 = 7 surviving statuses + 4 new + 1 constraint control + 4 ranking + 1 live-refusal
-- + 3 archives + 3 survival + 4 refusals + 4 grants + 4 roster + 2 delivery + 1 cross-tenant
-- + 2 out-of-order arrival.
SELECT plan(40);

-- ── The shared constraint: every OLD value survives ─────────────────────────────────────────────
-- Asserted one at a time rather than by comparing the whole definition, so a failure names the
-- exact status that was lost instead of printing two long strings and leaving the reader to diff.
SELECT lives_ok(
  format($$INSERT INTO public.email_send_log (template_name, recipient_email, status) VALUES ('t','p@tests.invalid','%s')$$, s),
  format('the pre-existing status %L is still accepted after the widening', s)
) FROM unnest(ARRAY['pending','sent','suppressed','failed','bounced','complained','dlq']) AS s;

SELECT lives_ok(
  format($$INSERT INTO public.email_send_log (template_name, recipient_email, status) VALUES ('t','p@tests.invalid','%s')$$, s),
  format('the new status %L is accepted', s)
) FROM unnest(ARRAY['delivered','delivery_delayed','opened','clicked']) AS s;

-- The control on the control. If the CHECK were dropped and never re-added, every assertion above
-- would pass for the wrong reason — an unconstrained column accepts anything.
SELECT throws_ok(
  $$INSERT INTO public.email_send_log (template_name, recipient_email, status) VALUES ('t','p@tests.invalid','not_a_real_status')$$,
  '23514',
  NULL,
  'the constraint still REFUSES an invented status — so the eleven assertions above measure a real constraint, not a missing one'
);

-- ── Ordering: the headline status is the furthest through the journey ───────────────────────────
SELECT ok(public.email_delivery_rank('delivered') > public.email_delivery_rank('sent'),
  'delivered outranks sent, so a late-arriving sent event cannot read as the headline');
SELECT ok(public.email_delivery_rank('clicked') > public.email_delivery_rank('opened'),
  'clicked outranks opened');
SELECT ok(public.email_delivery_rank('bounced') > public.email_delivery_rank('clicked'),
  'a bounce outranks every happy-path status — it is the most important thing to say about an email');
SELECT is(public.email_delivery_rank('nonsense'), -1,
  'an unknown status ranks below everything rather than sorting to the top');

-- ── Fixtures ────────────────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, aud, role, email) VALUES
  ('f1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'inv-owner@tests.invalid'),
  ('f1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'inv-admin@tests.invalid'),
  ('f1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'inv-member@tests.invalid'),
  ('f1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'inv-outsider@tests.invalid');

INSERT INTO public.tenants (id, slug, name, status, account_type, account_number_prefix, account_number, features) VALUES
  ('f1000000-0000-0000-0000-00000000aaaa', 'invite-lifecycle-a', 'Invite Lifecycle A', 'active', 'standalone', 'ILA', 9330001, '{}'::jsonb),
  ('f1000000-0000-0000-0000-00000000bbbb', 'invite-lifecycle-b', 'Invite Lifecycle B', 'active', 'standalone', 'ILB', 9330002, '{}'::jsonb);

INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at) VALUES
  ('f1000000-0000-0000-0000-00000000aaaa', 'f1000000-0000-0000-0000-000000000001', 'owner',  'active', true,  now() - interval '10 days'),
  ('f1000000-0000-0000-0000-00000000aaaa', 'f1000000-0000-0000-0000-000000000002', 'admin',  'active', false, now() - interval '9 days'),
  ('f1000000-0000-0000-0000-00000000aaaa', 'f1000000-0000-0000-0000-000000000003', 'member', 'active', false, now() - interval '8 days'),
  ('f1000000-0000-0000-0000-00000000bbbb', 'f1000000-0000-0000-0000-000000000004', 'owner',  'active', true,  now() - interval '7 days');

-- ON CONFLICT, not a plain INSERT: the `auth.users` insert above fires the profile-creation
-- trigger, so every row already exists by the time this runs. The membership rows are inserted
-- FIRST on purpose — `guard_active_tenant_membership()` fires on UPDATE of `profiles` and demands
-- an active membership in the workspace being pointed at, and this statement is an UPDATE.
INSERT INTO public.profiles (user_id, active_tenant_id) VALUES
  ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-00000000aaaa'),
  ('f1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-00000000aaaa'),
  ('f1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-00000000aaaa'),
  ('f1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-00000000bbbb')
ON CONFLICT (user_id) DO UPDATE SET active_tenant_id = EXCLUDED.active_tenant_id;

-- One live invitation, one revoked, one expired, one accepted.
INSERT INTO public.tenant_invite_tokens (id, tenant_id, token, kind, default_role, email, expires_at, uses, revoked_at) VALUES
  ('f1000000-0000-0000-0000-0000000000a1', 'f1000000-0000-0000-0000-00000000aaaa', 'tok-live',     'team', 'admin',  'live@tests.invalid',     now() + interval '7 days', 0, NULL),
  ('f1000000-0000-0000-0000-0000000000a2', 'f1000000-0000-0000-0000-00000000aaaa', 'tok-revoked',  'team', 'admin',  'revoked@tests.invalid',  now() + interval '7 days', 0, now() - interval '1 day'),
  ('f1000000-0000-0000-0000-0000000000a3', 'f1000000-0000-0000-0000-00000000aaaa', 'tok-expired',  'team', 'member', 'expired@tests.invalid',  now() - interval '1 day',  0, NULL),
  ('f1000000-0000-0000-0000-0000000000a4', 'f1000000-0000-0000-0000-00000000aaaa', 'tok-accepted', 'team', 'member', 'accepted@tests.invalid', now() + interval '7 days', 1, NULL);

-- ── Archive authority ───────────────────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$SELECT public.archive_solo_team_invite('f1000000-0000-0000-0000-000000000001'::uuid, 'f1000000-0000-0000-0000-00000000aaaa'::uuid, 'f1000000-0000-0000-0000-0000000000a1'::uuid)$$,
  'P0001',
  'that invitation is still live; revoke it before clearing it',
  'a LIVE invitation cannot be cleared from the list — hiding a working access grant is the opposite of the point'
);

SELECT lives_ok(
  $$SELECT public.archive_solo_team_invite('f1000000-0000-0000-0000-000000000001'::uuid, 'f1000000-0000-0000-0000-00000000aaaa'::uuid, 'f1000000-0000-0000-0000-0000000000a2'::uuid)$$,
  'the owner can clear a REVOKED invitation'
);
SELECT lives_ok(
  $$SELECT public.archive_solo_team_invite('f1000000-0000-0000-0000-000000000001'::uuid, 'f1000000-0000-0000-0000-00000000aaaa'::uuid, 'f1000000-0000-0000-0000-0000000000a3'::uuid)$$,
  'the owner can clear an EXPIRED invitation'
);
SELECT lives_ok(
  $$SELECT public.archive_solo_team_invite('f1000000-0000-0000-0000-000000000002'::uuid, 'f1000000-0000-0000-0000-00000000aaaa'::uuid, 'f1000000-0000-0000-0000-0000000000a4'::uuid)$$,
  'an ADMIN can clear an accepted invitation — the same authority that may invite may tidy up'
);

-- THE ROW SURVIVES. This is the whole reason it is an archive and not a delete.
SELECT is(
  (SELECT count(*)::int FROM public.tenant_invite_tokens WHERE id = 'f1000000-0000-0000-0000-0000000000a2'),
  1,
  'a cleared invitation is still on the table — the evidence that access was withdrawn is not destroyed'
);
SELECT isnt(
  (SELECT archived_at FROM public.tenant_invite_tokens WHERE id = 'f1000000-0000-0000-0000-0000000000a2'),
  NULL,
  'and it is marked archived rather than altered in any other way'
);
SELECT isnt(
  (SELECT revoked_at FROM public.tenant_invite_tokens WHERE id = 'f1000000-0000-0000-0000-0000000000a2'),
  NULL,
  'clearing it did not erase the fact that it was revoked'
);

-- ── Refusals ────────────────────────────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$SELECT public.archive_solo_team_invite('f1000000-0000-0000-0000-000000000003'::uuid, 'f1000000-0000-0000-0000-00000000aaaa'::uuid, 'f1000000-0000-0000-0000-0000000000a1'::uuid)$$,
  '42501',
  NULL,
  'a MEMBER cannot clear an invitation'
);
SELECT throws_ok(
  $$SELECT public.archive_solo_team_invite('f1000000-0000-0000-0000-000000000004'::uuid, 'f1000000-0000-0000-0000-00000000aaaa'::uuid, 'f1000000-0000-0000-0000-0000000000a1'::uuid)$$,
  '42501',
  NULL,
  'an OUTSIDER who owns another workspace cannot clear this one''s invitation'
);
SELECT throws_ok(
  $$SELECT public.archive_solo_team_invite('f1000000-0000-0000-0000-000000000001'::uuid, 'f1000000-0000-0000-0000-00000000bbbb'::uuid, 'f1000000-0000-0000-0000-0000000000a1'::uuid)$$,
  '42501',
  NULL,
  'naming a workspace the actor does not manage is refused — the expected-workspace guard from #827 still binds'
);
-- Cross-tenant reach, the §9 case: a real owner of A naming A, but pointing at B's invitation.
INSERT INTO public.tenant_invite_tokens (id, tenant_id, token, kind, default_role, email, expires_at, uses, revoked_at) VALUES
  ('f1000000-0000-0000-0000-0000000000b1', 'f1000000-0000-0000-0000-00000000bbbb', 'tok-other', 'team', 'admin', 'other@tests.invalid', now() + interval '7 days', 0, now());
SELECT throws_ok(
  $$SELECT public.archive_solo_team_invite('f1000000-0000-0000-0000-000000000001'::uuid, 'f1000000-0000-0000-0000-00000000aaaa'::uuid, 'f1000000-0000-0000-0000-0000000000b1'::uuid)$$,
  'P0001',
  'that invitation is not on this workspace',
  'an owner of A cannot clear an invitation belonging to B, even while correctly naming A'
);

-- ── Grants: the browser never calls this directly ───────────────────────────────────────────────
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.archive_solo_team_invite(uuid,uuid,uuid)', 'EXECUTE'),
  'authenticated cannot EXECUTE the archive function — it takes an actor parameter, so a browser caller could name somebody else'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.archive_solo_team_invite(uuid,uuid,uuid)', 'EXECUTE'),
  'anon cannot EXECUTE it either'
);
SELECT ok(
  has_function_privilege('service_role', 'public.archive_solo_team_invite(uuid,uuid,uuid)', 'EXECUTE'),
  'service_role can — the edge function authenticates the caller and passes the actor it verified'
);
-- The control: prove those three assertions can distinguish granted from not-granted.
SELECT ok(
  has_function_privilege('authenticated', 'public.get_solo_team_workspace(text,text,integer,integer)', 'EXECUTE'),
  'a function that IS granted to authenticated still reads as granted — so the refusals above are measuring something'
);

-- ── The roster read hides what was cleared ──────────────────────────────────────────────────────
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"f1000000-0000-0000-0000-000000000001","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM jsonb_array_elements(
     (public.get_solo_team_workspace(NULL, 'all', 25, 0))->'invitations')),
  1,
  'the roster now lists ONE invitation — the live one; the three that were cleared are gone from the operator''s view'
);
SELECT is(
  (SELECT elem->>'email' FROM jsonb_array_elements(
     (public.get_solo_team_workspace(NULL, 'all', 25, 0))->'invitations') AS elem LIMIT 1),
  'live@tests.invalid',
  'and the one still listed is the live invitation'
);
SELECT ok(
  (SELECT (public.get_solo_team_workspace(NULL, 'all', 25, 0))->'invitations'->0 ? 'delivery'),
  'every invitation carries a delivery field, so the screen never has to guess whether the key exists'
);
SELECT is(
  (SELECT (public.get_solo_team_workspace(NULL, 'all', 25, 0))->'invitations'->0->>'delivery'),
  NULL,
  'an invitation with no send recorded reports NULL delivery — an honest absence, not a fabricated "sent"'
);

RESET role;

-- ── Delivery is reported, and the latest event wins ─────────────────────────────────────────────
INSERT INTO public.email_send_log (template_name, recipient_email, message_id, status, tenant_id, metadata) VALUES
  ('team_invite', 'live@tests.invalid', 'msg-live', 'sent',      'f1000000-0000-0000-0000-00000000aaaa', '{"invite_id":"f1000000-0000-0000-0000-0000000000a1"}'::jsonb),
  ('team_invite', 'live@tests.invalid', 'msg-live', 'delivered', 'f1000000-0000-0000-0000-00000000aaaa', '{"invite_id":"f1000000-0000-0000-0000-0000000000a1"}'::jsonb),
  ('team_invite', 'live@tests.invalid', 'msg-live', 'opened',    'f1000000-0000-0000-0000-00000000aaaa', '{"invite_id":"f1000000-0000-0000-0000-0000000000a1"}'::jsonb);

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"f1000000-0000-0000-0000-000000000001","role":"authenticated"}';

SELECT is(
  (SELECT (public.get_solo_team_workspace(NULL, 'all', 25, 0))->'invitations'->0->'delivery'->>'status'),
  'opened',
  'the headline status is the furthest the email actually got'
);
SELECT is(
  (SELECT jsonb_array_length((public.get_solo_team_workspace(NULL, 'all', 25, 0))->'invitations'->0->'delivery'->'history')),
  3,
  'and the full timeline is carried, so the screen can show when it was sent AND when it arrived'
);

RESET role;

-- ── Events do not arrive in order, and the headline must not walk backwards ─────────────────────
-- Found by an independent review of the MERGED diff (§39). The LATERAL used to sort by
-- `created_at DESC` with rank as a mere tiebreak, so a provider RETRY of an earlier stage — which
-- lands with the newest insert time — dragged the headline backwards. `created_at` is our own
-- insert time, not the provider's event time, so it was never the right clock to arbitrate by.
INSERT INTO public.email_send_log (template_name, recipient_email, message_id, status, tenant_id, metadata) VALUES
  ('team_invite', 'live@tests.invalid', 'msg-live', 'delivered', 'f1000000-0000-0000-0000-00000000aaaa', '{"invite_id":"f1000000-0000-0000-0000-0000000000a1","via":"retry"}'::jsonb);

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"f1000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT is(
  (SELECT (public.get_solo_team_workspace(NULL, 'all', 25, 0))->'invitations'->0->'delivery'->>'status'),
  'opened',
  'a RETRIED delivered event arriving after opened does not walk the headline backwards'
);
SELECT is(
  (SELECT jsonb_array_length((public.get_solo_team_workspace(NULL, 'all', 25, 0))->'invitations'->0->'delivery'->'history')),
  4,
  'and the retry is still kept in the timeline — the history records what happened, the headline judges it'
);
RESET role;

-- The §9 assertion this whole design turns on: the delivery join must not leak another workspace.
INSERT INTO public.email_send_log (template_name, recipient_email, message_id, status, tenant_id, metadata) VALUES
  ('team_invite', 'other@tests.invalid', 'msg-other', 'clicked', 'f1000000-0000-0000-0000-00000000bbbb', '{"invite_id":"f1000000-0000-0000-0000-0000000000b1"}'::jsonb);

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"f1000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM jsonb_array_elements(
     (public.get_solo_team_workspace(NULL, 'all', 25, 0))->'invitations') AS e
   WHERE e->>'email' = 'other@tests.invalid'),
  0,
  'workspace B''s invitation — which now has a delivery event of its own — is not visible to workspace A'
);
RESET role;

SELECT * FROM finish();
ROLLBACK;
