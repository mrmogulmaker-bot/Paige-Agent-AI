-- AN APPROVAL MUST MEAN "THIS EXACT THING, ONCE" — AND MUST BE REACHABLE.
--
-- WHAT WAS ALREADY TRUE, AND WHY IT WAS NOT ENOUGH. The gate in `paige-ai-chat` refuses a mutating
-- tool the first time, shows the operator a summary, and waits. Until now the entire re-entry test
-- was `confirm === true` — a BOOLEAN. Nothing tied the arguments the model emitted the second time
-- to the ones the summary described, so a different amount, a different recipient or a different
-- client all passed as "approved".
--
-- The first repair fingerprinted the call and required the surface to echo the fingerprint back.
-- Independent review found that shipped a worse failure than the one it fixed:
--
--   1. Five of the six shipped chat surfaces never send the echo, so EVERY confirm-gated tool
--      became permanently un-executable on them (§58 — a shipped capability removed in silence).
--   2. `update_client_data` is the ONLY tool a client-portal seat may call. Gated, with no confirm
--      affordance on that surface, the Client tier lost its single write outright.
--   3. Even where the echo works, the model had to RE-AUTHOR the arguments byte-identically from a
--      transcript that truncates them. For a tool carrying model-written free text — a whole
--      document in `blocks` — that is not merely hard, it is a livelock: the person clicks Approve
--      and gets the same card back, forever.
--   4. Forty-five of the forty-eight gated tools never declared a `confirm` parameter at all, so
--      the model could not set the flag the gate was testing even when it wanted to.
--
-- THE FIX IS TO STOP ASKING THE MODEL TO REPRODUCE THE CALL. The proposed call is persisted HERE,
-- server-side, under its fingerprint. Approval carries a TOKEN, not arguments, and the gate
-- executes the STORED arguments — the exact ones whose summary the person read. The model cannot
-- drift them because it never restates them. If the person amends the request, the model emits
-- fresh arguments with NO token, which is a NEW proposal and gets a NEW summary — which is right,
-- because a changed action deserves a fresh look.
--
-- This is the same lesson as the extraction proposal in 20261019000000: an approval names WHAT was
-- approved and is redeemed once, rather than setting a flag that means "something was fine".

CREATE TABLE IF NOT EXISTS public.paige_pending_confirmations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHOSE approval this is. The row belongs to the person who was shown the summary; nobody else
  -- may redeem it, which is why `user_id` and not merely the tenant is the load-bearing predicate.
  user_id          uuid NOT NULL,
  -- Nullable ON PURPOSE: a platform operator has no tenant. RLS still requires the tenant to match
  -- whenever one is present, so a tenanted row can never be redeemed from another tenant's session.
  tenant_id        uuid REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- WHERE it was proposed. An approval issued in one conversation must not execute in another.
  -- Null for the surfaces that carry no thread (the client portal, document-only calls).
  thread_id        uuid,

  -- WHICH client was in focus when the summary was written. A focus change ends the conversation
  -- (the same rule the transcript reset enforces), so it is part of the claim predicate rather
  -- than a check made after the row has already been burned.
  scoped_client_id uuid,

  tool_name        text NOT NULL,
  -- The 64-bit digest of (tool, normalised arguments). Deterministic, so re-proposing the same call
  -- yields the same token and a changed call provably does not.
  fingerprint      text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{16}$'),

  -- THE ARGUMENTS THAT WILL ACTUALLY RUN. Not a record of what was asked — the thing itself.
  args             jsonb NOT NULL,
  -- The sentence the person read. Kept so the audit answers "what did they actually see?" with
  -- the text, rather than with a re-render that may since have changed.
  summary          text NOT NULL,

  created_at       timestamptz NOT NULL DEFAULT now(),
  -- An approval goes stale. Half an hour is long enough for a person to think and short enough
  -- that a token left in an abandoned tab is not a live authorisation tomorrow.
  expires_at       timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  -- SINGLE USE. Set by the same UPDATE that reads the row, so two identical tool calls in one
  -- round claim once and the second finds nothing. Replay is prevented by the claim, not by a
  -- convention the caller is trusted to follow.
  consumed_at      timestamptz
);

