-- S2 · purpose clause 2 — "an account/client switch can never carry prior tenant or client
-- Knowledge into the new conversation."
--
-- THE HOLE. `paige_chat_turn_append` is SECURITY DEFINER, so it runs as the owner and RLS on
-- `paige_chat_threads` / `paige_chat_turns` does not apply to it. Its only caller guard is
-- `caller_user_id = auth.uid()` — ownership, with no tenant predicate at all. A user who owns a
-- thread in workspace A, while their active workspace is B, can append turns to that thread by
-- passing its id in the request body. Reads stay fenced (the RESTRICTIVE policy
-- `threads_tenant_isolation` covers SELECT), so this is a WRITE hole rather than a read leak:
-- the caller cannot see A's transcript from B, but they can grow it, and what they write is a
-- turn assembled under B's scope filed into A's thread.
--
-- Found by a read-only audit of this seam, not by a report. It is the DB half of the same rule
-- the front end now enforces on the transcript array.
--
-- THE PREDICATE mirrors `paige_chat_thread_create` (20260803170000), which is the function that
-- decides a thread's tenant in the first place. Three thread shapes exist and all three stay
-- reachable:
--
--   contact-bound  tenant_id = the client's tenant   → must equal the caller's active tenant
--   self / coach   tenant_id = current_user_tenant_id() at creation → same
--   platform lens  tenant_id IS NULL (operator)      → `is_platform_owner()`
--
-- `IS NOT DISTINCT FROM` rather than `=` so the tenant-less platform operator, whose
-- `current_user_tenant_id()` is legitimately NULL, matches their own NULL-tenant thread instead
-- of being refused by NULL = NULL evaluating to NULL. The second branch additionally lets an
-- operator who has ENTERED a tenant (so their active tenant is no longer NULL) keep appending to
-- their own platform thread — that is the §9 support path and removing it would be a regression.
--
-- §37 PRODUCER INVENTORY — every caller walked before tightening, all eight classes:
--   frontend            none. The client never writes turns; the server is the sole writer
--                       (`usePaigeThreads.ts` states this explicitly).
--   sibling edge fns    `paige-ai-chat` (user turn + assistant turn) and `paige-context-router`
--                       (user turn + assistant turn). ALL FOUR call it on a JWT-scoped client
--                       built from the anon key with the caller's Authorization header, so
--                       `auth.uid()` and `current_user_tenant_id()` both resolve normally and the
--                       new predicate is evaluated against the real caller. A service-role caller
--                       would already have failed the pre-existing `auth required` raise, so no
--                       such caller can exist today.
--   db triggers         none.
--   pg_cron / pg_net    none.
--   GitHub Actions      none.
--   external webhooks   none.
--   n8n / Zapier / MCP  none. `paige-mcp` does not call this function.
--   tests / scripts     `scripts/knowledge-scope` asserts on it through its fake (no live DB);
--                       `supabase/tests/slice_e_agency_thread_delete_block.sql` names it in a
--                       comment only.
--
-- §51 TIER-AWARE INVENTORY — the §37 list above names WHO calls this; this names FROM WHICH TIER,
-- because the same request resolves differently per tier and that is the axis this predicate turns
-- on. Added after a reviewer pointed out the first version named four callers and zero tiers.
--   God / Super Admin   `paige-ai-chat` on a platform-lens thread (tenant_id NULL) → second
--                       disjunct. On a CONTACT-BOUND thread in another tenant, via
--                       `paige-context-router` support routing → third disjunct. Both allowed.
--   Agency              acting in its own workspace → first disjunct. Acting on a sub-account it
--                       has switched INTO, its active tenant is that sub-account, so the thread's
--                       tenant matches → allowed. Acting on a sub-account WITHOUT switching in is
--                       refused, which is the same answer the read policy already gives.
--   Standalone / Solo   own workspace → first disjunct.
--   Sub-account         own workspace → first disjunct; the parent's threads are refused, as they
--                       are for reads.
--   Client (portal)     has no `tenant_members` row, so `current_user_tenant_id()` is NULL and a
--                       tenanted thread is refused by the first disjunct — but the portal does not
--                       send a `threadId` at all (it does not persist), so no live caller is
--                       affected. Recorded because "no caller today" is not "no caller ever".
--   Anonymous           `auth.uid()` is NULL → the pre-existing `auth required` raise, before any
--                       of this.
--
-- Signature and grants are unchanged, so no caller needs to change its argument list.

