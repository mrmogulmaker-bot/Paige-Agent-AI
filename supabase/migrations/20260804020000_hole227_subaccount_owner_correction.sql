-- ============================================================================
-- Migration 20260804020000 — #227 sub-account roster correction (Parts B → D → A)
-- + Part F (accept-time born-correct owner + mint/accept shell-gate) + Part C
-- (display-only ancestor-agency-owner roster exclusion resolver).
--
-- CONTEXT. The old buggy create_subaccount baked the AGENCY OWNER into every child
-- sub-account as BOTH tenants.owner_user_id AND a role='owner' tenant_members row.
-- The P1 leak-fix (20260803120000) fixed the CREATION path (children are now born
-- as un-onboarded shells: account_type='sub_account', owner_user_id=NULL, 0 members)
-- but explicitly DEFERRED (P1b) the historical data-correction and the accept-time
-- forward-fix. This migration is that deferred work, framework-level:
--   • Part B  — promote each child's authoritative principal to owner (is_owner +
--               role='owner' in lockstep): the SOLE real (non-parent-owner) member, OR
--               — when >1 candidate — the SOLE owner/admin authority over non-authority
--               staff (§227 GAP-5 role tiebreak). 2+ authorities (or n>1 with none) →
--               skip + ambiguity flag (§32 no-guess). 0 → nothing (HOLE3 handled in A).
--   • Part A  — HOLE3 pre-scan orphan flag, THEN delete the injected parent-owner
--               member from every child roster (#215 admin-access != membership). Runs
--               BEFORE Part D so the delete keys on the PRE-repoint (historically-
--               injected) ancestor identity — closing the multi-level §9 leak (GAP-3).
--   • Part D  — repoint each child's display-only owner_user_id off the injected parent
--               owner onto the child's REAL owner (deterministic; NEVER onto the cleared
--               parent owner — G2). Runs AFTER A so no false-green nest can survive.
--   • Part C  — tenant_roster_excluded_user_ids(): a SECURITY DEFINER resolver that
--               hides an ANCESTOR agency/enterprise owner from a child's staff roster
--               at display time (agency_enter_subaccount re-injects them on Open; P4
--               removes the re-injection at source — until then Part C masks it).
--   • Part F  — create_tenant_invite_token (Layer-1 mint gate) + accept_tenant_invite
--               (Layer-2 shell-gate): a 'subaccount_owner' invite may only be MINTED
--               by the parent agency / platform, and only ESTABLISHES ownership on a
--               shell child with NO active owner AND a still-authorized minter. Every
--               other path lands a plain admin seat (is_owner=false) — closing the
--               admin self-mint→accept escalation vector.
--
-- GUARD EXEMPTION. Two DISTINCT guards apply and they exempt on DIFFERENT signals.
-- (1) trg_tenant_members_owner_guard (tenant_members) keys on current_user: the migration
--     DML (Parts B/A) and Part F's definer bodies all execute as current_user='postgres',
--     which it exempts (20260803190000 block [3], exempt set: postgres/service_role/
--     supabase_admin/supabase_auth_admin). Part A is a DELETE — that guard fires only
--     BEFORE INSERT/UPDATE, so the delete is never gated.
-- (2) trg_guard_tenant_owner_cols (tenants.owner_user_id / billing / hierarchy —
--     guard_tenant_owner_only_columns, 20260708174151) keys on auth.uid(), NOT
--     current_user. Parts D and the migration owner_user_id writes carry auth.uid()=NULL
--     (no JWT during db push) → exempt. BUT accept_tenant_invite (Part F.2) runs under the
--     REAL invitee JWT, so auth.uid()=invitee there, and its born-correct owner_user_id
--     write on the shell child would be REJECTED ("Only the platform owner may change
--     tenant ownership…") — aborting the whole accept and rolling back the owner member
--     insert. Part F.0 re-emits that guard with a TIGHTLY-SCOPED, tenant_members-consistent
--     shell-establishment carve-out so the born-correct owner can be set; see F.0.
--
-- GENERIC / FRAMEWORK-LEVEL (§213.e). Every predicate below is generic — a child is
-- `parent_tenant_id IS NOT NULL AND parent.account_type IN ('agency','enterprise')`.
-- ZERO tenant/user/email literals. Re-runnable & idempotent: each mutating CTE carries
-- a change-guard so a second run mutates nothing and writes zero new audit rows.
--
-- Project xygzykjyynhzqytbqnzu. Discipline §1/§9/§13/§18/§32/§37/§51. Refs #227/#215/#212.
-- Run order (single migration, top→bottom): B → A → D → Part C → Part F.
-- ============================================================================

-- ============================================================================
-- PART B — BACKFILL: promote the sole real principal to authoritative owner.
-- ============================================================================

-- B.1 — promote the child's authoritative principal + append-only audit per ACTUAL
-- promotion. Two promotable shapes (still §32 no-guess — we never pick between two
-- real authorities):
--   (i)  exactly ONE real candidate (n = 1) — the sole principal; OR
--   (ii) MORE than one candidate but exactly ONE of them carries an AUTHORITY role
--        (owner/admin) while the rest are non-authority staff (coach/member) — the
--        common "owner + a coach/staffer" shape. That sole authority is the owner
--        (§227 GAP-5 role tiebreak). 2+ authority candidates, or n>1 with ZERO
--        authority candidate, remain genuinely ambiguous → B.2 queues them.
WITH child AS (
  SELECT c.id AS child_id, parent.owner_user_id AS parent_owner
    FROM public.tenants c
    JOIN public.tenants parent ON parent.id = c.parent_tenant_id
   WHERE c.parent_tenant_id IS NOT NULL
     AND parent.account_type IN ('agency','enterprise')
),
candidates AS (               -- active members that are NOT the injected parent owner
  SELECT ch.child_id, tm.user_id, tm.role
    FROM child ch
    JOIN public.tenant_members tm
      ON tm.tenant_id = ch.child_id
     AND tm.status = 'active'
     AND tm.user_id IS DISTINCT FROM ch.parent_owner
),
counted AS (
  SELECT child_id,
         count(*) AS n,
         count(*) FILTER (WHERE role IN ('owner'::public.tenant_role,
                                         'admin'::public.tenant_role)) AS authority_n,
         -- uuid has NO min() aggregate on PG 17 ("function min(uuid) does not exist");
         -- take the first value by btree order instead (safe ONLY when n = 1). Mirrors
         -- the ORDER BY … LIMIT 1 idiom in 20260712260000_booking_rail_emit.sql:109.
         (array_agg(user_id ORDER BY user_id))[1] AS only_user,
         -- the sole AUTHORITY candidate (well-defined ONLY when authority_n = 1).
         (array_agg(user_id ORDER BY user_id)
            FILTER (WHERE role IN ('owner'::public.tenant_role,
                                   'admin'::public.tenant_role)))[1] AS sole_authority_user
    FROM candidates GROUP BY child_id
),
promote AS (
  SELECT child_id, only_user AS user_id
    FROM counted WHERE n = 1                                   -- (i) sole real principal
  UNION ALL
  SELECT child_id, sole_authority_user AS user_id
    FROM counted WHERE n > 1 AND authority_n = 1               -- (ii) owner+staff tiebreak
),
did_promote AS (
  UPDATE public.tenant_members tm
     SET is_owner   = true,
         role       = 'owner'::public.tenant_role,   -- lockstep with is_owner
         updated_at = now()
    FROM promote p
   WHERE tm.tenant_id = p.child_id
     AND tm.user_id   = p.user_id
     AND (tm.is_owner = false OR tm.role <> 'owner'::public.tenant_role)  -- idempotent: no-op on re-run
  RETURNING tm.tenant_id, tm.user_id
)
INSERT INTO public.paige_audit_log
  (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
SELECT NULL, 'super_admin', 'tenant:backfill_owner', 'tenant_member', dp.user_id,
       jsonb_build_object('tenant_id', dp.tenant_id, 'lane', 'auto', 'issue', '#227', 'part', 'B'),
       dp.tenant_id
  FROM did_promote dp;

-- B.2 — genuine-ambiguity flag: >1 real candidate with NO single authority to break the
-- tie — i.e. 2+ owner/admin candidates, OR n>1 with ZERO authority candidate. DO NOT
-- guess; skipped + flagged. (n>1 with EXACTLY ONE authority candidate is NOT ambiguous —
-- B.1 (ii) already promoted it.)
WITH child AS (
  SELECT c.id AS child_id, parent.owner_user_id AS parent_owner
    FROM public.tenants c
    JOIN public.tenants parent ON parent.id = c.parent_tenant_id
   WHERE c.parent_tenant_id IS NOT NULL
     AND parent.account_type IN ('agency','enterprise')
),
candidates AS (
  SELECT ch.child_id, tm.user_id, tm.role
    FROM child ch
    JOIN public.tenant_members tm
      ON tm.tenant_id = ch.child_id
     AND tm.status = 'active'
     AND tm.user_id IS DISTINCT FROM ch.parent_owner
),
counted AS (
  SELECT child_id,
         count(*) AS n,
         count(*) FILTER (WHERE role IN ('owner'::public.tenant_role,
                                         'admin'::public.tenant_role)) AS authority_n
    FROM candidates GROUP BY child_id
),
ambiguous AS (
  SELECT child_id, n, authority_n FROM counted WHERE n > 1 AND authority_n <> 1
)
INSERT INTO public.paige_audit_log
  (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
SELECT NULL, 'super_admin', 'tenant:backfill_owner_ambiguous', 'tenant', a.child_id,
       jsonb_build_object('candidate_count', a.n, 'authority_candidate_count', a.authority_n,
                          'issue', '#227', 'part', 'B', 'resolution', 'skipped_no_guess'),
       a.child_id
  FROM ambiguous a;

-- ============================================================================
-- PART A — remove the injected parent-owner member from every child roster.
-- MUST run BEFORE Part D (§227 GAP-3): A.2 deletes the injected member keyed on the
-- parent's CURRENT owner_user_id. At this point NO parent has been repointed yet, so
-- that value is still the HISTORICALLY-INJECTED ancestor identity — which is exactly
-- the member that was baked into the child. If Part D ran first, an intermediate
-- (enterprise→sub-agency→sub) would already be repointed onto its OWN real owner, and
-- A.2 for the grandchild would then key on that new owner and MISS the originally-
-- injected ancestor — leaving the grandchild with two is_owner rows while a parent-
-- owner-keyed verify falsely reports 0 remaining. Deleting first, pre-repoint, closes
-- that multi-level §9 leak at arbitrary nesting depth. (Single-migration transaction →
-- deleting the member before Part D repoints owner_user_id has no externally-visible
-- transient; the guard fires only BEFORE INSERT/UPDATE, and there is no DELETE-side
-- last-owner trigger on tenant_members — that check lives in revoke_co_owner().)
-- ============================================================================

-- A.1 — HOLE3 pre-scan: a child whose ONLY member was the parent owner will hit 0
-- members after the delete → indistinguishable from a born-empty shell. Flag it
-- BEFORE the delete so the count is truthful (these are exactly the children where
-- Part B found 0 candidates).
INSERT INTO public.paige_audit_log
  (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
SELECT NULL, 'super_admin', 'tenant:orphaned_after_parent_owner_removal', 'tenant', c.id,
       jsonb_build_object('issue', '#227', 'part', 'A',
                          'note', 'only member was the injected parent owner; 0 real members remain'),
       c.id
  FROM public.tenants c
  JOIN public.tenants parent ON parent.id = c.parent_tenant_id
 WHERE c.parent_tenant_id IS NOT NULL
   AND parent.account_type IN ('agency','enterprise')
   AND EXISTS (SELECT 1 FROM public.tenant_members tm
                WHERE tm.tenant_id = c.id AND tm.user_id = parent.owner_user_id)
   AND NOT EXISTS (SELECT 1 FROM public.tenant_members tm         -- no non-parent-owner member
                    WHERE tm.tenant_id = c.id
                      AND tm.user_id IS DISTINCT FROM parent.owner_user_id);

-- A.2 — delete the auto-injected parent-agency owner from every child sub-account.
-- Keyed on parent.owner_user_id READ PRE-REPOINT (Part D has not run yet) = the
-- historically-injected ancestor identity. The MVCC snapshot of this single DELETE
-- statement reads every parent's owner_user_id as of statement start, so deleting the
-- injected member from an intermediate does not disturb the grandchild's key within
-- the same statement (owner_user_id lives in tenants, not tenant_members).
WITH deleted AS (
  DELETE FROM public.tenant_members tm
   USING public.tenants c
   JOIN  public.tenants parent ON parent.id = c.parent_tenant_id
   WHERE tm.tenant_id = c.id
     AND c.parent_tenant_id IS NOT NULL
     AND parent.account_type IN ('agency','enterprise')
     AND tm.user_id = parent.owner_user_id           -- the injected agency owner (pre-repoint)
  RETURNING tm.tenant_id, tm.user_id
)
INSERT INTO public.paige_audit_log
  (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
SELECT NULL, 'super_admin', 'tenant:deleted_injected_owner', 'tenant_member', d.user_id,
       jsonb_build_object('tenant_id', d.tenant_id, 'issue', '#227', 'part', 'A'),
       d.tenant_id
  FROM deleted d;

-- ============================================================================
-- PART D — FIX tenants.owner_user_id (display-only) → the child's REAL owner.
-- Runs AFTER B (needs the promoted is_owner member) and AFTER A (§227 GAP-3): once the
-- injected parent-owner member is already gone, the child's sole remaining is_owner is
-- the real principal (B), and no false-green multi-level leak can survive the repoint.
-- G2: real_owner EXCLUDES the parent owner (IS DISTINCT FROM) and is deterministic
-- (ROW_NUMBER ORDER BY is_owner DESC, joined_at, user_id) so it never re-points a
-- child's owner_user_id back onto the cleared parent owner, and never picks
-- nondeterministically under co-ownership (#588 class). For an intermediate that is
-- both a child and a parent, this statement's snapshot reads each parent's PRE-repoint
-- owner_user_id, so the grandchild's leaked-pointer test and G2 exclusion stay keyed on
-- the injected ancestor even as the intermediate is repointed in the same statement.
-- ============================================================================
WITH child AS (
  SELECT c.id AS child_id, c.owner_user_id AS cur_owner, parent.owner_user_id AS parent_owner
    FROM public.tenants c
    JOIN public.tenants parent ON parent.id = c.parent_tenant_id
   WHERE c.parent_tenant_id IS NOT NULL
     AND parent.account_type IN ('agency','enterprise')
     AND (c.owner_user_id IS NULL OR c.owner_user_id = parent.owner_user_id)  -- leaked/unset only; never clobber a legit non-parent owner
),
real_owner AS (
  SELECT ch.child_id, tm.user_id,
         ROW_NUMBER() OVER (
           PARTITION BY ch.child_id
           ORDER BY tm.is_owner DESC, tm.joined_at ASC, tm.user_id ASC   -- deterministic total order
         ) AS rn
    FROM child ch
    JOIN public.tenant_members tm
      ON tm.tenant_id = ch.child_id
     AND tm.status   = 'active'
     AND tm.is_owner = true
     AND tm.user_id IS DISTINCT FROM ch.parent_owner   -- G2: never the cleared parent owner
),
did_fix AS (
  UPDATE public.tenants t
     SET owner_user_id = ro.user_id, updated_at = now()
    FROM real_owner ro
   WHERE t.id = ro.child_id
     AND ro.rn = 1
     AND t.owner_user_id IS DISTINCT FROM ro.user_id   -- only when actually wrong (idempotent)
  RETURNING t.id AS child_id, ro.user_id
)
INSERT INTO public.paige_audit_log
  (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
SELECT NULL, 'super_admin', 'tenant:fix_owner_user_id', 'tenant', df.child_id,
       jsonb_build_object('new_owner_user_id', df.user_id, 'issue', '#227', 'part', 'D'),
       df.child_id
  FROM did_fix df;

-- ============================================================================
-- PART C — display-time roster exclusion resolver.
-- Users to EXCLUDE from a tenant's staff roster because they are the OWNER of an
-- ANCESTOR agency/enterprise of this tenant (#215 admin-access != team-membership).
-- Keyed on the REAL parent chain (unforgeable — definer walks tenants.parent_tenant_id,
-- caller supplies only _tenant_id). Needed on EVERY read because agency_enter_subaccount
-- still re-injects the agency owner as a child member on each Open (P4 root cause) — this
-- masks it at display time. Reads the authoritative is_owner, never owner_user_id.
-- S3 dual-role exception (§215): keep a user who is ALSO a real owner of THIS sub-account
-- (a future solo operator who legitimately owns both umbrella and child).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tenant_roster_excluded_user_ids(_tenant_id uuid)
 RETURNS TABLE(user_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_tenant_id, 0 AS depth
      FROM public.tenants WHERE id = _tenant_id
    UNION ALL
    SELECT p.id, p.parent_tenant_id, a.depth + 1
      FROM public.tenants p JOIN ancestors a ON p.id = a.parent_tenant_id
     WHERE a.depth < 10
  )
  SELECT DISTINCT tm.user_id
    FROM ancestors anc
    JOIN public.tenant_members tm
      ON tm.tenant_id = anc.id
     AND tm.is_owner = true
     AND tm.status = 'active'
   WHERE anc.id <> _tenant_id                                   -- strictly ANCESTORS, not self
     AND NOT public.is_tenant_owner(tm.user_id, _tenant_id);    -- S3: keep a real owner of THIS child
$function$;

COMMENT ON FUNCTION public.tenant_roster_excluded_user_ids(uuid) IS
  '#227 Part C (§9/§215): user_ids to hide from a tenant''s staff roster because they '
  'own an ANCESTOR agency/enterprise (admin-access != team-membership). Unforgeable — '
  'walks the real parent chain; reads authoritative is_owner. S3: retains a user who is '
  'also a real owner of THIS tenant.';

REVOKE ALL ON FUNCTION public.tenant_roster_excluded_user_ids(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tenant_roster_excluded_user_ids(uuid) TO authenticated, service_role;

-- ============================================================================
-- PART F — invite mint/accept gating so a 'subaccount_owner' invite establishes the
-- child owner born-correct WITHOUT opening an admin self-mint→accept escalation.
-- Both functions are re-emitted from the LIVE bodies (20260803190000) with ONLY the
-- gated changes inserted; every other branch is byte-identical (a normal staff/'team'
-- invite still lands is_owner=false). Both are postgres-owned SECURITY DEFINER →
-- guard-exempt (the born-correct is_owner=true write is legal without a new exception).
-- ============================================================================

-- F.0 — guard_tenant_owner_only_columns: add a TIGHTLY-SCOPED carve-out so the accept-time
-- born-correct owner (F.2) can be established WITHOUT weakening the guard for any other
-- caller. The guard keys on auth.uid() (not current_user), so accept_tenant_invite — which
-- runs under the real invitee's JWT — previously hit "Only the platform owner may change
-- tenant ownership…" on the shell child's owner_user_id write, aborting the entire accept
-- (DEFECT #2). Rather than defer to a forgeable session GUC, the carve-out defers to the
-- AUTHORITATIVE tenant_members owner: a non-platform caller may write owner_user_id ONLY
-- when ALL of the following hold —
--   • it is establishing ownership on a SHELL (OLD.owner_user_id IS NULL → never a
--     reassignment of an existing owner);
--   • the NEW owner is ALREADY an active is_owner member of that tenant (set inside the
--     SAME accept transaction just before this UPDATE) — tenant_members-consistent, and
--     unforgeable since it is a real membership check, not a flag; AND
--   • NO other guarded column changes in the same UPDATE (billing / hierarchy / stripe
--     ids all IS NOT DISTINCT FROM OLD) — the carve-out is owner_user_id-establishment ONLY.
-- owner_user_id is DISPLAY-ONLY (read by NO authz predicate, 20260803190000), and this can
-- only ever point it at the tenant's already-authoritative owner on a previously-ownerless
-- shell — so it cannot escalate, reassign, or demote. The Layer-1 mint-gate (F.1) and
-- Layer-2 shell-gate (F.2) still fully decide WHO becomes that is_owner member; F.0 only
-- lets the display pointer follow a decision that already passed both gates.
CREATE OR REPLACE FUNCTION public.guard_tenant_owner_only_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_owner() THEN
    RETURN NEW;
  END IF;

  -- #227 DEFECT-2 carve-out: tenant_members-consistent owner ESTABLISHMENT on a shell.
  -- Only owner_user_id may change (NULL → an existing active is_owner member); every
  -- other guarded column must be unchanged.
  IF OLD.owner_user_id IS NULL
     AND NEW.owner_user_id IS NOT NULL
     AND NEW.platform_fee_bps       IS NOT DISTINCT FROM OLD.platform_fee_bps
     AND NEW.parent_tenant_id       IS NOT DISTINCT FROM OLD.parent_tenant_id
     AND NEW.stripe_customer_id     IS NOT DISTINCT FROM OLD.stripe_customer_id
     AND NEW.stripe_subscription_id IS NOT DISTINCT FROM OLD.stripe_subscription_id
     AND EXISTS (
       SELECT 1 FROM public.tenant_members tm
        WHERE tm.tenant_id = NEW.id
          AND tm.user_id   = NEW.owner_user_id
          AND tm.is_owner  = true
          AND tm.status    = 'active'
     ) THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_user_id       IS DISTINCT FROM OLD.owner_user_id
     OR NEW.platform_fee_bps IS DISTINCT FROM OLD.platform_fee_bps
     OR NEW.parent_tenant_id IS DISTINCT FROM OLD.parent_tenant_id
     OR NEW.stripe_customer_id     IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id THEN
    RAISE EXCEPTION 'Only the platform owner may change tenant ownership, billing, or hierarchy';
  END IF;
  RETURN NEW;
END; $function$;

COMMENT ON FUNCTION public.guard_tenant_owner_only_columns() IS
  '#227 F.0 (§9): non-platform callers still cannot change tenant billing/hierarchy or '
  'reassign ownership. ONE carve-out: owner_user_id may be ESTABLISHED (NULL → an already-'
  'active is_owner member of the same tenant) with no other guarded column changing — the '
  'tenant_members-consistent born-correct owner set inside accept_tenant_invite. '
  'owner_user_id is display-only; the carve-out cannot escalate, reassign, or demote.';

-- F.1 — create_tenant_invite_token: Layer-1 mint gate. A 'subaccount_owner' invite
-- ESTABLISHES ownership on accept, so only the agency principal that manages this child
-- (or the platform) may mint it — is_tenant_admin(child) is deliberately NOT sufficient
-- (that is the admin self-mint vector). Narrowing for kind='subaccount_owner' ONLY;
-- every other kind keeps the existing gate (§37: no other producer affected).
CREATE OR REPLACE FUNCTION public.create_tenant_invite_token(_tenant_id uuid, _kind text DEFAULT 'consumer'::text, _default_role tenant_role DEFAULT 'member'::tenant_role, _expires_in_days integer DEFAULT 30, _max_uses integer DEFAULT NULL::integer, _contact_id uuid DEFAULT NULL::uuid, _email text DEFAULT NULL::text)
 RETURNS tenant_invite_tokens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row public.tenant_invite_tokens;
  _new_token text;
  _contact_ok boolean;
BEGIN
  IF NOT (public.is_platform_owner()
          OR public.is_tenant_admin(_tenant_id)
          OR public.agency_can_manage_child(_tenant_id, auth.uid())) THEN
    RAISE EXCEPTION 'not authorized to create invite tokens for this tenant';
  END IF;
  IF _kind NOT IN ('consumer', 'team', 'subaccount_owner', 'agency_team') THEN
    RAISE EXCEPTION 'invalid invite kind: %', _kind;
  END IF;

  -- #227 HOLE#1 Layer-1 (§9): a subaccount_owner invite ESTABLISHES ownership on accept,
  -- so only the agency principal that manages this child (or the platform) may mint it.
  -- is_tenant_admin(child) is deliberately NOT sufficient — that is the admin self-mint vector.
  IF _kind = 'subaccount_owner'
     AND NOT (public.is_platform_owner()
              OR public.agency_can_manage_child(_tenant_id, auth.uid())) THEN
    RAISE EXCEPTION 'only the parent agency (or platform) may mint a sub-account owner invite'
      USING ERRCODE = '42501';
  END IF;

  -- FIX-1 (§9): owner-level invite requires actual ownership, not mere admin.
  IF _default_role = 'owner'::public.tenant_role
     AND NOT (public.is_tenant_owner(auth.uid(), _tenant_id) OR public.is_platform_owner()) THEN
    RAISE EXCEPTION 'not authorized to create an owner-level invite for this tenant; owner elevation is via grant_co_owner()'
      USING ERRCODE = '42501';
  END IF;

  IF _contact_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.clients WHERE id = _contact_id AND tenant_id = _tenant_id
    ) INTO _contact_ok;
    IF NOT _contact_ok THEN
      RAISE EXCEPTION 'contact does not belong to this tenant';
    END IF;
  END IF;

  _new_token := encode(extensions.gen_random_bytes(24), 'base64');
  _new_token := replace(replace(replace(_new_token, '+', '-'), '/', '_'), '=', '');

  INSERT INTO public.tenant_invite_tokens
    (tenant_id, token, kind, default_role, created_by, expires_at, max_uses, contact_id, email)
  VALUES
    (_tenant_id, _new_token, _kind, _default_role, auth.uid(),
     now() + make_interval(days => GREATEST(_expires_in_days, 1)), _max_uses,
     _contact_id, NULLIF(lower(trim(_email)), ''))
  RETURNING * INTO _row;

  RETURN _row;
END $function$;

-- F.2 — accept_tenant_invite: Layer-2 shell-gate on the 'subaccount_owner' branch.
-- Ownership is ESTABLISHED only when (a) the child has NO active is_owner member yet
-- (an un-onboarded shell) AND (b) the token's minter is STILL an authorized principal
-- (agency-over-child or platform, re-checked at accept against _tok.created_by). Anything
-- else — an already-owned/peer child, or a since-demoted minter — degrades to a plain
-- admin seat (is_owner=false) and NEVER mints a second silent co-owner. Every other
-- branch (consumer / agency_team / generic staff ELSE) is byte-identical to the LIVE
-- body: a normal staff invite still lands is_owner=false.
CREATE OR REPLACE FUNCTION public.accept_tenant_invite(_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tok public.tenant_invite_tokens;
  _email text;
  _full text;
  _first text;
  _last text;
  _client_id uuid;
  _existing_tenant uuid;
  _tenant_owner uuid;
  _has_active_owner boolean;   -- #227 Layer-2 shell-gate
  _minter_ok boolean;          -- #227 Layer-2 shell-gate
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'must be signed in to accept an invite';
  END IF;

  SELECT * INTO _tok FROM public.tenant_invite_tokens WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite token not found'; END IF;
  IF _tok.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'invite has been revoked'; END IF;
  IF _tok.expires_at <= now() THEN RAISE EXCEPTION 'invite has expired'; END IF;
  IF _tok.max_uses IS NOT NULL AND _tok.uses >= _tok.max_uses THEN
    RAISE EXCEPTION 'invite has reached its usage limit';
  END IF;

  IF _tok.kind = 'consumer' THEN
    SELECT email, NULLIF(raw_user_meta_data->>'full_name', '')
      INTO _email, _full FROM auth.users WHERE id = _uid;
    SELECT owner_user_id INTO _tenant_owner FROM public.tenants WHERE id = _tok.tenant_id;
    _first := NULLIF(split_part(COALESCE(_full, ''), ' ', 1), '');
    IF _first IS NULL THEN _first := split_part(COALESCE(_email, 'there'), '@', 1); END IF;
    _last := COALESCE(NULLIF(trim(substr(COALESCE(_full, ''), length(split_part(COALESCE(_full, ''), ' ', 1)) + 1)), ''), '');

    SELECT id, tenant_id INTO _client_id, _existing_tenant
      FROM public.clients WHERE linked_user_id = _uid;
    IF _client_id IS NOT NULL THEN
      IF _existing_tenant IS DISTINCT FROM _tok.tenant_id THEN
        RAISE EXCEPTION 'This account is already registered as a client of another workspace. Please accept this invite with a different email address.';
      END IF;
      UPDATE public.clients
         SET status = 'active',
             onboarding_stage = COALESCE(onboarding_stage, 'invited'),
             updated_at = now()
       WHERE id = _client_id;
    ELSE
      IF _tok.contact_id IS NOT NULL THEN
        SELECT id INTO _client_id FROM public.clients
          WHERE id = _tok.contact_id AND tenant_id = _tok.tenant_id AND linked_user_id IS NULL;
      END IF;
      IF _client_id IS NULL THEN
        SELECT id INTO _client_id FROM public.clients
          WHERE tenant_id = _tok.tenant_id AND linked_user_id IS NULL
            AND email IS NOT NULL
            AND lower(email) = lower(COALESCE(_tok.email, _email))
          ORDER BY created_at ASC LIMIT 1;
      END IF;
      IF _client_id IS NOT NULL THEN
        UPDATE public.clients
           SET linked_user_id = _uid, status = 'active',
               onboarding_stage = COALESCE(onboarding_stage, 'invited'), updated_at = now()
         WHERE id = _client_id;
      ELSE
        INSERT INTO public.clients (tenant_id, created_by, email, first_name, last_name, linked_user_id, onboarding_stage, status, created_by_channel_type)
        VALUES (_tok.tenant_id, COALESCE(_tok.created_by, _tenant_owner, _uid), _email, _first, _last, _uid, 'invited', 'active', 'invite')
        RETURNING id INTO _client_id;
      END IF;
    END IF;

    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'client')
    ON CONFLICT (user_id, role) DO NOTHING;

  ELSIF _tok.kind = 'subaccount_owner' THEN
    SELECT email INTO _email FROM auth.users WHERE id = _uid;
    IF _tok.email IS NOT NULL AND lower(_tok.email) <> lower(COALESCE(_email, '')) THEN
      RAISE EXCEPTION 'This invite was sent to a different email address. Accept it while signed in as %', _tok.email;
    END IF;

    -- #227 HOLE#1 Layer-2 SHELL-GATE: establish ownership ONLY on a shell child that has
    -- no active owner yet, AND only when the minter is (still) agency-over-child / platform.
    SELECT EXISTS (
      SELECT 1 FROM public.tenant_members
       WHERE tenant_id = _tok.tenant_id AND is_owner = true AND status = 'active'
    ) INTO _has_active_owner;

    SELECT ( public.is_platform_owner(_tok.created_by)
             OR public.agency_can_manage_child(_tok.tenant_id, _tok.created_by) )
      INTO _minter_ok;

    IF NOT _has_active_owner AND _minter_ok THEN
      -- LEGITIMATE first owner of the shell child, born correct — is_owner=true +
      -- role='owner' in lockstep (guard-exempt: current_user='postgres' inside definer).
      INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at)
      VALUES (_tok.tenant_id, _uid, 'owner'::public.tenant_role, 'active', true, now())
      ON CONFLICT (tenant_id, user_id) DO UPDATE
        SET is_owner  = true,
            role      = 'owner'::public.tenant_role,
            status    = 'active',
            joined_at = COALESCE(public.tenant_members.joined_at, now()),
            updated_at = now();

      -- Display-only owner_user_id parity: set ONLY when still unset (never overwrite a
      -- real owner_user_id; Parts B/D reconcile the historically-leaked pointer).
      UPDATE public.tenants
         SET owner_user_id = _uid, updated_at = now()
       WHERE id = _tok.tenant_id AND owner_user_id IS NULL;

      INSERT INTO public.paige_audit_log
        (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
      VALUES (_uid, 'owner', 'tenant:subaccount_owner_established', 'tenant_member', _uid,
              jsonb_build_object('tenant_id', _tok.tenant_id, 'lane', 'auto', 'via', 'accept_tenant_invite'),
              _tok.tenant_id);
    ELSE
      -- Already-owned / peer child, or minter no longer authorized → plain admin seat.
      -- is_owner pinned FALSE on fresh insert; ON CONFLICT preserves an existing owner
      -- (lockstep) and NEVER raises is_owner — no second silent co-owner.
      INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at)
      VALUES (_tok.tenant_id, _uid, 'admin'::public.tenant_role, 'active', false, now())
      ON CONFLICT (tenant_id, user_id) DO UPDATE
        SET role = (CASE WHEN public.tenant_members.role = 'owner'::public.tenant_role
                         THEN 'owner'::public.tenant_role
                         ELSE 'admin'::public.tenant_role END),
            status = 'active',
            joined_at = COALESCE(public.tenant_members.joined_at, now()),
            updated_at = now();
    END IF;

  ELSIF _tok.kind = 'agency_team' THEN
    SELECT email INTO _email FROM auth.users WHERE id = _uid;
    IF _tok.email IS NOT NULL AND lower(_tok.email) <> lower(COALESCE(_email, '')) THEN
      RAISE EXCEPTION 'This invite was sent to a different email address. Accept it while signed in as %', _tok.email;
    END IF;
    IF _tok.agency_role IS NULL OR _tok.agency_role NOT IN
       ('agency_admin','agency_manager','agency_biller','agency_specialist','agency_viewer') THEN
      RAISE EXCEPTION 'This agency invite is missing a valid role. Ask the agency to resend it.';
    END IF;

    DELETE FROM public.agency_team_members
     WHERE agency_tenant_id = _tok.tenant_id
       AND user_id IS NULL
       AND email IS NOT NULL
       AND lower(email) = lower(COALESCE(_email, ''));

    UPDATE public.agency_team_members
       SET agency_role = _tok.agency_role,
           status = 'active',
           email = COALESCE(email, _email),
           joined_at = COALESCE(joined_at, now()),
           updated_at = now()
     WHERE agency_tenant_id = _tok.tenant_id AND user_id = _uid;
    IF NOT FOUND THEN
      INSERT INTO public.agency_team_members
        (agency_tenant_id, user_id, email, agency_role, status, invited_by, invited_at, joined_at)
      VALUES
        (_tok.tenant_id, _uid, _email, _tok.agency_role, 'active', _tok.created_by, _tok.created_at, now());
    END IF;

  ELSE
    -- SECURITY (Tier Rail Phase A): a generic staff/'team' invite may only grant
    -- tenant_members on a NON-agency tenant.
    IF (SELECT account_type FROM public.tenants WHERE id = _tok.tenant_id)
         IN ('agency','enterprise') THEN
      RAISE EXCEPTION 'Staff invites cannot grant access on an agency or enterprise account. Use an agency team invite instead.';
    END IF;

    -- FIX-1 (§9): an invite NEVER mints or elevates ownership. Owner elevation is
    -- EXCLUSIVELY grant_co_owner(). Fresh seat: is_owner pinned false; any owner
    -- default_role coerced to 'admin' (keeps role/is_owner lockstep). ON CONFLICT:
    -- is_owner and role left UNTOUCHED — see §13 NOTE below.
    INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at)
    VALUES (
      _tok.tenant_id, _uid,
      (CASE WHEN _tok.default_role = 'owner'::public.tenant_role
            THEN 'admin'::public.tenant_role ELSE _tok.default_role END),
      'active', false, now())
    ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET status = 'active',
          joined_at = COALESCE(public.tenant_members.joined_at, now()),
          updated_at = now();
    -- §13 NOTE (deliberate deviation from the literal "force is_owner=false on the ON
    -- CONFLICT"): the conflict path intentionally does NOT write is_owner or role. It
    -- cannot ESCALATE (a returning member keeps their existing bit; only grant_co_owner
    -- raises it) and it must NOT force-clear it, which would DEMOTE / last-owner-strip a
    -- legitimate owner who re-accepts a staff invite. Escalation is fully closed at the
    -- fresh-INSERT (pins false) + the create-side owner-token rejection.
  END IF;

  UPDATE public.tenant_invite_tokens SET uses = uses + 1, last_used_at = now() WHERE id = _tok.id;
  UPDATE public.profiles SET active_tenant_id = _tok.tenant_id WHERE user_id = _uid;

  RETURN _tok.tenant_id;
END $function$;