-- The claim's exact predicate, so redeeming is an index hit and not a scan of every proposal.
CREATE INDEX IF NOT EXISTS idx_paige_pending_confirmations_claim
  ON public.paige_pending_confirmations (user_id, fingerprint)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_paige_pending_confirmations_sweep
  ON public.paige_pending_confirmations (expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.paige_pending_confirmations ENABLE ROW LEVEL SECURITY;

-- RESTRICTIVE first, so no permissive policy added later can widen it. The predicate is `user_id`
-- ALONE, and that is a deliberate correction rather than an omission.
--
-- The first draft also required `tenant_id = current_user_tenant_id()`. The proof caught it: the
-- owner could not read their OWN rows. Re-deriving the tenant at read time can only ever DENY a row
-- the caller already owns — it cannot admit one, because `user_id = auth.uid()` has already settled
-- who may see it — so the clause carried all of the risk of a resolver disagreement and none of the
-- benefit. #588 is the standing proof that this resolver CAN disagree with the tenant a request is
-- actually running as, and the symptom here would have been the exact silent livelock this table
-- exists to remove: an approval a person can create and then never redeem.
--
-- Tenant scope is NOT abandoned; it moves to the claim predicate in `paige-ai-chat`, which compares
-- the stored `tenant_id` against the SAME resolved tenant the insert used. Both sides then read one
-- value instead of two independently-derived ones, so they cannot drift apart (§9/§57).
DROP POLICY IF EXISTS paige_pending_confirmations_own ON public.paige_pending_confirmations;
CREATE POLICY paige_pending_confirmations_own
  ON public.paige_pending_confirmations AS RESTRICTIVE FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- The permissive grant. Deliberately the SAME predicate rather than a looser one: there is no
-- operator escape here on purpose. A platform owner reading another person's pending approvals
-- would be reading an authorisation addressed to someone else, and no surface needs that. An
-- approval is addressed to a PERSON, not to a tenant, which is why identity and not tenancy is the
-- boundary on this one table.
DROP POLICY IF EXISTS paige_pending_confirmations_rw ON public.paige_pending_confirmations;
CREATE POLICY paige_pending_confirmations_rw
  ON public.paige_pending_confirmations FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.paige_pending_confirmations TO authenticated;
GRANT ALL ON public.paige_pending_confirmations TO service_role;

COMMENT ON TABLE public.paige_pending_confirmations IS
  'A mutating tool call that has been PROPOSED to a person and is waiting on their yes. Holds the exact arguments that will run, so approval carries a token rather than a restatement of the call — the model never re-authors what was approved, and cannot drift it. Claimed by a compare-and-set on consumed_at, so one approval executes exactly once.';

-- ── §32 PROOF — driven against production Postgres inside BEGIN..ROLLBACK, 2026-08-31 ──
--
-- Twelve cases, all passing. Two are NEGATIVE CONTROLS: they prove a specific choice in this file
-- is load-bearing rather than decorative, by showing the obvious alternative fails.
--
--   C1  the happy claim returns the STORED args ......................... 1 row  {"amount": 250}
--   C2  replaying the same approval claims nothing ..................... 0 rows  single-use
--   C3  drifted arguments claim nothing ................................ 0 rows  re-propose instead
--   C4  after an ACCOUNT switch the old approval claims nothing ........ 0 rows  tenant bound at claim
--   C5  after a CLIENT-focus switch the old approval claims nothing .... 0 rows  focus bound
--   C6  a stranger's approval is not redeemable ........................ 0 rows  bound to user_id
--   C7  NEGATIVE CONTROL — bare `=` on a NULL thread matches nothing ... 0 rows  see below
--   C8  the client-portal seat (no thread) CAN claim ................... 1 row   the released blocker
--   C9  a malformed fingerprint is rejected ............................ 23514
--   C10 RLS: a stranger sees none of the owner's approvals ............. 0 rows
--   C11 RLS: the owner CAN read their own ............................. 4 rows
--   C12 RLS: the owner still cannot see the stranger's ................. 0 rows
--
-- C7 pairs with C8 and is why the claim uses `IS NOT DISTINCT FROM` and not `=`. A bare equality
-- against NULL yields NULL, so with `=` the client portal — which legitimately has no thread and no
-- focused client — could never redeem anything, and the tier that lost its only write to this gate
-- would have stayed broken by a subtler mechanism than the one being fixed.
--
-- C11 FAILED ON THE FIRST RUN, returning 0 instead of 4, and that failure changed this file. The
-- RESTRICTIVE policy also required `tenant_id = current_user_tenant_id()`, which meant a caller
-- could be denied their OWN row whenever that resolver disagreed with the tenant the request was
-- actually running as — a disagreement #588 proves is real. The clause could only ever deny, never
-- admit, so it was removed and tenant scope moved to the claim predicate where both sides read one
-- value. Recorded because a proof that only ever confirms what its author already believed is not
-- a proof.