-- §32 PROOF, driven against PRODUCTION Postgres inside BEGIN..ROLLBACK (nothing persisted). The
-- fixture is a REAL user with several real tenant memberships and two of their own real tenants —
-- the one their profile calls active and another they also belong to. No data was fabricated.
--
--   NEGATIVE CONTROL (shipped body, migration NOT applied):
--     foreign-workspace append -> NOT RAISED
--     turns visible to the caller afterwards      -> 0
--     turns actually present (counted as owner)   -> 1
--   The 0/1 split is the shape of the defect: the caller writes a turn into another workspace's
--   thread and then cannot read it back, because RLS on `paige_chat_turns` mirrors the thread
--   predicate the DEFINER function skipped. A write-only hole, not a read leak.
--
--   WITH THIS MIGRATION APPLIED:
--     impersonation actually took effect (auth.uid() = the fixture user) -> true
--     foreign-workspace append -> RAISED 'thread belongs to a different workspace'
--     own-workspace append     -> ALLOWED
--
-- The legitimate call is proven still to work, not merely assumed; a guard that refuses the
-- honest caller is worse than the hole. Separately, the RESTRICTIVE `threads_tenant_isolation`
-- policy refused to let `authenticated` even INSERT the foreign fixture thread, which is the
-- read/insert half being fenced correctly and is not what this migration changes.
--
-- PREDICATE TRUTH TABLE, driven on production Postgres inside BEGIN..ROLLBACK. Seven cases, each
-- one an argument someone made about this predicate; all seven match expectation:
--
--   tenant user, own workspace ................................ ALLOWED
--   tenant user, FOREIGN workspace ............................ REFUSED   ← the hole this closes
--   tenant user whose active tenant is NULL ................... REFUSED
--   NON-owner appending to a NULL-tenant thread ............... REFUSED   ← the bare-IS-NOT-DISTINCT residue
--   operator, own platform thread ............................. ALLOWED
--   operator who has ENTERED a tenant, own platform thread .... ALLOWED
--   operator, contact-bound thread in another tenant .......... ALLOWED   ← the support flow
--
-- §32 OWED, stated rather than implied: a rollback proof shows the SQL RUNS. It does not show the
-- migration is LIVE. The persisted-apply confirmation — `supabase_migrations.schema_migrations`
-- advanced past this version on prod AND the new body present in `pg_get_functiondef` — is owed
-- after merge and is not claimed here.

CREATE OR REPLACE FUNCTION public.paige_chat_turn_append(
  p_thread_id uuid, p_role text, p_content text, p_surfaces_used text[],
  p_load_id uuid, p_model text, p_tokens_used int, p_latency_ms int,
  p_bundle_ref jsonb, p_tool_calls jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_turn uuid;
  v_owner uuid;
  v_tenant uuid;
  v_found boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_role NOT IN ('user','assistant','system') THEN RAISE EXCEPTION 'invalid role'; END IF;

  -- One read for both checks. `v_found` is tracked separately because a thread's tenant_id is
  -- legitimately NULL for the platform lens, so "v_tenant IS NULL" cannot mean "no such thread".
  SELECT caller_user_id, tenant_id
    INTO v_owner, v_tenant
    FROM public.paige_chat_threads
   WHERE id = p_thread_id;
  -- FOUND, not a sentinel column. `SELECT … INTO` on zero rows assigns NULL to EVERY target,
  -- including a literal `true`, so `v_found` would have been NULL and `IF NOT NULL` skips its
  -- branch — the 'thread not found' raise was unreachable and every missing thread reported
  -- 'thread not owned by caller' instead. Caught by an independent reviewer running the body
  -- against a real Postgres. Security was unaffected (the owner check still raised); the message
  -- was wrong and the comment described a mechanism that did not work.
  v_found := FOUND;

  IF NOT v_found THEN RAISE EXCEPTION 'thread not found'; END IF;
  IF v_owner IS NULL OR v_owner <> v_uid THEN RAISE EXCEPTION 'thread not owned by caller'; END IF;

  IF NOT (
       -- A TENANTED thread: the caller's active workspace must be that tenant. `IS NOT DISTINCT
       -- FROM` guarded by `IS NOT NULL` rather than bare, because bare NULL-matching admits a
       -- caller whose active tenant is NULL to any NULL-tenant thread and quietly bypasses the
       -- operator gate below. Plain `=` is worse still: it yields NULL, `IF NOT (NULL)` skips the
       -- raise, and the guard fails OPEN on every NULL. Both variants were driven.
       (v_tenant IS NOT NULL AND v_tenant IS NOT DISTINCT FROM public.current_user_tenant_id())
       -- A PLATFORM thread (tenant_id NULL) belongs to an operator, including one who has ENTERED
       -- a tenant and therefore no longer has a NULL active tenant.
    OR (v_tenant IS NULL AND public.is_platform_owner() IS TRUE)
       -- THE OPERATOR ESCAPE FOR A TENANTED THREAD, which the first version of this predicate did
       -- not have. `paige-context-router` creates CONTACT-BOUND threads, and
       -- `paige_chat_thread_create` takes such a thread's tenant straight from `clients.tenant_id`
       -- with no caller check — while the `clients` policy admits a cross-tenant read to
       -- `is_platform_owner()`. So a super_admin running the support flow could create a thread
       -- bound to another tenant's client and then be refused when appending to it, returning an
       -- error and leaving an orphan thread row. Found by a reviewer driving the shipped body
       -- against a local Postgres, not on prod.
       --
       -- `is_platform_owner()` (super_admin) rather than `is_platform_operator()`: this mirrors the
       -- gate `paige_chat_thread_create` already uses for the platform lens, so the set that can
       -- CREATE such a thread is exactly the set that can append to it. Widening both together is
       -- §53's migration and belongs to that change, not this one.
    OR public.is_platform_owner() IS TRUE
  ) THEN
    RAISE EXCEPTION 'thread belongs to a different workspace';
  END IF;

  INSERT INTO public.paige_chat_turns
    (thread_id, role, content, surfaces_used, load_id, model,
     tokens_used, latency_ms, bundle_ref, tool_calls)
  VALUES
    (p_thread_id, p_role, p_content, p_surfaces_used, p_load_id, p_model,
     p_tokens_used, p_latency_ms, p_bundle_ref, p_tool_calls)
  RETURNING id INTO v_turn;

  UPDATE public.paige_chat_threads
     SET message_count   = message_count + 1,
         last_message_at = now(),
         auto_delete_at  = now() + interval '90 days',   -- sliding window (20260711300000)
         updated_at      = now()
   WHERE id = p_thread_id;

  RETURN v_turn;
END;
$$;

REVOKE ALL ON FUNCTION public.paige_chat_turn_append(uuid,text,text,text[],uuid,text,int,int,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paige_chat_turn_append(uuid,text,text,text[],uuid,text,int,int,jsonb,jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.paige_chat_turn_append(uuid,text,text,text[],uuid,text,int,int,jsonb,jsonb) IS
  'Appends a turn to a Paige chat thread. SECURITY DEFINER, so it enforces caller scope IN-BODY (§59): the caller must own the thread AND the thread must belong to the caller''s active workspace, or be a NULL-tenant platform thread the caller is a platform owner of.';
